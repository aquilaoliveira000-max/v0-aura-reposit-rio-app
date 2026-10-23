/**
 * Sessão dos clientes do +Aura Arquivos.
 * O login vira um cookie HttpOnly assinado (HMAC); a pasta de cada cliente vem sempre da variável
 * CLIENTS no servidor, nunca do navegador. Funciona no runtime Node e no Edge (só Web Crypto).
 */

export const COOKIE_SESSAO = 'aura_sessao'
const DURACAO_S = 7 * 24 * 60 * 60
/** Pasta principal no Drive. Cliente com essa pasta (ou vazia) enxerga tudo. */
export const PASTA_PRINCIPAL = 'Uploads +Aura'

export interface Sessao {
  usuario: string
  /** Caminho da pasta do cliente dentro de "Uploads +Aura"; vazio = acesso total. */
  raiz: string
}

interface Cliente {
  usuario: string
  senha: string
  pasta: string
}

const codificador = new TextEncoder()

/** Formato da variável: login1:senha1:Pasta1|login2:senha2:Pasta2 */
function clientes(): Cliente[] {
  return (process.env.CLIENTS || '')
    .split('|')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [usuario = '', senha = '', ...pasta] = e.split(':')
      return { usuario, senha, pasta: pasta.join(':') }
    })
}

export const normalizarCaminho = (c: string) =>
  c
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/')

const raizDoCliente = (pasta: string) => {
  const p = normalizarCaminho(pasta)
  return p === PASTA_PRINCIPAL ? '' : p
}

function segredo() {
  const s = process.env.SESSION_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!s) throw new Error('SESSION_SECRET não configurada')
  return s
}

const base64url = (bytes: ArrayBuffer | Uint8Array) => {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(texto: string) {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(segredo()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64url(await crypto.subtle.sign('HMAC', chave, codificador.encode(texto)))
}

/** Comparação em tempo constante. */
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function conferirLogin(usuario: string, senha: string): Cliente | null {
  let achado: Cliente | null = null
  // Percorre todos para não revelar pelo tempo de resposta qual usuário existe.
  for (const c of clientes()) if (iguais(c.usuario, usuario) && iguais(c.senha, senha)) achado = c
  return achado
}

export async function criarCookieSessao(usuario: string) {
  const dados = base64url(codificador.encode(JSON.stringify({ u: usuario, exp: Math.floor(Date.now() / 1000) + DURACAO_S })))
  const valor = `${dados}.${await hmac(`sessao|${dados}`)}`
  return `${COOKIE_SESSAO}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACAO_S}`
}

export const cookieSaida = () => `${COOKIE_SESSAO}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

/** Lê e valida a sessão; devolve null se faltar, for falsa, tiver vencido ou o cliente tiver sido removido. */
export async function lerSessao(req: Request): Promise<Sessao | null> {
  const cookie = req.headers.get('cookie') || ''
  const valor = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_SESSAO}=`))
    ?.slice(COOKIE_SESSAO.length + 1)
  if (!valor) return null
  const [dados, assinatura] = valor.split('.')
  if (!dados || !assinatura || !iguais(assinatura, await hmac(`sessao|${dados}`))) return null
  try {
    const { u, exp } = JSON.parse(atob(dados.replace(/-/g, '+').replace(/_/g, '/'))) as { u: string; exp: number }
    if (!u || exp < Date.now() / 1000) return null
    const cliente = clientes().find((c) => c.usuario === u)
    return cliente ? { usuario: u, raiz: raizDoCliente(cliente.pasta) } : null
  } catch {
    return null
  }
}

/** O caminho pedido está dentro da pasta do cliente? */
export function dentroDaRaiz(sessao: Sessao, caminho: string) {
  const c = normalizarCaminho(caminho)
  return !sessao.raiz || c === sessao.raiz || c.startsWith(`${sessao.raiz}/`)
}

/**
 * Assinatura de um item (arquivo ou pasta) entregue na listagem.
 * Só quem recebeu o item listando a própria pasta consegue apresentar a assinatura de volta.
 */
export const assinarItem = (sessao: Sessao, id: string) => hmac(`item|${sessao.usuario}|${sessao.raiz}|${id}`)

export async function itemAutorizado(sessao: Sessao, id: unknown, assinatura: unknown) {
  if (typeof id !== 'string' || typeof assinatura !== 'string' || !id) return false
  return iguais(assinatura, await assinarItem(sessao, id))
}
