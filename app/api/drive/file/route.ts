import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function getToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token
}

export async function GET(req: NextRequest) {
  const fileId = new URL(req.url).searchParams.get('id')
  if (!fileId) return new NextResponse('ID não informado', { status: 400 })

  try {
    const token = await getToken()
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) return new NextResponse('Arquivo não encontrado', { status: 404 })

    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 })
  }
}
