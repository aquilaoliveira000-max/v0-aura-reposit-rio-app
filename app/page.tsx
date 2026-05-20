'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/aura/navbar'
import { CosmicSpinner } from '@/components/aura/cosmic-spinner'

export default function LandingPage() {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!user || !pass) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('aura_auth', '1')
        localStorage.setItem('aura_root', data.folder || '')
        localStorage.setItem('aura_user', user)
        router.push('/files')
      } else {
        setError(data.error || 'Erro ao entrar')
      }
    } catch {
      setError('Erro de conexão')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0d12]">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-4">
        <h1 className="font-arual text-6xl sm:text-7xl md:text-8xl text-white tracking-wider text-center select-none">
          +Aura
        </h1>
        <div className="w-full max-w-sm flex flex-col gap-4 p-8 rounded-2xl"
          style={{
            background: '#13131a',
            border: '1px solid transparent',
            backgroundImage: 'linear-gradient(#13131a, #13131a), linear-gradient(135deg, #3b82f6, #7c3aed, #06b6d4)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          }}>
          <input type="text" placeholder="Usuário" autoComplete="off" value={user}
            onChange={e => setUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full rounded-lg px-4 py-3 text-white placeholder-[#888899] focus:outline-none text-sm"
            style={{ background: '#0d0d12', border: '1px solid #1e1e2a' }}/>
          <input type="text" placeholder="Senha" autoComplete="off" style={{ WebkitTextSecurity: "disc" } as any} value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full rounded-lg px-4 py-3 text-white placeholder-[#888899] focus:outline-none text-sm"
            style={{ background: '#0d0d12', border: '1px solid #1e1e2a' }}/>
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3 rounded-lg text-white font-medium mt-1 flex items-center justify-center gap-2 transition-all"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed, #06b6d4)', opacity: loading ? 0.7 : 1 }}>
            {loading ? <><CosmicSpinner size={18}/> Entrando...</> : 'Entrar'}
          </button>
        </div>
      </main>
    </div>
  )
}
