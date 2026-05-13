'use client'

import Link from 'next/link'
import { Navbar } from '@/components/aura/navbar'
import { CosmicButton } from '@/components/aura/cosmic-button'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#111114]">
      <Navbar />
      
      <main className="flex-1 flex flex-col items-center justify-center gap-12 px-4">
        <h1 className="font-[var(--font-poiret)] text-6xl sm:text-7xl md:text-8xl text-white tracking-wider text-center">
          +Aura
        </h1>
        
        <Link href="/files">
          <CosmicButton size="lg">
            Entrar
          </CosmicButton>
        </Link>
      </main>
    </div>
  )
}
