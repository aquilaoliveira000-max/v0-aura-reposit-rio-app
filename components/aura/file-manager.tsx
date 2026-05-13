'use client'

import { useState, useCallback, useRef, DragEvent, useEffect } from 'react'
import { Upload, FolderPlus, ChevronRight, X, MoreVertical, Folder, LogOut, Camera, CheckCircle2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CosmicButton } from './cosmic-button'
import { CosmicSpinner } from './cosmic-spinner'
import { FileIcon } from './file-icons'
import { formatFileSize, getFileType, generateId } from '@/lib/aura-types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface DriveItem {
  id: string
  name: string
  type: 'file' | 'folder'
  mimeType?: string
  size?: number
  createdAt?: string
}

interface StagedFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

interface BreadcrumbItem {
  name: string
  path: string
}

export function FileManager() {
  const router = useRouter()
  const [items, setItems] = useState<DriveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ name: 'Meus Arquivos', path: '' }])
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedItem, setSelectedItem] = useState<DriveItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('aura_auth')) {
      router.push('/')
      return
    }
    loadItems('')
    const interval = setInterval(() => loadItems(currentPath), 30000)
    return () => clearInterval(interval)
  }, [router])

  const loadItems = async (path: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/upload?folderPath=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.success) {
        const allItems: DriveItem[] = [
          ...data.folders.map((f: any) => ({ ...f, type: 'folder' as const })),
          ...data.files.map((f: any) => ({ ...f, type: 'file' as const }))
        ]
        setItems(allItems)
      }
    } catch {}
    setLoading(false)
  }

  const navigateTo = (name: string, path: string) => {
    setCurrentPath(path)
    setBreadcrumbs(prev => [...prev, { name, path }])
    loadItems(path)
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(breadcrumbs.slice(0, index + 1))
    setCurrentPath(crumb.path)
    loadItems(crumb.path)
  }

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0)
      setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0)
      setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
    e.target.value = ''
  }

  const uploadFile = async (staged: StagedFile) => {
    setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'uploading' } : f))
    try {
      const formData = new FormData()
      formData.append('file', staged.file)
      formData.append('folderPath', currentPath)

      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, progress: Math.round((e.loaded / e.total) * 100) } : f))
      }

      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', '/api/upload')
        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.success) resolve()
            else reject(new Error(res.error || 'Erro no upload'))
          } catch { reject(new Error('Resposta inválida')) }
        }
        xhr.onerror = () => reject(new Error('Erro de conexão'))
        xhr.send(formData)
      })

      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'done', progress: 100 } : f))
      setTimeout(() => {
        setStagedFiles(prev => prev.filter(f => f.id !== staged.id))
        loadItems(currentPath)
      }, 1500)
    } catch (err: any) {
      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'error', error: err.message } : f))
    }
  }

  const handleUploadAll = () => {
    stagedFiles.filter(f => f.status === 'pending').forEach(uploadFile)
  }

  const handleDelete = async (item: DriveItem) => {
    try {
      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: item.type === 'folder' ? 'deleteFolder' : 'delete', id: item.id })
      })
      loadItems(currentPath)
    } catch {}
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFolder', name: newFolderName.trim(), folderPath: currentPath })
      })
      setNewFolderName('')
      setShowNewFolderModal(false)
      loadItems(currentPath)
    } catch {}
  }

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return
    try {
      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', id: selectedItem.id, name: renameValue.trim() })
      })
      setShowRenameModal(false)
      setSelectedItem(null)
      setRenameValue('')
      loadItems(currentPath)
    } catch {}
  }

  const folders = items.filter(i => i.type === 'folder')
  const files = items.filter(i => i.type === 'file')
  const hasPending = stagedFiles.some(f => f.status === 'pending')

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-60 bg-[#0a0a0f] border-r border-[#1e1e2a] flex flex-col">
        <div className="p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider" style={{background:'linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            Meus Arquivos
          </h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          <button
            onClick={() => navigateToBreadcrumb(0)}
            className={cn("w-full text-left py-2 px-3 rounded-lg flex items-center gap-2 transition-colors text-sm",
              currentPath === '' ? "text-white border-l-2 border-[#7c3aed]" : "text-[#888899] hover:text-white hover:bg-[#1a1a24]")}
          >
            <Folder size={15} style={{color: currentPath === '' ? '#7c3aed' : undefined, flexShrink:0}}/>
            <span className="truncate">Meus Arquivos</span>
          </button>
        </nav>
        <div className="p-4 border-t border-[#1e1e2a] flex flex-col gap-2">
          <CosmicButton variant="outline" size="sm" className="w-full" onClick={() => setShowNewFolderModal(true)}>
            <FolderPlus size={16}/> Nova Pasta
          </CosmicButton>
          <button
            onClick={() => { localStorage.removeItem('aura_auth'); router.push('/') }}
            className="flex items-center gap-2 text-xs text-[#888899] hover:text-white transition-colors px-3 py-2"
          >
            <LogOut size={14}/> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-[#0d0d12] p-6 overflow-y-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <nav className="flex items-center gap-1 text-sm flex-wrap">
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={14} className="text-[#888899]"/>}
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className={cn("hover:text-white transition-colors", index === breadcrumbs.length - 1 ? "text-white font-medium" : "text-[#888899]")}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => loadItems(currentPath)} className="p-2 text-[#888899] hover:text-white transition-colors" title="Atualizar">
              <RefreshCw size={16}/>
            </button>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(true)}>
              <FolderPlus size={16}/> Nova Pasta
            </CosmicButton>
            <label>
              <CosmicButton variant="filled" size="sm" as="span" className="cursor-pointer">
                <Upload size={16}/> Carregar
              </CosmicButton>
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileSelect}/>
            </label>
          </div>
        </div>

        {/* Staged Files */}
        {stagedFiles.length > 0 && (
          <div className="mb-6 space-y-2">
            {stagedFiles.map(staged => (
              <div key={staged.id} className="p-3 rounded-lg border border-[#2a2a3a] bg-[#13131a] flex items-center gap-3">
                <FileIcon type={getFileType(staged.file.name)} size={28}/>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{staged.file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-[#888899]">{formatFileSize(staged.file.size)}</p>
                    {staged.status === 'uploading' && <span className="text-xs text-[#3b82f6]">{staged.progress}%</span>}
                    {staged.status === 'error' && <span className="text-xs text-red-400 truncate">{staged.error}</span>}
                    {staged.status === 'done' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Enviado</span>}
                  </div>
                  {staged.status === 'uploading' && (
                    <div className="mt-1.5 h-0.5 bg-[#2a2a3a] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{width:`${staged.progress}%`, background:'linear-gradient(90deg,#3b82f6,#7c3aed,#06b6d4)'}}/>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {staged.status === 'uploading' && <CosmicSpinner size={16}/>}
                  {staged.status === 'pending' && (
                    <button onClick={() => setStagedFiles(prev => prev.filter(f => f.id !== staged.id))}
                      className="p-1 hover:bg-[#1e1e2a] rounded transition-colors">
                      <X size={16} className="text-[#888899]"/>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {hasPending && (
              <CosmicButton variant="filled" size="sm" onClick={handleUploadAll} className="w-full mt-2">
                <Upload size={16}/>
                Carregar {stagedFiles.filter(f => f.status === 'pending').length > 1
                  ? `${stagedFiles.filter(f => f.status === 'pending').length} arquivos`
                  : 'arquivo'}
              </CosmicButton>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <CosmicSpinner size={32}/>
          </div>
        )}

        {/* Empty State */}
        {!loading && items.length === 0 && stagedFiles.length === 0 && (
          <div
            className={cn("rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed transition-all duration-300 cursor-pointer",
              isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/50")}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{background:'linear-gradient(135deg,#3b82f620,#7c3aed20,#06b6d420)'}}>
              <Upload size={28} style={{color:'#7c3aed'}}/>
            </div>
            <p className="text-white text-lg font-medium mb-1">Arraste arquivos aqui</p>
            <p className="text-[#888899] text-sm">ou clique para selecionar — múltiplos arquivos suportados</p>
          </div>
        )}

        {/* Grid */}
        {!loading && (items.length > 0 || stagedFiles.length > 0) && (
          <>
            <div
              className={cn("rounded-lg p-3 mb-6 flex items-center justify-center gap-2 border border-dashed transition-all duration-300 cursor-pointer",
                isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/40")}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} className="text-[#888899]"/>
              <p className="text-[#888899] text-sm">Arraste ou clique para adicionar arquivos</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {folders.map(folder => (
                <div key={folder.id} className="group relative cosmic-border p-4 rounded-xl hover:bg-[#1a1a24] transition-all duration-200">
                  <button onClick={() => navigateTo(folder.name, currentPath ? `${currentPath}/${folder.name}` : folder.name)}
                    className="flex flex-col items-center w-full">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <defs>
                        <linearGradient id={`fg-${folder.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6"/>
                          <stop offset="50%" stopColor="#7c3aed"/>
                          <stop offset="100%" stopColor="#06b6d4"/>
                        </linearGradient>
                      </defs>
                      <path d="M4 12C4 9.79 5.79 8 8 8H18L22 12H40C42.21 12 44 13.79 44 16V36C44 38.21 42.21 40 40 40H8C5.79 40 4 38.21 4 36V12Z"
                        fill={`url(#fg-${folder.id})`} opacity="0.9"/>
                    </svg>
                    <p className="mt-2 text-xs text-white text-center w-full truncate" title={folder.name}>{folder.name}</p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                        <MoreVertical size={14} className="text-[#888899]"/>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                      <DropdownMenuItem onClick={() => { setSelectedItem(folder); setRenameValue(folder.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(folder)} className="text-red-400">Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              {files.map(file => (
                <div key={file.id} className="group relative cosmic-border p-4 rounded-xl hover:bg-[#1a1a24] transition-all duration-200">
                  <a
                    href={`https://drive.google.com/uc?export=download&id=${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center group/dl"
                    title={`Baixar ${file.name}`}
                  >
                    <FileIcon type={getFileType(file.name)} size={44}/>
                    <p className="mt-2 text-xs text-white text-center w-full truncate group-hover/dl:text-[#06b6d4] transition-colors" title={file.name}>{file.name}</p>
                    {file.size && <p className="text-[10px] text-[#888899] mt-0.5">{formatFileSize(file.size)}</p>}
                    <p className="text-[10px] text-[#3b82f6] mt-0.5 opacity-0 group-hover/dl:opacity-100 transition-opacity">↓ baixar</p>
                  </a>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                        <MoreVertical size={14} className="text-[#888899]"/>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                      <DropdownMenuItem onClick={() => { setSelectedItem(file); setRenameValue(file.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(file)} className="text-red-400">Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a]">
          <DialogHeader><DialogTitle className="text-white">Nova Pasta</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              className="bg-[#0d0d12] border-[#2a2a3a] text-white" placeholder="Nome da pasta"
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} autoFocus/>
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleCreateFolder}>Criar</CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a]">
          <DialogHeader><DialogTitle className="text-white">Renomear</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
              className="bg-[#0d0d12] border-[#2a2a3a] text-white" placeholder="Novo nome"
              onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus/>
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowRenameModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleRename}>Renomear</CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
