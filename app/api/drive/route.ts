import { NextRequest, NextResponse } from 'next/server'

const ROOT_FOLDER = 'Uploads +Aura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cache de token — evita renovação a cada chunk
let _cachedToken: string | null = null
let _tokenExpiry = 0

async function getToken(): Promise<string> {
  const now = Date.now()
  // Reutiliza token se ainda válido (com 2 min de margem)
  if (_cachedToken && _tokenExpiry - now > 120_000) {
    return _cachedToken
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Variáveis OAuth não configuradas')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error('Falha ao obter token: ' + JSON.stringify(data))

  _cachedToken = data.access_token
  _tokenExpiry = now + (data.expires_in || 3600) * 1000
  return _cachedToken!
}

async function driveGet(path: string, token: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.json()
}

async function drivePost(path: string, body: object, token: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const data = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime`, token)
  if (data.files?.length > 0) return data.files[0].id
  const folder = await drivePost('files', { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, token)
  await new Promise(r => setTimeout(r, 200))
  const check = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime`, token)
  return check.files?.[0]?.id || folder.id
}

async function resolvePath(token: string, folderPath: string): Promise<string> {
  const rootQ = `name='${ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const rootData = await driveGet(`files?q=${encodeURIComponent(rootQ)}&fields=files(id)`, token)
  let currentId: string

  if (rootData.files?.length > 0) {
    currentId = rootData.files[0].id
  } else {
    const f = await drivePost('files', { name: ROOT_FOLDER, mimeType: 'application/vnd.google-apps.folder' }, token)
    currentId = f.id
  }

  if (!folderPath) return currentId
  for (const part of folderPath.split('/').filter(p => p.trim())) {
    currentId = await findOrCreateFolder(token, part.trim(), currentId)
  }
  return currentId
}

export async function GET(req: NextRequest) {
  try {
    const folderPath = new URL(req.url).searchParams.get('folderPath') || ''
    const token = await getToken()
    const folderId = await resolvePath(token, folderPath)
    const q = `'${folderId}' in parents and trashed=false`
    const data = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink)&pageSize=1000`, token)
    const folders = (data.files || []).filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').map((f: any) => ({ id: f.id, name: f.name, type: 'folder' }))
    const files = (data.files || []).filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder').map((f: any) => ({ id: f.id, name: f.name, type: 'file', size: parseInt(f.size || '0'), createdAt: f.createdTime }))
    return NextResponse.json({ success: true, folders, files })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

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

      if (!sessionUri) {
        const folderId = await resolvePath(token, folderPath)
        const initRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': file.type || 'application/octet-stream',
            'X-Upload-Content-Length': totalSize.toString(),
          },
          body: JSON.stringify({ name: file.name, parents: [folderId] })
        })
        if (!initRes.ok) return NextResponse.json({ success: false, error: 'Erro ao iniciar upload: ' + await initRes.text() })
        const newSessionUri = initRes.headers.get('location')!
        const uploadRes = await fetch(newSessionUri, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${isLast ? totalSize : '*'}`,
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: buffer,
        })
        if (uploadRes.status === 200 || uploadRes.status === 201) {
          return NextResponse.json({ success: true, done: true, sessionUri: newSessionUri })
        }
        return NextResponse.json({ success: true, done: false, sessionUri: newSessionUri })
      }

      const uploadRes = await fetch(sessionUri, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${isLast ? totalSize : '*'}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: buffer,
      })
      if (uploadRes.status === 200 || uploadRes.status === 201) return NextResponse.json({ success: true, done: true })
      if (uploadRes.status === 308) return NextResponse.json({ success: true, done: false, sessionUri })
      return NextResponse.json({ success: false, error: `Erro chunk ${uploadRes.status}: ` + await uploadRes.text() })
    }

    const body = await req.json()
    const { action } = body
    const token = await getToken()

    if (action === 'list') {
      const folderId = await resolvePath(token, body.folderPath || '')
      const q = `'${folderId}' in parents and trashed=false`
      const data = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink)&pageSize=1000`, token)
      const folders = (data.files || []).filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').map((f: any) => ({ id: f.id, name: f.name, type: 'folder' }))
      const files = (data.files || []).filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder').map((f: any) => ({ id: f.id, name: f.name, type: 'file', size: parseInt(f.size || '0'), createdAt: f.createdTime, thumbnailLink: f.thumbnailLink, webViewLink: f.webViewLink, mimeType: f.mimeType }))
      return NextResponse.json({ success: true, folders, files })
    }

    if (action === 'delete' || action === 'deleteFolder') {
      await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'createFolder') {
      const parentId = await resolvePath(token, body.folderPath || '')
      const f = await drivePost('files', { name: body.name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, token)
      return NextResponse.json({ success: true, id: f.id, name: f.name })
    }

    if (action === 'rename') {
      await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name })
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'move') {
      const meta = await driveGet(`files/${body.id}?fields=parents`, token)
      const oldParents = (meta.parents || []).join(',')
      const newParentId = await resolvePath(token, body.targetPath || '')
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${body.id}?addParents=${newParentId}&removeParents=${oldParents}&fields=id`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!res.ok) return NextResponse.json({ success: false, error: await res.text() })
      return NextResponse.json({ success: true })
    }

    if (action === 'listById') {
      const q = `'${body.id}' in parents and trashed=false`
      const data = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime)&pageSize=1000`, token)
      const folders = (data.files || []).filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').map((f: any) => ({ id: f.id, name: f.name, type: 'folder' }))
      const files = (data.files || []).filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder').map((f: any) => ({ id: f.id, name: f.name, type: 'file', size: parseInt(f.size || '0'), mimeType: f.mimeType }))
      return NextResponse.json({ success: true, folders, files })
    }

    return NextResponse.json({ success: false, error: 'Ação desconhecida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
