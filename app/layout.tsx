import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: '+Aura Arquivos',
  description: 'Os arquivos do seu projeto com a agência +Aura, num lugar só.',
  icons: { icon: '/brand/mais-aura-simbolo.svg', apple: '/brand/mais-aura-simbolo-180.png' },
  robots: { index: false, follow: false },
}

// Sem zoom no celular: evita a tela aproximar sozinha ao tocar no campo de senha.
export const viewport: Viewport = { themeColor: '#050409', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
