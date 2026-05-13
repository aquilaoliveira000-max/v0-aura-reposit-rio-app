'use client'

import Link from 'next/link'

export function Navbar() {
  return (
    <nav className="h-16 bg-navbar flex items-center justify-center sticky top-0 z-50">
      <Link 
        href="/" 
        className="font-[var(--font-poiret)] text-[28px] text-white tracking-wider hover:opacity-80 transition-opacity"
      >
        +Aura
      </Link>
    </nav>
  )
}
