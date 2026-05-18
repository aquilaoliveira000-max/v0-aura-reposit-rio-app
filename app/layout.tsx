import type { Metadata } from 'next'
import { Inter, Poiret_One } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter'
})

const poiretOne = Poiret_One({ 
  weight: '400',
  subsets: ["latin"],
  variable: '--font-poiret'
})

export const metadata: Metadata = {
  title: '+Aura | Private File Manager',
  description: 'Seu gerenciador de arquivos privado com design cósmico',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poiretOne.variable}`}>
      <body className="font-sans antialiased bg-[#111114]">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
