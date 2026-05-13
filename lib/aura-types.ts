export interface AuraFile {
  id: string
  name: string
  type: 'pdf' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'
  size: number
  createdAt: Date
}

export interface AuraFolder {
  id: string
  name: string
  parentId: string | null
  children: AuraFolder[]
  files: AuraFile[]
}

export interface StagedFile {
  file: File
  id: string
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function getFileType(filename: string): AuraFile['type'] {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  
  const typeMap: Record<string, AuraFile['type']> = {
    pdf: 'pdf',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image',
    mp4: 'video', webm: 'video', mov: 'video', avi: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
    doc: 'document', docx: 'document', txt: 'document', rtf: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document',
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  }
  
  return typeMap[ext] || 'other'
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}
