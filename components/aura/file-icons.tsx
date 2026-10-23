'use client'

import { AuraFile } from '@/lib/aura-types'
import { FileText, Image, Video, Music, FileArchive, File, Folder, FileSpreadsheet } from 'lucide-react'

interface FileIconProps {
  type: AuraFile['type'] | 'folder'
  size?: number
  className?: string
}

/** Cor por tipo, tirada do espectro da marca e dos tons de estado. */
const COR: Record<FileIconProps['type'], string> = {
  folder: 'var(--brand-text)',
  pdf: 'var(--danger)',
  image: 'var(--aura-3)',
  video: 'var(--aura-1)',
  audio: 'var(--info)',
  document: 'var(--info)',
  archive: 'var(--warning)',
  other: 'var(--text-3)',
}

const ICONE = { folder: Folder, pdf: FileText, image: Image, video: Video, audio: Music, document: FileSpreadsheet, archive: FileArchive, other: File }

export function FileIcon({ type, size = 24, className = '' }: FileIconProps) {
  const Icone = ICONE[type] ?? File
  return <Icone size={size} strokeWidth={1.75} className={className} style={{ color: COR[type] ?? COR.other }} aria-hidden />
}
