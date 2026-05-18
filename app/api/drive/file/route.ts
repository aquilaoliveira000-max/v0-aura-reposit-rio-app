export const runtime = 'edge'

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
  if (!data.access_token) throw new Error('Token inválido')
  return data.access_token
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('id')
  const forceDownload = searchParams.get('download') === '1'
  const name = searchParams.get('name') || 'arquivo'

  if (!fileId) return new Response('ID não informado', { status: 400 })

  try {
    const token = await getToken()
    const range = (req as any).headers?.get?.('range')

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (range) headers['Range'] = range

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers }
    )

    if (!driveRes.ok && driveRes.status !== 206) {
      return new Response('Arquivo não encontrado', { status: driveRes.status })
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': driveRes.headers.get('content-type') || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    }

    const contentLength = driveRes.headers.get('content-length')
    const contentRange = driveRes.headers.get('content-range')
    if (contentLength) responseHeaders['Content-Length'] = contentLength
    if (contentRange) responseHeaders['Content-Range'] = contentRange

    if (forceDownload) {
      responseHeaders['Content-Disposition'] = `attachment; filename="${encodeURIComponent(name)}"`
    }

    // Streaming direto — Edge Runtime mantém a conexão aberta enquanto os dados chegam
    return new Response(driveRes.body, {
      status: driveRes.status === 206 ? 206 : 200,
      headers: responseHeaders,
    })
  } catch (err: any) {
    return new Response(err.message, { status: 500 })
  }
}
