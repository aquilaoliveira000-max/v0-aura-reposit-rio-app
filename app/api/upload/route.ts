import { NextRequest, NextResponse } from 'next/server'

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || ''

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const folderPath = (formData.get('folderPath') as string) || ''

    if (!file) {
      return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: 'APPS_SCRIPT_URL não configurada' }, { status: 500 })
    }

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    bytes.forEach(b => binary += String.fromCharCode(b))
    const base64 = btoa(binary)

    const body = JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: base64,
      folderPath,
    })

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
      },
      body,
    })

    const text = await response.text()

    try {
      const result = JSON.parse(text)
      return NextResponse.json(result)
    } catch {
      return NextResponse.json({ success: false, error: 'Apps Script retornou resposta inválida: ' + text.slice(0, 200) })
    }

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
