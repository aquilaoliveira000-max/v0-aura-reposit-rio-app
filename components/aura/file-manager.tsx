'use client'

import { useState, useCallback, useRef, DragEvent, useEffect } from 'react'
import { Upload, FolderPlus, ChevronRight, X, MoreVertical, Folder, LogOut, Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CosmicButton } from './cosmic-button'
import { CosmicSpinner } from './cosmic-spinner'
import { FileIcon } from './file-icons'
import { AuraFile, AuraFolder, StagedFile, formatFileSize, getFileType, generateId } from '@/lib/aura-types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const initialFolders: AuraFolder = {
  id: 'root',
  name: 'Meus Arquivos',
  parentId: null,
  children: [],
  files: []
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

export function FileManager() {
  const router = useRouter()
  const [folders, setFolders] = useState<AuraFolder>(initialFolders)
  const [currentPath, setCurrentPath] = useState<string[]>(['root'])
  const [stagedFile, setStagedFile] = useState<StagedFile | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ type: 'file' | 'folder'; id: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedMoveTarget, setSelectedMoveTarget] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('aura_auth')) {
      router.push('/')
    }
  }, [router])

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
    if (files.length > 0) setStagedFile({ file: files[0], id: generateId() })
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) setStagedFile({ file: files[0], id: generateId() })
  }

  const handleUpload = async () => {
    if (!stagedFile || !currentFolder) return
    setIsUploading(true)
    setUploadError('')
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', stagedFile.file)
      formData.append('folderPath', getFolderPath(folders, currentPath))

      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
      }

      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', '/api/upload')
        xhr.onload = () => {
          const res = JSON.parse(xhr.responseText)
          if (res.success) resolve()
          else reject(new Error(res.error || 'Erro no upload'))
        }
        xhr.onerror = () => reject(new Error('Erro de conexão'))
        xhr.send(formData)
      })

      const newFile: AuraFile = {
        id: stagedFile.id,
        name: stagedFile.file.name,
        type: getFileType(stagedFile.file.name),
        size: stagedFile.file.size,
        createdAt: new Date()
      }

      setFolders(prev => {
        const update = (f: AuraFolder): AuraFolder => {
          if (f.id === currentFolder.id) return { ...f, files: [...f.files, newFile] }
          return { ...f, children: f.children.map(update) }
        }
        return update(prev)
      })
      setStagedFile(null)
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao enviar arquivo')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleCreateFolder = () => {
    if (!newFolderName.trim() || !currentFolder) return
    const newFolder: AuraFolder = {
      id: generateId(), name: newFolderName.trim(),
      parentId: currentFolder.id, children: [], files: [],
      avatar: undefined
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

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-60 bg-[#0e0e12] border-r border-[#2a2a32] flex flex-col">
        <div className="p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[#888899]">Meus Arquivos</h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          <FolderTree folder={folders} currentPath={currentPath} onNavigate={setCurrentPath} level={0} />
        </nav>
        <div className="p-4 border-t border-[#2a2a32] flex flex-col gap-2">
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
      <main className="flex-1 bg-[#111114] p-6 overflow-y-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={14} className="text-[#888899]" />}
                <button
                  onClick={() => setCurrentPath(crumb.path)}
                  className={cn("hover:text-white transition-colors", index === breadcrumbs.length - 1 ? "text-white" : "text-[#888899]")}
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
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
            </label>
          </div>
        </div>

        {/* Staged File */}
        {stagedFile && (
          <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-[#7c3aed]/50 bg-[#18181c]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileIcon type={getFileType(stagedFile.file.name)} size={32} />
                <div>
                  <p className="text-white font-medium">{stagedFile.file.name}</p>
                  <p className="text-sm text-[#888899]">{formatFileSize(stagedFile.file.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <CosmicSpinner size={18} />
                    <span className="text-sm text-[#888899]">{uploadProgress}%</span>
                  </div>
                ) : (
                  <>
                    <CosmicButton variant="filled" size="sm" onClick={handleUpload}>Carregar</CosmicButton>
                    <button onClick={() => setStagedFile(null)} className="p-2 hover:bg-[#1e1e24] rounded-lg transition-colors">
                      <X size={18} className="text-[#888899]" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {isUploading && (
              <div className="mt-3 h-1 bg-[#2a2a32] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #3b82f6, #7c3aed, #06b6d4)' }}
                />
              </div>
            )}
            {uploadError && <p className="text-red-400 text-sm mt-2">{uploadError}</p>}
          </div>
        )}

        {/* Drop Zone / Grid */}
        {!hasContent && !stagedFile ? (
          <div
            className={cn("cosmic-dropzone rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px]", isDragging && "dragging")}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          >
            <Upload size={48} className="text-[#888899] mb-4" />
            <p className="text-white text-lg mb-2">Arraste arquivos aqui</p>
            <p className="text-[#888899] text-sm">ou clique em Carregar Arquivo</p>
          </div>
        ) : (
          <>
            <div
              className={cn("cosmic-dropzone rounded-lg p-4 mb-6 flex items-center justify-center", isDragging && "dragging")}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            >
              <Upload size={20} className="text-[#888899] mr-2" />
              <p className="text-[#888899] text-sm">Arraste arquivos aqui</p>
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
                <div key={file.id} className="group cosmic-border p-4 rounded-lg hover:bg-[#1e1e24] transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col items-center flex-1">
                      <FileIcon type={file.type} size={48} />
                      <p className="mt-2 text-sm text-white text-center truncate w-full">{file.name}</p>
                      <p className="text-xs text-[#888899]">{formatFileSize(file.size)}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                          <MoreVertical size={16} className="text-[#888899]" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                        <DropdownMenuItem onClick={() => { setSelectedItem({ type: 'file', id: file.id }); setShowMoveModal(true) }}>Mover para...</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedItem({ type: 'file', id: file.id }); setRenameValue(file.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete('file', file.id)} className="text-red-400">Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className="bg-[#18181c] border-[#2a2a32]">
          <DialogHeader><DialogTitle className="text-white">Nova Pasta</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              className="bg-[#111114] border-[#2a2a32] text-white" placeholder="Nome da pasta"
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} />
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleCreateFolder}>Criar</CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="bg-[#18181c] border-[#2a2a32]">
          <DialogHeader><DialogTitle className="text-white">Renomear</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
              className="bg-[#111114] border-[#2a2a32] text-white" placeholder="Novo nome"
              onKeyDown={e => e.key === 'Enter' && handleRename()} />
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowRenameModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleRename}>Renomear</CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent className="bg-[#18181c] border-[#2a2a32]">
          <DialogHeader><DialogTitle className="text-white">Mover para...</DialogTitle></DialogHeader>
          <div className="py-4 max-h-[300px] overflow-y-auto">
            {allFolders.map(f => (
              <button key={f.id} onClick={() => setSelectedMoveTarget(f.id)}
                className={cn("w-full text-left p-3 rounded-lg flex items-center gap-2 transition-colors",
                  selectedMoveTarget === f.id ? "bg-[#3b82f6]/20 text-white" : "hover:bg-[#1e1e24] text-[#888899]")}>
                <Folder size={18} className="text-[#3b82f6]" />
                <span className="text-sm">{f.path}</span>
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
  onOpen: () => void
  onMove: () => void
  onRename: () => void
  onDelete: () => void
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
    <div className="group cosmic-border p-4 rounded-lg hover:bg-[#1e1e24] transition-all">
      <div className="flex items-start justify-between">
        <button onClick={onOpen} className="flex flex-col items-center flex-1">
          <div className="relative">
            {folder.avatar ? (
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-transparent"
                style={{ borderImage: 'linear-gradient(135deg, #3b82f6, #7c3aed, #06b6d4) 1' }}>
                <img src={folder.avatar} alt={folder.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient id={`fg-${folder.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="50%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <path d="M4 12C4 9.79 5.79 8 8 8H18L22 12H40C42.21 12 44 13.79 44 16V36C44 38.21 42.21 40 40 40H8C5.79 40 4 38.21 4 36V12Z"
                  fill={`url(#fg-${folder.id})`} opacity="0.9" />
              </svg>
            )}
            <button
              onClick={e => { e.stopPropagation(); avatarInputRef.current?.click() }}
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#18181c] border border-[#2a2a32] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera size={10} className="text-[#888899]" />
            </button>
          </div>
          <p className="mt-2 text-sm text-white text-center truncate w-full">{folder.name}</p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
              <MoreVertical size={16} className="text-[#888899]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
            <DropdownMenuItem onClick={onMove}>Mover para...</DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>Renomear</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-400">Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
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
      <button
        onClick={() => onNavigate(getPath())}
        className={cn("w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm",
          isActive ? "bg-[#1e1e24] text-white border-l-2 border-[#3b82f6]" : "hover:bg-[#1e1e24] text-[#888899] hover:text-white")}
        style={{ paddingLeft: `${12 + level * 12}px` }}
      >
        <Folder size={16} className={isInPath ? "text-[#3b82f6]" : ""} />
        {folder.name}
      </button>
      {isInPath && folder.children.map(child => (
        <FolderTree key={child.id} folder={child} currentPath={currentPath} onNavigate={onNavigate} level={level + 1} />
      ))}
    </div>
  )
}
