'use client'

import { Navbar } from '@/components/aura/navbar'
import { FileManager } from '@/components/aura/file-manager'

export default function FilesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#111114]">
      <Navbar />
      <FileManager />
    </div>
  )
}
