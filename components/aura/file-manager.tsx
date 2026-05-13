'use client'

import { useState, useCallback, DragEvent } from 'react'
import { Upload, FolderPlus, ChevronRight, X, MoreVertical, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CosmicButton } from './cosmic-button'
import { CosmicSpinner } from './cosmic-spinner'
import { FileIcon } from './file-icons'
import { 
  AuraFile, 
  AuraFolder, 
  StagedFile, 
  formatFileSize, 
  getFileType, 
  generateId 
} from '@/lib/aura-types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

// Mock initial data
const initialFolders: AuraFolder = {
  id: 'root',
  name: 'Meus Arquivos',
  parentId: null,
  children: [
    {
      id: 'folder-1',
      name: 'Projetos',
      parentId: 'root',
      children: [
        {
          id: 'folder-1-1',
          name: 'Cliente X',
          parentId: 'folder-1',
          children: [],
          files: [
            { id: 'file-1', name: 'proposta.pdf', type: 'pdf', size: 2500000, createdAt: new Date() },
            { id: 'file-2', name: 'briefing.docx', type: 'document', size: 150000, createdAt: new Date() },
          ]
        },
        {
          id: 'folder-1-2',
          name: 'Cliente Y',
          parentId: 'folder-1',
          children: [],
          files: []
        }
      ],
      files: [
        { id: 'file-3', name: 'planejamento-2024.xlsx', type: 'document', size: 450000, createdAt: new Date() },
      ]
    },
    {
      id: 'folder-2',
      name: 'Documentos',
      parentId: 'root',
      children: [],
      files: [
        { id: 'file-4', name: 'contrato.pdf', type: 'pdf', size: 1200000, createdAt: new Date() },
        { id: 'file-5', name: 'identidade.jpg', type: 'image', size: 3500000, createdAt: new Date() },
      ]
    },
    {
      id: 'folder-3',
      name: 'Mídia',
      parentId: 'root',
      children: [],
      files: [
        { id: 'file-6', name: 'apresentacao.mp4', type: 'video', size: 125000000, createdAt: new Date() },
        { id: 'file-7', name: 'podcast-ep1.mp3', type: 'audio', size: 45000000, createdAt: new Date() },
      ]
    }
  ],
  files: []
}

function findFolder(root: AuraFolder, path: string[]): AuraFolder | null {
  if (path.length === 0 || (path.length === 1 && path[0] === root.id)) {
    return root
  }
  
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
      for (const child of f.children) {
        traverse(child, `${currentPath} > ${child.name}`)
      }
    }
  }
  
  traverse(folder, folder.name)
  return results
}

