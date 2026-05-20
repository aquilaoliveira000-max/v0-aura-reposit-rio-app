import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const clients = process.env.CLIENTS || ''

  // Formato: login1:senha1:NomePasta1|login2:senha2:NomePasta2
  const entries = clients.split('|').map(e => e.trim()).filter(Boolean)

  for (const entry of entries) {
    const [user, pass, ...folderParts] = entry.split(':')
    const folder = folderParts.join(':')
    if (user === username && pass === password) {
      return NextResponse.json({ success: true, folder })
    }
  }

  return NextResponse.json({ success: false, error: 'Usuário ou senha incorretos' })
}
