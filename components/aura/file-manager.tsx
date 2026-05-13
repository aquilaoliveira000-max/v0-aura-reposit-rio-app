'use client'

import { useState, useCallback, useRef, DragEvent, useEffect } from 'react'
import { Upload, FolderPlus, ChevronRight, X, MoreVertical, Folder, LogOut, Camera, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CosmicButton } from './cosmic-button'
import { CosmicSpinner } from './cosmic-spinner'
import { FileIcon } from './file-icons'
import { AuraFile, AuraFolder, formatFileSize, getFileType, generateId } from '@/lib/aura-types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const STORAGE_KEY = 'aura_filesystem'

const initialFolders: AuraFolder = {
  id: 'root',
  name: 'Meus Arquivos',
  parentId: null,
  children: [],
  files: []
}

function loadFromStorage(): AuraFolder {
  if (typeof window === 'undefined') return initialFolders
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return parsed
    }
  } catch {}
  return initialFolders
}

function saveToStorage(folders: AuraFolder) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
  } catch {}
}

function findFolder(root: AuraFolder, path: string[]): AuraFolder | null {
  if (path.length === 0 || (path.length === 1 && path[0] === root.id)) return root
  let current = root
  for (let i = 1; i < path.length; i++) {
    const found = current.children.find(c => c.id === path[i])
    if (!found) return null
    current = found
  }
  return current
}

function getAllFolders(folder: AuraFolder, exclude?: string): { id: string; name: string; path: string }[] {
  const results: { id: string; name: string; path: string }[] = []
  function traverse(f: AuraFolder, currentPath: string) {
    if (f.id !== exclude) {
      results.push({ id: f.id, name: f.name, path: currentPath })
      for (const child of f.children) traverse(child, `${currentPath} > ${child.name}`)
    }
  }
  traverse(folder, folder.name)
  return results
}

function getFolderPath(root: AuraFolder, path: string[]): string {
  return path.slice(1).map(id => {
    const f = findFolder(root, path.slice(0, path.indexOf(id) + 1))
    return f?.name || id
  }).join('/')
}

interface StagedFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

