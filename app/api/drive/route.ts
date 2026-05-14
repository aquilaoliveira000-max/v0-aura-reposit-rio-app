import { NextRequest, NextResponse } from 'next/server'
import { createSign } from 'crypto'

const SA_EMAIL = process.env.GOOGLE_SA_EMAIL || ''
const SA_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const ROOT_FOLDER = 'Uploads +Aura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Auth ──────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const sig = sign.sign(SA_KEY, 'base64url')
  const jwt = `${header}.${payload}.${sig}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Auth falhou: ' + JSON.stringify(data))
  return data.access_token
}

// ── Drive helpers ──────────────────────────────────────────────────────
async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const data = await res.json()
  if (data.files && data.files.length > 0) return data.files[0].id

  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  })
  const folder = await create.json()
  return folder.id
}

async function resolvePath(token: string, folderPath: string): Promise<string> {
  // Encontra/cria a pasta raiz "Uploads +Aura"
  const rootQ = `name='${ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const rootRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootQ)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const rootData = await rootRes.json()
  let currentId: string

  if (rootData.files && rootData.files.length > 0) {
    currentId = rootData.files[0].id
  } else {
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ROOT_FOLDER, mimeType: 'application/vnd.google-apps.folder' })
    })
    const f = await create.json()
    currentId = f.id
  }

  if (!folderPath) return currentId

  const parts = folderPath.split('/').filter(p => p.trim())
  for (const part of parts) {
    currentId = await findOrCreateFolder(token, part.trim(), currentId)
  }
  return currentId
}

// ── Handlers ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    // Upload de arquivo (multipart — chunk ou arquivo pequeno)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File
      const folderPath = (formData.get('folderPath') as string) || ''
      const sessionUri = formData.get('sessionUri') as string | null
      const chunkStart = parseInt((formData.get('chunkStart') as string) || '0')
      const totalSize = parseInt((formData.get('totalSize') as string) || '0')

      if (!file) return NextResponse.json({ success: false, error: 'Nenhum arquivo' })

      const token = await getToken()
      const buffer = await file.arrayBuffer()
      const chunkEnd = chunkStart + buffer.byteLength - 1
      const isLast = chunkEnd + 1 >= totalSize

      // Primeiro chunk — inicia sessão resumível
      if (!sessionUri) {
        const folderId = await resolvePath(token, folderPath)
        const initRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Type': file.type || 'application/octet-stream',
              'X-Upload-Content-Length': totalSize.toString(),
            },
            body: JSON.stringify({ name: file.name, parents: [folderId] })
          }
        )
        if (!initRes.ok) {
          const err = await initRes.text()
          return NextResponse.json({ success: false, error: 'Erro ao iniciar upload: ' + err })
        }
        const newSessionUri = initRes.headers.get('location')!

        // Envia o primeiro chunk
        const uploadRes = await fetch(newSessionUri, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${isLast ? totalSize : '*'}`,
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: buffer,
        })

        if (uploadRes.status === 200 || uploadRes.status === 201) {
          const fileData = await uploadRes.json()
          return NextResponse.json({ success: true, done: true, fileId: fileData.id, sessionUri: newSessionUri })
        }

        return NextResponse.json({ success: true, done: false, sessionUri: newSessionUri })
      }

      // Chunks subsequentes
      const uploadRes = await fetch(sessionUri, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${isLast ? totalSize : '*'}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: buffer,
      })

      if (uploadRes.status === 200 || uploadRes.status === 201) {
        const fileData = await uploadRes.json()
        return NextResponse.json({ success: true, done: true, fileId: fileData.id })
      }

      if (uploadRes.status === 308) {
        return NextResponse.json({ success: true, done: false, sessionUri })
      }

      const errText = await uploadRes.text()
      return NextResponse.json({ success: false, error: `Erro chunk: ${uploadRes.status} ${errText}` })
    }

    // Ações JSON (delete, rename, mkdir, list, move)
    const body = await req.json()
    const { action } = body
    const token = await getToken()

    if (action === 'list') {
      const folderId = await resolvePath(token, body.folderPath || '')
      const q = `'${folderId}' in parents and trashed=false`
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime)&pageSize=1000`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      const folders = data.files?.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder')
        .map((f: any) => ({ id: f.id, name: f.name, type: 'folder' })) || []
      const files = data.files?.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder')
        .map((f: any) => ({ id: f.id, name: f.name, type: 'file', size: parseInt(f.size || '0'), createdAt: f.createdTime })) || []
      return NextResponse.json({ success: true, folders, files })
    }

    if (action === 'delete') {
      await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'deleteFolder') {
      await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'createFolder') {
      const parentId = await resolvePath(token, body.folderPath || '')
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
      })
      const data = await res.json()
      return NextResponse.json({ success: true, id: data.id, name: data.name })
    }

    if (action === 'rename') {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name })
      })
      const data = await res.json()
      return NextResponse.json({ success: true, name: data.name })
    }

    if (action === 'move') {
      // Busca parents atuais
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}?fields=parents`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const meta = await metaRes.json()
      const oldParents = (meta.parents || []).join(',')
      const newParentId = await resolvePath(token, body.targetPath || '')

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${body.id}?addParents=${newParentId}&removeParents=${oldParents}&fields=id`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      )
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ success: false, error: err })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Ação desconhecida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const folderPath = searchParams.get('folderPath') || ''
    const token = await getToken()
    const folderId = await resolvePath(token, folderPath)

    const q = `'${folderId}' in parents and trashed=false`
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime)&pageSize=1000`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    const folders = data.files?.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder')
      .map((f: any) => ({ id: f.id, name: f.name, type: 'folder' })) || []
    const files = data.files?.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder')
      .map((f: any) => ({ id: f.id, name: f.name, type: 'file', size: parseInt(f.size || '0'), createdAt: f.createdTime })) || []
    return NextResponse.json({ success: true, folders, files })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
