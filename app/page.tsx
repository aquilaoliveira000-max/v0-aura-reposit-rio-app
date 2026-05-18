'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/aura/navbar'
import { CosmicButton } from '@/components/aura/cosmic-button'

export default function LandingPage() {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 400))
    if (user === 'aura' && pass === 'aura') {
      localStorage.setItem('aura_auth', '1')
      router.push('/files')
    } else {
      setError('Usuário ou senha incorretos.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#111114]">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <h1 className="font-arual text-6xl sm:text-7xl md:text-8xl text-white tracking-wider text-center">
          +Aura
        </h1>
        <div className="cosmic-border rounded-xl p-8 w-full max-w-sm flex flex-col gap-4">
          <input
            type="text"
            placeholder="Usuário"
            value={user}
            onChange={e => setUser(e.target.value)}
            className="w-full bg-[#18181c] border border-[#2a2a32] rounded-lg px-4 py-3 text-white placeholder-[#888899] focus:outline-none focus:border-[#3b82f6] transition-colors"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <input
            type="password"
            placeholder="Senha"
            value={pass}
            onChange={e => setPass(e.target.value)}
            className="w-full bg-[#18181c] border border-[#2a2a32] rounded-lg px-4 py-3 text-white placeholder-[#888899] focus:outline-none focus:border-[#3b82f6] transition-colors"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <CosmicButton size="lg" variant="outline" loading={loading} onClick={handleLogin} className="w-full mt-2">
            Entrar
          </CosmicButton>
        </div>
      </main>
    </div>
  )
}
