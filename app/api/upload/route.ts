import { NextRequest, NextResponse } from 'next/server'

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || ''
const MAX_CHUNK = 4 * 1024 * 1024 // 4MB por chunk

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const folderPath = formData.get('folderPath') as string || 'root'

    if (!file) {
      return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    
    // Converte para base64
    let binary = ''
    bytes.forEach(b => binary += String.fromCharCode(b))
    const base64 = btoa(binary)

    const payload = {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: base64,
      folderPath,
    }

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}
