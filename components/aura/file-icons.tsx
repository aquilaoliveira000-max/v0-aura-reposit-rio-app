'use client'

import { AuraFile } from '@/lib/aura-types'
import { 
  FileText, 
  Image, 
  Video, 
  Music, 
  FileArchive, 
  File,
  Folder
} from 'lucide-react'

interface FileIconProps {
  type: AuraFile['type'] | 'folder'
  size?: number
  className?: string
}

export function FileIcon({ type, size = 24, className = '' }: FileIconProps) {
  const iconProps = { size, className }
  
  switch (type) {
    case 'folder':
      return <Folder {...iconProps} className={`text-cosmic-blue ${className}`} />
    case 'pdf':
      return <FileText {...iconProps} className={`text-cosmic-pink ${className}`} />
    case 'image':
      return <Image {...iconProps} className={`text-cosmic-violet ${className}`} />
    case 'video':
      return <Video {...iconProps} className={`text-cosmic-orange ${className}`} />
    case 'audio':
      return <Music {...iconProps} className={`text-cosmic-cyan ${className}`} />
    case 'document':
      return <FileText {...iconProps} className={`text-cosmic-blue ${className}`} />
    case 'archive':
      return <FileArchive {...iconProps} className={`text-cosmic-orange ${className}`} />
    default:
      return <File {...iconProps} className={`text-muted-foreground ${className}`} />
  }
}