export function FileManager() {
  const router = useRouter()
  const [folders, setFolders] = useState<AuraFolder>(initialFolders)
  const [currentPath, setCurrentPath] = useState<string[]>(['root'])
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ type: 'file' | 'folder'; id: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedMoveTarget, setSelectedMoveTarget] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carregar do localStorage na inicialização
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!localStorage.getItem('aura_auth')) {
        router.push('/')
        return
      }
      setFolders(loadFromStorage())
    }
  }, [router])

  // Salvar no localStorage sempre que mudar
  useEffect(() => {
    if (folders !== initialFolders) {
      saveToStorage(folders)
    }
  }, [folders])

  const currentFolder = findFolder(folders, currentPath)

  const breadcrumbs = currentPath.map((id, index) => {
    const pathToHere = currentPath.slice(0, index + 1)
    const folder = findFolder(folders, pathToHere)
    return { id, name: folder?.name || id, path: pathToHere }
  })

  const navigateToFolder = (folderId: string) => {
    setCurrentPath([...currentPath, folderId])
  }

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
    }
    e.target.value = ''
  }

  const uploadFile = async (staged: StagedFile) => {
    if (!currentFolder) return

    setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'uploading' } : f))

    try {
      const formData = new FormData()
      formData.append('file', staged.file)
      formData.append('folderPath', getFolderPath(folders, currentPath))

      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, progress } : f))
        }
      }

      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', '/api/upload')
        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.success) resolve()
            else reject(new Error(res.error || 'Erro no upload'))
          } catch {
            reject(new Error('Resposta inválida do servidor'))
          }
        }
        xhr.onerror = () => reject(new Error('Erro de conexão'))
        xhr.send(formData)
      })

      const newFile: AuraFile = {
        id: staged.id,
        name: staged.file.name,
        type: getFileType(staged.file.name),
        size: staged.file.size,
        createdAt: new Date()
      }

      setFolders(prev => {
        const update = (f: AuraFolder): AuraFolder => {
          if (f.id === currentFolder.id) return { ...f, files: [...f.files, newFile] }
          return { ...f, children: f.children.map(update) }
        }
        const updated = update(prev)
        saveToStorage(updated)
        return updated
      })

      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'done', progress: 100 } : f))
      setTimeout(() => setStagedFiles(prev => prev.filter(f => f.id !== staged.id)), 2000)

    } catch (err: any) {
      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'error', error: err.message } : f))
    }
  }

  const handleUploadAll = async () => {
    const pending = stagedFiles.filter(f => f.status === 'pending')
    await Promise.all(pending.map(uploadFile))
  }

  const handleCreateFolder = () => {
    if (!newFolderName.trim() || !currentFolder) return
    const newFolder: AuraFolder = {
      id: generateId(), name: newFolderName.trim(),
      parentId: currentFolder.id, children: [], files: []
    }
    setFolders(prev => {
      const update = (f: AuraFolder): AuraFolder => {
        if (f.id === currentFolder.id) return { ...f, children: [...f.children, newFolder] }
        return { ...f, children: f.children.map(update) }
      }
      return update(prev)
    })
    setNewFolderName('')
    setShowNewFolderModal(false)
  }

  const handleDelete = (type: 'file' | 'folder', id: string) => {
    if (!currentFolder) return
    setFolders(prev => {
      const update = (f: AuraFolder): AuraFolder => {
        if (f.id === currentFolder.id) {
          if (type === 'file') return { ...f, files: f.files.filter(x => x.id !== id) }
          return { ...f, children: f.children.filter(x => x.id !== id) }
        }
        return { ...f, children: f.children.map(update) }
      }
      return update(prev)
    })
  }

  const handleRename = () => {
    if (!selectedItem || !renameValue.trim() || !currentFolder) return
    setFolders(prev => {
      const update = (f: AuraFolder): AuraFolder => {
        if (f.id === currentFolder.id) {
          if (selectedItem.type === 'file')
            return { ...f, files: f.files.map(x => x.id === selectedItem.id ? { ...x, name: renameValue.trim() } : x) }
          return { ...f, children: f.children.map(x => x.id === selectedItem.id ? { ...x, name: renameValue.trim() } : x) }
        }
        return { ...f, children: f.children.map(update) }
      }
      return update(prev)
    })
    setRenameValue(''); setShowRenameModal(false); setSelectedItem(null)
  }

  const handleMove = () => {
    if (!selectedItem || !selectedMoveTarget || !currentFolder) return
    let itemToMove: AuraFile | AuraFolder | null = null
    if (selectedItem.type === 'file') itemToMove = currentFolder.files.find(f => f.id === selectedItem.id) || null
    else itemToMove = currentFolder.children.find(c => c.id === selectedItem.id) || null
    if (!itemToMove) return
    setFolders(prev => {
      const update = (f: AuraFolder): AuraFolder => {
        if (f.id === currentFolder.id) {
          if (selectedItem.type === 'file') return { ...f, files: f.files.filter(x => x.id !== selectedItem.id) }
          return { ...f, children: f.children.filter(x => x.id !== selectedItem.id) }
        }
        if (f.id === selectedMoveTarget) {
          if (selectedItem.type === 'file') return { ...f, files: [...f.files, itemToMove as AuraFile] }
          return { ...f, children: [...f.children, { ...(itemToMove as AuraFolder), parentId: f.id }] }
        }
        return { ...f, children: f.children.map(update) }
      }
      return update(prev)
    })
    setShowMoveModal(false); setSelectedMoveTarget(null); setSelectedItem(null)
  }

  const handleFolderAvatar = (folderId: string, imageData: string) => {
    setFolders(prev => {
      const update = (f: AuraFolder): AuraFolder => {
        if (f.id === folderId) return { ...f, avatar: imageData }
        return { ...f, children: f.children.map(update) }
      }
      return update(prev)
    })
  }

  const allFolders = getAllFolders(folders, selectedItem?.type === 'folder' ? selectedItem.id : undefined)
  const hasContent = (currentFolder?.files.length ?? 0) > 0 || (currentFolder?.children.length ?? 0) > 0
  const hasPending = stagedFiles.some(f => f.status === 'pending')

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-60 bg-[#0a0a0f] border-r border-[#1e1e2a] flex flex-col">
        <div className="p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider" style={{background:'linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Meus Arquivos</h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          <FolderTree folder={folders} currentPath={currentPath} onNavigate={setCurrentPath} level={0} />
        </nav>
        <div className="p-4 border-t border-[#1e1e2a] flex flex-col gap-2">
          <CosmicButton variant="outline" size="sm" className="w-full" onClick={() => setShowNewFolderModal(true)}>
            <FolderPlus size={16} /> Nova Pasta
          </CosmicButton>
          <button
            onClick={() => { localStorage.removeItem('aura_auth'); router.push('/') }}
            className="flex items-center gap-2 text-xs text-[#888899] hover:text-white transition-colors px-3 py-2"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-[#0d0d12] p-6 overflow-y-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={14} className="text-[#888899]" />}
                <button
                  onClick={() => setCurrentPath(crumb.path)}
                  className={cn("hover:text-white transition-colors", index === breadcrumbs.length - 1 ? "text-white font-medium" : "text-[#888899]")}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(true)}>
              <FolderPlus size={16} /> Nova Pasta
            </CosmicButton>
            <label>
              <CosmicButton variant="filled" size="sm" as="span" className="cursor-pointer">
                <Upload size={16} /> Carregar Arquivo
              </CosmicButton>
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileSelect} />
            </label>
          </div>
        </div>

        {/* Staged Files */}
        {stagedFiles.length > 0 && (
          <div className="mb-6 space-y-2">
            {stagedFiles.map(staged => (
              <div key={staged.id} className="p-3 rounded-lg border border-[#2a2a3a] bg-[#13131a] flex items-center gap-3">
                <FileIcon type={getFileType(staged.file.name)} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{staged.file.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-[#888899]">{formatFileSize(staged.file.size)}</p>
                    {staged.status === 'uploading' && <span className="text-xs text-[#3b82f6]">{staged.progress}%</span>}
                    {staged.status === 'error' && <span className="text-xs text-red-400 truncate">{staged.error}</span>}
                    {staged.status === 'done' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Enviado</span>}
                  </div>
                  {staged.status === 'uploading' && (
                    <div className="mt-1.5 h-0.5 bg-[#2a2a3a] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{width:`${staged.progress}%`,background:'linear-gradient(90deg,#3b82f6,#7c3aed,#06b6d4)'}}/>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {staged.status === 'uploading' && <CosmicSpinner size={16}/>}
                  {staged.status === 'pending' && (
                    <button onClick={() => setStagedFiles(prev => prev.filter(f => f.id !== staged.id))} className="p-1 hover:bg-[#1e1e2a] rounded transition-colors">
                      <X size={16} className="text-[#888899]"/>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {hasPending && (
              <CosmicButton variant="filled" size="sm" onClick={handleUploadAll} className="w-full mt-2">
                <Upload size={16}/> Carregar {stagedFiles.filter(f=>f.status==='pending').length > 1 ? `${stagedFiles.filter(f=>f.status==='pending').length} arquivos` : 'arquivo'}
              </CosmicButton>
            )}
          </div>
        )}

        {/* Drop Zone / Grid */}
        {!hasContent && stagedFiles.length === 0 ? (
          <div
            className={cn("rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed transition-all duration-300",
              isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/50")}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:'linear-gradient(135deg,#3b82f620,#7c3aed20,#06b6d420)'}}>
              <Upload size={28} style={{color:'#7c3aed'}}/>
            </div>
            <p className="text-white text-lg font-medium mb-1">Arraste arquivos aqui</p>
            <p className="text-[#888899] text-sm">ou clique em Carregar Arquivo — múltiplos arquivos suportados</p>
          </div>
        ) : (
          <>
            <div
              className={cn("rounded-lg p-3 mb-6 flex items-center justify-center gap-2 border border-dashed transition-all duration-300 cursor-pointer",
                isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/40")}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} className="text-[#888899]"/>
              <p className="text-[#888899] text-sm">Arraste arquivos aqui ou clique para selecionar</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {currentFolder?.children.map(folder => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  onOpen={() => navigateToFolder(folder.id)}
                  onMove={() => { setSelectedItem({ type: 'folder', id: folder.id }); setShowMoveModal(true) }}
                  onRename={() => { setSelectedItem({ type: 'folder', id: folder.id }); setRenameValue(folder.name); setShowRenameModal(true) }}
                  onDelete={() => handleDelete('folder', folder.id)}
                  onAvatarChange={(data) => handleFolderAvatar(folder.id, data)}
                />
              ))}
              {currentFolder?.files.map(file => (
                <div key={file.id} className="group relative cosmic-border p-4 rounded-xl hover:bg-[#1a1a24] transition-all duration-200">
                  <div className="flex flex-col items-center">
                    <FileIcon type={file.type} size={44}/>
                    <p className="mt-2 text-xs text-white text-center w-full truncate" title={file.name}>{file.name}</p>
                    <p className="text-[10px] text-[#888899] mt-0.5">{formatFileSize(file.size)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                        <MoreVertical size={14} className="text-[#888899]"/>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                      <DropdownMenuItem onClick={() => { setSelectedItem({ type: 'file', id: file.id }); setShowMoveModal(true) }}>Mover para...</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setSelectedItem({ type: 'file', id: file.id }); setRenameValue(file.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete('file', file.id)} className="text-red-400">Excluir</DropdownMenuItem>
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

      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a]">
          <DialogHeader><DialogTitle className="text-white">Mover para...</DialogTitle></DialogHeader>
          <div className="py-4 max-h-[300px] overflow-y-auto space-y-1">
            {allFolders.map(f => (
              <button key={f.id} onClick={() => setSelectedMoveTarget(f.id)}
                className={cn("w-full text-left p-3 rounded-lg flex items-center gap-2 transition-colors",
                  selectedMoveTarget === f.id ? "bg-[#3b82f6]/20 text-white" : "hover:bg-[#1e1e2a] text-[#888899]")}>
                <Folder size={16} className="text-[#3b82f6] shrink-0"/>
                <span className="text-sm truncate">{f.path}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowMoveModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleMove} disabled={!selectedMoveTarget}>Mover</CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FolderCard({ folder, onOpen, onMove, onRename, onDelete, onAvatarChange }: {
  folder: AuraFolder & { avatar?: string }
  onOpen: () => void; onMove: () => void; onRename: () => void; onDelete: () => void
  onAvatarChange: (data: string) => void
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onAvatarChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="group relative cosmic-border p-4 rounded-xl hover:bg-[#1a1a24] transition-all duration-200">
      <button onClick={onOpen} className="flex flex-col items-center w-full">
        <div className="relative">
          {folder.avatar ? (
            <div className="w-12 h-12 rounded-full overflow-hidden" style={{border:'2px solid transparent',background:'linear-gradient(#13131a,#13131a) padding-box,linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4) border-box'}}>
              <img src={folder.avatar} alt={folder.name} className="w-full h-full object-cover"/>
            </div>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id={`fg-${folder.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6"/>
                  <stop offset="50%" stopColor="#7c3aed"/>
                  <stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
              <path d="M4 12C4 9.79 5.79 8 8 8H18L22 12H40C42.21 12 44 13.79 44 16V36C44 38.21 42.21 40 40 40H8C5.79 40 4 38.21 4 36V12Z" fill={`url(#fg-${folder.id})`} opacity="0.9"/>
            </svg>
          )}
          <button onClick={e => { e.stopPropagation(); avatarInputRef.current?.click() }}
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#13131a] border border-[#2a2a3a] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={10} className="text-[#888899]"/>
          </button>
        </div>
        <p className="mt-2 text-xs text-white text-center w-full truncate" title={folder.name}>{folder.name}</p>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
            <MoreVertical size={14} className="text-[#888899]"/>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
          <DropdownMenuItem onClick={onMove}>Mover para...</DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>Renomear</DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-red-400">Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect}/>
    </div>
  )
}

function FolderTree({ folder, currentPath, onNavigate, level }: {
  folder: AuraFolder; currentPath: string[]; onNavigate: (path: string[]) => void; level: number
}) {
  const isActive = currentPath[currentPath.length - 1] === folder.id
  const isInPath = currentPath.includes(folder.id)
  const getPath = (): string[] => {
    if (level === 0) return ['root']
    const idx = currentPath.indexOf(folder.id)
    if (idx >= 0) return currentPath.slice(0, idx + 1)
    return [...currentPath, folder.id]
  }
  return (
    <div>
      <button onClick={() => onNavigate(getPath())}
        className={cn("w-full text-left py-2 rounded-lg flex items-center gap-2 transition-colors text-sm",
          isActive ? "text-white" : "hover:bg-[#1a1a24] text-[#888899] hover:text-white")}
        style={{paddingLeft:`${12 + level * 12}px`, paddingRight:'12px', borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent'}}>
        <Folder size={15} style={{color: isInPath ? '#7c3aed' : undefined, flexShrink:0}}/>
        <span className="truncate">{folder.name}</span>
      </button>
      {isInPath && folder.children.map(child => (
        <FolderTree key={child.id} folder={child} currentPath={currentPath} onNavigate={onNavigate} level={level + 1}/>
      ))}
    </div>
  )
}
