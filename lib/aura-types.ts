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
  avatar?: string
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
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function getFileType(filename: string): AuraFile['type'] {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'audio'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'document'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  return 'other'
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}