export function FileManager() {
  const [folders, setFolders] = useState<AuraFolder>(initialFolders)
  const [currentPath, setCurrentPath] = useState<string[]>(['root'])
  const [stagedFile, setStagedFile] = useState<StagedFile | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ type: 'file' | 'folder'; id: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedMoveTarget, setSelectedMoveTarget] = useState<string | null>(null)

  const currentFolder = findFolder(folders, currentPath)
  
  const breadcrumbs = currentPath.map((id, index) => {
    const pathToHere = currentPath.slice(0, index + 1)
    const folder = findFolder(folders, pathToHere)
    return { id, name: folder?.name || id, path: pathToHere }
  })

  const navigateToFolder = (folderId: string) => {
    const folder = currentFolder?.children.find(c => c.id === folderId)
    if (folder) {
      setCurrentPath([...currentPath, folderId])
    }
  }

  const navigateToBreadcrumb = (path: string[]) => {
    setCurrentPath(path)
  }

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setStagedFile({ file: files[0], id: generateId() })
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setStagedFile({ file: files[0], id: generateId() })
    }
  }

  const handleUpload = async () => {
    if (!stagedFile || !currentFolder) return
    
    setIsUploading(true)
    
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const newFile: AuraFile = {
      id: stagedFile.id,
      name: stagedFile.file.name,
      type: getFileType(stagedFile.file.name),
      size: stagedFile.file.size,
      createdAt: new Date()
    }
    
    setFolders(prev => {
      const updateFolder = (folder: AuraFolder): AuraFolder => {
        if (folder.id === currentFolder.id) {
          return { ...folder, files: [...folder.files, newFile] }
        }
        return { ...folder, children: folder.children.map(updateFolder) }
      }
      return updateFolder(prev)
    })
    
    setStagedFile(null)
    setIsUploading(false)
  }

  const handleCreateFolder = () => {
    if (!newFolderName.trim() || !currentFolder) return
    
    const newFolder: AuraFolder = {
      id: generateId(),
      name: newFolderName.trim(),
      parentId: currentFolder.id,
      children: [],
      files: []
    }
    
    setFolders(prev => {
      const updateFolder = (folder: AuraFolder): AuraFolder => {
        if (folder.id === currentFolder.id) {
          return { ...folder, children: [...folder.children, newFolder] }
        }
        return { ...folder, children: folder.children.map(updateFolder) }
      }
      return updateFolder(prev)
    })
    
    setNewFolderName('')
    setShowNewFolderModal(false)
  }

  const handleDelete = () => {
    if (!selectedItem || !currentFolder) return
    
    setFolders(prev => {
      const updateFolder = (folder: AuraFolder): AuraFolder => {
        if (folder.id === currentFolder.id) {
          if (selectedItem.type === 'file') {
            return { ...folder, files: folder.files.filter(f => f.id !== selectedItem.id) }
          } else {
            return { ...folder, children: folder.children.filter(c => c.id !== selectedItem.id) }
          }
        }
        return { ...folder, children: folder.children.map(updateFolder) }
      }
      return updateFolder(prev)
    })
    
    setSelectedItem(null)
  }

  const handleRename = () => {
    if (!selectedItem || !renameValue.trim() || !currentFolder) return
    
    setFolders(prev => {
      const updateFolder = (folder: AuraFolder): AuraFolder => {
        if (folder.id === currentFolder.id) {
          if (selectedItem.type === 'file') {
            return { 
              ...folder, 
              files: folder.files.map(f => 
                f.id === selectedItem.id ? { ...f, name: renameValue.trim() } : f
              ) 
            }
          } else {
            return { 
              ...folder, 
              children: folder.children.map(c => 
                c.id === selectedItem.id ? { ...c, name: renameValue.trim() } : c
              ) 
            }
          }
        }
        return { ...folder, children: folder.children.map(updateFolder) }
      }
      return updateFolder(prev)
    })
    
    setRenameValue('')
    setShowRenameModal(false)
    setSelectedItem(null)
  }

  const handleMove = () => {
    if (!selectedItem || !selectedMoveTarget || !currentFolder) return
    
    // Find the item to move
    let itemToMove: AuraFile | AuraFolder | null = null
    if (selectedItem.type === 'file') {
      itemToMove = currentFolder.files.find(f => f.id === selectedItem.id) || null
    } else {
      itemToMove = currentFolder.children.find(c => c.id === selectedItem.id) || null
    }
    
    if (!itemToMove) return
    
    setFolders(prev => {
      const updateFolder = (folder: AuraFolder): AuraFolder => {
        // Remove from current location
        if (folder.id === currentFolder.id) {
          if (selectedItem.type === 'file') {
            return { ...folder, files: folder.files.filter(f => f.id !== selectedItem.id) }
          } else {
            return { ...folder, children: folder.children.filter(c => c.id !== selectedItem.id) }
          }
        }
        // Add to target location
        if (folder.id === selectedMoveTarget) {
          if (selectedItem.type === 'file') {
            return { ...folder, files: [...folder.files, itemToMove as AuraFile] }
          } else {
            return { ...folder, children: [...folder.children, { ...(itemToMove as AuraFolder), parentId: folder.id }] }
          }
        }
        return { ...folder, children: folder.children.map(updateFolder) }
      }
      return updateFolder(prev)
    })
    
    setShowMoveModal(false)
    setSelectedMoveTarget(null)
    setSelectedItem(null)
  }

  const openRenameModal = (type: 'file' | 'folder', id: string) => {
    setSelectedItem({ type, id })
    if (type === 'file') {
      const file = currentFolder?.files.find(f => f.id === id)
      setRenameValue(file?.name || '')
    } else {
      const folder = currentFolder?.children.find(c => c.id === id)
      setRenameValue(folder?.name || '')
    }
    setShowRenameModal(true)
  }

  const openMoveModal = (type: 'file' | 'folder', id: string) => {
    setSelectedItem({ type, id })
    setShowMoveModal(true)
  }

  const allFolders = getAllFolders(folders, selectedItem?.type === 'folder' ? selectedItem.id : undefined)

  const hasFiles = (currentFolder?.files.length ?? 0) > 0 || (currentFolder?.children.length ?? 0) > 0

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar-bg border-r border-border cosmic-glow flex flex-col">
        <div className="p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Meus Arquivos
          </h2>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-2">
          <FolderTree 
            folder={folders} 
            currentPath={currentPath}
            onNavigate={(path) => setCurrentPath(path)}
            level={0}
          />
        </nav>
        
        <div className="p-4 border-t border-border">
          <CosmicButton 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setShowNewFolderModal(true)}
          >
            <FolderPlus size={16} />
            Nova Pasta
          </CosmicButton>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-background p-6 overflow-y-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
                <button
                  onClick={() => navigateToBreadcrumb(crumb.path)}
                  className={cn(
                    "hover:text-white transition-colors",
                    index === breadcrumbs.length - 1 ? "text-white" : "text-muted-foreground"
                  )}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            <CosmicButton 
              variant="outline" 
              size="sm"
              onClick={() => setShowNewFolderModal(true)}
            >
              <FolderPlus size={16} />
              Nova Pasta
            </CosmicButton>
            <label>
              <CosmicButton variant="filled" size="sm" as="span" className="cursor-pointer">
                <Upload size={16} />
                Carregar Arquivo
              </CosmicButton>
              <input 
                type="file" 
                className="hidden" 
                onChange={handleFileSelect}
              />
            </label>
          </div>
        </div>

        {/* Staged File */}
        {stagedFile && (
          <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-cosmic-orange/50 bg-surface">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileIcon type={getFileType(stagedFile.file.name)} size={32} />
                <div>
                  <p className="text-white font-medium">{stagedFile.file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(stagedFile.file.size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CosmicButton 
                  variant="filled" 
                  size="sm"
                  loading={isUploading}
                  onClick={handleUpload}
                >
                  Carregar
                </CosmicButton>
                <button 
                  onClick={() => setStagedFile(null)}
                  className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <X size={18} className="text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drop Zone / File Grid */}
        {!hasFiles && !stagedFile ? (
          <div
            className={cn(
              "cosmic-dropzone rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px]",
              isDragging && "dragging"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload size={48} className="text-muted-foreground mb-4" />
            <p className="text-white text-lg mb-2">Arraste arquivos aqui</p>
            <p className="text-muted-foreground text-sm">ou clique em Carregar Arquivo</p>
          </div>
        ) : (
          <>
            {/* Slim Drop Zone */}
            <div
              className={cn(
                "cosmic-dropzone rounded-lg p-4 mb-6 flex items-center justify-center",
                isDragging && "dragging"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload size={20} className="text-muted-foreground mr-2" />
              <p className="text-muted-foreground text-sm">Arraste arquivos aqui</p>
            </div>

            {/* File Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {/* Folders */}
              {currentFolder?.children.map(folder => (
                <div
                  key={folder.id}
                  className="group cosmic-border p-4 rounded-lg cursor-pointer hover:bg-surface-hover transition-all"
                >
                  <div className="flex items-start justify-between">
                    <button
                      onClick={() => navigateToFolder(folder.id)}
                      className="flex flex-col items-center flex-1"
                    >
                      <FileIcon type="folder" size={48} />
                      <p className="mt-2 text-sm text-white text-center truncate w-full">
                        {folder.name}
                      </p>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-surface rounded transition-all">
                          <MoreVertical size={16} className="text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-surface border-border">
                        <DropdownMenuItem onClick={() => openMoveModal('folder', folder.id)}>
                          Mover para...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRenameModal('folder', folder.id)}>
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            setSelectedItem({ type: 'folder', id: folder.id })
                            handleDelete()
                          }}
                          className="text-destructive"
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
              
              {/* Files */}
              {currentFolder?.files.map(file => (
                <div
                  key={file.id}
                  className="group cosmic-border p-4 rounded-lg hover:bg-surface-hover transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col items-center flex-1">
                      <FileIcon type={file.type} size={48} />
                      <p className="mt-2 text-sm text-white text-center truncate w-full">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-surface rounded transition-all">
                          <MoreVertical size={16} className="text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-surface border-border">
                        <DropdownMenuItem onClick={() => openMoveModal('file', file.id)}>
                          Mover para...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRenameModal('file', file.id)}>
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            setSelectedItem({ type: 'file', id: file.id })
                            handleDelete()
                          }}
                          className="text-destructive"
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* New Folder Modal */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className="bg-surface border-border cosmic-glow">
          <DialogHeader>
            <DialogTitle className="text-white">Nova Pasta</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm text-muted-foreground">Nome da pasta</label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="mt-2 bg-background border-border focus:border-cosmic-blue"
              placeholder="Digite o nome da pasta"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(false)}>
              Cancelar
            </CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleCreateFolder}>
              Criar
            </CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="bg-surface border-border cosmic-glow">
          <DialogHeader>
            <DialogTitle className="text-white">Renomear</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm text-muted-foreground">Novo nome</label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-2 bg-background border-border focus:border-cosmic-blue"
              placeholder="Digite o novo nome"
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowRenameModal(false)}>
              Cancelar
            </CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleRename}>
              Renomear
            </CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Modal */}
      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent className="bg-surface border-border cosmic-glow">
          <DialogHeader>
            <DialogTitle className="text-white">Mover para...</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[300px] overflow-y-auto">
            {allFolders.map(folder => (
              <button
                key={folder.id}
                onClick={() => setSelectedMoveTarget(folder.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg flex items-center gap-2 transition-colors",
                  selectedMoveTarget === folder.id 
                    ? "bg-cosmic-blue/20 text-white" 
                    : "hover:bg-surface-hover text-muted-foreground"
                )}
              >
                <Folder size={18} className="text-cosmic-blue" />
                <span className="text-sm">{folder.path}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowMoveModal(false)}>
              Cancelar
            </CosmicButton>
            <CosmicButton 
              variant="filled" 
              size="sm" 
              onClick={handleMove}
              disabled={!selectedMoveTarget}
            >
              Mover
            </CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Folder Tree Component
function FolderTree({ 
  folder, 
  currentPath, 
  onNavigate, 
  level 
}: { 
  folder: AuraFolder
  currentPath: string[]
  onNavigate: (path: string[]) => void
  level: number
}) {
  const isActive = currentPath[currentPath.length - 1] === folder.id
  const isInPath = currentPath.includes(folder.id)
  const pathToHere = currentPath.slice(0, currentPath.indexOf(folder.id) + 1)
  
  return (
    <div>
      <button
        onClick={() => onNavigate(level === 0 ? ['root'] : pathToHere.length ? pathToHere : [...currentPath.slice(0, level), folder.id])}
        className={cn(
          "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm",
          isActive ? "cosmic-left-accent bg-surface-hover text-white" : "hover:bg-surface-hover text-muted-foreground hover:text-white"
        )}
        style={{ paddingLeft: `${12 + level * 12}px` }}
      >
        <Folder size={16} className={isInPath ? "text-cosmic-blue" : ""} />
        {folder.name}
      </button>
      {isInPath && folder.children.map(child => (
        <FolderTree
          key={child.id}
          folder={child}
          currentPath={currentPath}
          onNavigate={onNavigate}
          level={level + 1}
        />
      ))}
    </div>
  )
}
