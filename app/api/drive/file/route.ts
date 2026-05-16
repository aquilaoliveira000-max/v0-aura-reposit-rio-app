import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

let _cachedToken: string | null = null
let _tokenExpiry = 0

async function getToken(): Promise<string> {
  const now = Date.now()
  if (_cachedToken && _tokenExpiry - now > 120_000) return _cachedToken

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
  if (!data.access_token) throw new Error('Token inválido: ' + JSON.stringify(data))
  _cachedToken = data.access_token
  _tokenExpiry = now + (data.expires_in || 3600) * 1000
  return _cachedToken!
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('id')
  const forceDownload = searchParams.get('download') === '1'

  if (!fileId) return new NextResponse('ID não informado', { status: 400 })

  try {
    const token = await getToken()
    const range = req.headers.get('range')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    }
    if (range) headers['Range'] = range

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers }
    )

    if (!res.ok && res.status !== 206) {
      return new NextResponse('Arquivo não encontrado', { status: res.status })
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const contentLength = res.headers.get('content-length')
    const contentRange = res.headers.get('content-range')

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
      'Accept-Ranges': 'bytes',
    }

    if (contentLength) responseHeaders['Content-Length'] = contentLength
    if (contentRange) responseHeaders['Content-Range'] = contentRange

    if (forceDownload) {
      const nameParam = searchParams.get('name') || 'arquivo'
      responseHeaders['Content-Disposition'] = `attachment; filename="${nameParam}"`
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      status: res.status === 206 ? 206 : 200,
      headers: responseHeaders,
    })
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 })
  }
}
