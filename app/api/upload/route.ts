import { NextRequest, NextResponse } from 'next/server'

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || ''

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function callScript(body: object) {
  const json = JSON.stringify(body)
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json).toString(),
    },
    body: json,
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { success: false, error: text.slice(0, 300) } }
}

async function callScriptGet(params: Record<string, string>) {
  const url = new URL(APPS_SCRIPT_URL)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { method: 'GET' })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { success: false, error: text.slice(0, 300) } }
}

export async function POST(req: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL) return NextResponse.json({ success: false, error: 'APPS_SCRIPT_URL não configurada' })

    const contentType = req.headers.get('content-type') || ''

    // Upload de arquivo
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File
      const folderPath = (formData.get('folderPath') as string) || ''
      if (!file) return NextResponse.json({ success: false, error: 'Nenhum arquivo' })

      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      bytes.forEach(b => binary += String.fromCharCode(b))
      const base64 = btoa(binary)

      const result = await callScript({
        action: 'upload',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64,
        folderPath,
      })
      return NextResponse.json(result)
    }

    // Outras ações JSON
    const body = await req.json()
    const result = await callScript(body)
    return NextResponse.json(result)

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL) return NextResponse.json({ success: false, error: 'APPS_SCRIPT_URL não configurada' })
    const { searchParams } = new URL(req.url)
    const folderPath = searchParams.get('folderPath') || ''
    const result = await callScriptGet({ action: 'list', folderPath })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
