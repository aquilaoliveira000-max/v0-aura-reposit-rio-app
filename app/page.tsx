'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Logo } from '@/components/aura/logo'

export default function Entrar() {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Já conectado: vai direto para os arquivos.
  useEffect(() => {
    fetch('/api/auth', { cache: 'no-store' })
      .then((r) => r.ok && router.replace('/files'))
      .catch(() => undefined)
  }, [router])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim() || !pass) return setError('Preencha usuário e senha.')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.trim(), password: pass }),
      })
      const data = await res.json()
      if (data.success) {
        router.push('/files')
        return
      }
      setError(data.error || 'Não foi possível entrar.')
    } catch {
      setError('Sem conexão. Confira a internet e tente de novo.')
    }
    setLoading(false)
  }

  return (
    <div className="relative flex min-h-dvh flex-wrap overflow-hidden bg-bg">
      <section className="relative flex flex-[1_1_520px] flex-col justify-between gap-6 px-6 sm:overflow-hidden pb-2 pt-8 sm:min-h-[38vh] sm:gap-10 sm:px-14 sm:py-14">
        <div
          aria-hidden
          className="absolute -left-40 top-[18%] h-[360px] w-[680px] -rotate-[24deg] rounded-full opacity-90 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, color-mix(in oklch, var(--aura-2) 55%, transparent), color-mix(in oklch, var(--aura-1) 22%, transparent) 60%, transparent)' }}
        />
        <div
          aria-hidden
          className="absolute left-[18%] top-[34%] h-[150px] w-[440px] -rotate-[24deg] rounded-full blur-2xl"
          style={{ background: 'radial-gradient(closest-side, color-mix(in oklch, var(--aura-3) 45%, transparent), color-mix(in oklch, var(--aura-4) 16%, transparent) 60%, transparent)' }}
        />
        <div className="relative">
          <Logo height={36} />
        </div>
        <div className="relative flex max-w-[520px] flex-col gap-4">
          <h1 className="text-[clamp(1.75rem,4vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-text">
            Seus arquivos,
            <br />
            num lugar só.
          </h1>
          <p className="max-w-[44ch] text-md text-text-2 max-sm:hidden">Fotos, vídeos e documentos do seu projeto com a +Aura. Envie, organize e baixe quando quiser.</p>
        </div>
        <p className="relative text-sm text-text-3 max-sm:hidden">Área do cliente da agência +Aura</p>
      </section>

      <section className="relative flex flex-[1_1_440px] items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:px-5 sm:py-12">
        <div
          aria-hidden
          className="absolute right-[-120px] top-[10%] h-[420px] w-[520px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(closest-side, color-mix(in oklch, var(--aura-1) 35%, transparent), transparent)' }}
        />
        <form
          onSubmit={handleLogin}
          noValidate
          className="glass relative flex w-full max-w-[400px] flex-col gap-5 rounded-[var(--radius-dialog)] border border-line px-6 py-7 sm:px-8 sm:py-9 shadow-[var(--shadow-pop)]"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">Entrar</h2>
            <p className="text-base text-text-2">Use o usuário e a senha que a +Aura enviou para você.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario" className="text-sm font-medium text-text-2">
              Usuário
            </label>
            <input
              id="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={user}
              onChange={(e) => (setError(''), setUser(e.target.value))}
              className="campo h-11 px-3"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="text-sm font-medium text-text-2">
              Senha
            </label>
            <div className="relative">
              <input
                id="senha"
                type={verSenha ? 'text' : 'password'}
                autoComplete="current-password"
                value={pass}
                aria-invalid={Boolean(error)}
                onChange={(e) => (setError(''), setPass(e.target.value))}
                className="campo h-11 pl-3 pr-11"
              />
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}
                className="btn btn-ghost absolute right-1 top-1 size-9"
              >
                {verSenha ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            {error ? (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary h-11 px-5 text-md">
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {loading ? 'Entrando...' : 'Entrar'}
            {loading ? null : <ArrowRight className="size-4" aria-hidden />}
          </button>
          <p className="text-center text-sm text-text-3">Esqueceu a senha? Fale com a equipe +Aura.</p>
        </form>
      </section>
    </div>
  )
}
