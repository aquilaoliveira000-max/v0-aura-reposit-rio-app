'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/aura/navbar'

export default function LandingPage() {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 350))
    if (user === 'aura' && pass === 'aura') {
      localStorage.setItem('aura_auth', '1')
      router.push('/files')
    } else {
      setError('Usuário ou senha incorretos.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0d12]">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center gap-10 px-4">
        {/* Logotipo */}
        <h1 className="font-arual text-6xl sm:text-7xl md:text-8xl text-white tracking-wider text-center select-none">
          +Aura
        </h1>

        {/* Card de login */}
        <div className="w-full max-w-sm flex flex-col gap-4 p-8 rounded-2xl"
          style={{
            background: '#13131a',
            border: '1px solid transparent',
            backgroundImage: 'linear-gradient(#13131a, #13131a), linear-gradient(135deg, #3b82f6, #8b5cf6, #d946ef, #f97316, #06b6d4)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          }}>
          <input
            type="text"
            placeholder="Usuário"
            value={user}
            onChange={e => setUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full rounded-lg px-4 py-3 text-white placeholder-[#888899] focus:outline-none transition-colors text-sm"
            style={{ background: '#0d0d12', border: '1px solid #1e1e2a' }}
          />
          <input
            type="password"
            placeholder="Senha"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full rounded-lg px-4 py-3 text-white placeholder-[#888899] focus:outline-none transition-colors text-sm"
            style={{ background: '#0d0d12', border: '1px solid #1e1e2a' }}
          />

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          {/* Snake border button */}
          <div className="snake-btn-wrap w-full mt-2" style={{ borderRadius: '10px' }}>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="snake-btn-inner w-full text-center"
              style={{ padding: '13px 0', fontSize: '16px', letterSpacing: '0.15em', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? '...' : 'Entrar'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
