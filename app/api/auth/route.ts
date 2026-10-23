import { NextRequest, NextResponse } from 'next/server'
import { conferirLogin, cookieSaida, criarCookieSessao, lerSessao } from '@/lib/sessao'

export const dynamic = 'force-dynamic'

/** Entrar: confere usuário e senha e grava o cookie de sessão. */
export async function POST(req: NextRequest) {
  const { username = '', password = '' } = await req.json().catch(() => ({}))
  const cliente = conferirLogin(String(username), String(password))
  if (!cliente) {
    // Atraso fixo atrapalha quem tenta adivinhar senhas em sequência.
    await new Promise((r) => setTimeout(r, 700))
    return NextResponse.json({ success: false, error: 'Usuário ou senha incorretos' }, { status: 401 })
  }
  return NextResponse.json({ success: true }, { headers: { 'Set-Cookie': await criarCookieSessao(cliente.usuario) } })
}

/** Quem está conectado (o painel usa para abrir na pasta certa). */
export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req)
  if (!sessao) return NextResponse.json({ success: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ success: true, usuario: sessao.usuario, raiz: sessao.raiz }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Sair. */
export async function DELETE() {
  return NextResponse.json({ success: true }, { headers: { 'Set-Cookie': cookieSaida() } })
}
