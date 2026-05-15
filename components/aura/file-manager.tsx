'use client'

import { useState, useCallback, useRef, DragEvent, useEffect } from 'react'
import { Upload, FolderPlus, ChevronRight, X, MoreVertical, Folder, LogOut, CheckCircle2, RefreshCw, FolderOpen, Trash2, Move, Loader2, Download, Home, ArrowLeft } from 'lucide-react'
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
  thumbnailLink?: string
  webViewLink?: string
}

interface StagedFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  folderPath?: string
}

interface BreadcrumbItem { name: string; path: string }

// ── Helpers ───────────────────────────────────────────────────────────
function isImage(m?: string) { return !!m?.startsWith('image/') }
function isVideo(m?: string) { return !!m?.startsWith('video/') }
function isPdf(m?: string)   { return m === 'application/pdf' }
function canPreview(m?: string) { return isImage(m) || isVideo(m) || isPdf(m) }
function isFolder(file: File) { return file.size === 0 && file.type === '' }

function getProxyUrl(id: string, name?: string) {
  return `/api/drive/file?id=${id}${name ? `&name=${encodeURIComponent(name)}` : ''}`
}
function getDownloadUrl(id: string, name?: string) {
  return `/api/drive/file?id=${id}&download=1${name ? `&name=${encodeURIComponent(name)}` : ''}`
}
function getFolderDownloadUrl(id: string) {
  return `https://drive.google.com/drive/folders/${id}`
}

async function apiPost(body: object) {
  const res = await fetch('/api/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export function FileManager() {
  const router = useRouter()
  const [items, setItems] = useState<DriveItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ name: 'Meus Arquivos', path: '' }])
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderNameError, setFolderNameError] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [selectedItem, setSelectedItem] = useState<DriveItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [moveFolderPath, setMoveFolderPath] = useState('')
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set())
  const [moveLoading, setMoveLoading] = useState(false)
  const [isUploadingAll, setIsUploadingAll] = useState(false)
  const [previewFile, setPreviewFile] = useState<DriveItem | null>(null)
  const [embedFile, setEmbedFile] = useState<DriveItem | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const currentPathRef = useRef('')

  useEffect(() => { currentPathRef.current = currentPath }, [currentPath])

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('aura_auth')) {
      router.push('/'); return
    }
    loadItems('', true)
    const interval = setInterval(() => loadItems(currentPathRef.current, false), 30000)
    return () => clearInterval(interval)
  }, [router])

  const loadItems = async (path: string, showLoader = true) => {
    if (showLoader) setInitialLoading(true)
    try {
      const res = await fetch(`/api/drive?folderPath=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.success) {
        setItems([
          ...data.folders.map((f: any) => ({ ...f, type: 'folder' as const })),
          ...data.files.map((f: any) => ({ ...f, type: 'file' as const }))
        ])
      }
    } catch {}
    if (showLoader) setInitialLoading(false)
  }

  const navigateTo = (name: string, path: string) => {
    setCurrentPath(path)
    setBreadcrumbs(prev => [...prev, { name, path }])
    setSelectedIds(new Set()); setSelectionMode(false)
    setSidebarOpen(false)
    loadItems(path, true)
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(breadcrumbs.slice(0, index + 1))
    setCurrentPath(crumb.path)
    setSelectedIds(new Set()); setSelectionMode(false)
    loadItems(crumb.path, true)
  }

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => {
      if (isFolder(f)) { setStagedFiles(prev => [...prev, { file: f, id: generateId(), progress: 0, status: 'error', error: 'É uma pasta. Use "Carregar Pasta".' }]); return false }
      return true
    })
    if (files.length) setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
  }, [])

  const handleItemDragStart = (e: React.DragEvent, item: DriveItem) => {
    setDraggingItemId(item.id); e.dataTransfer.setData('itemId', item.id)
  }
  const handleFolderDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); e.stopPropagation(); setDragOverFolder(id) }
  const handleFolderDragLeave = () => setDragOverFolder(null)
  const handleFolderDrop = async (e: React.DragEvent, target: DriveItem) => {
    e.preventDefault(); e.stopPropagation(); setDragOverFolder(null)
    const itemId = e.dataTransfer.getData('itemId')
    if (!itemId || itemId === target.id) return
    const targetPath = currentPath ? `${currentPath}/${target.name}` : target.name
    await moveItem(itemId, targetPath)
  }
  const moveItem = async (itemId: string, targetPath: string) => {
    setMovingIds(prev => new Set(prev).add(itemId))
    try { await apiPost({ action: 'move', id: itemId, targetPath }); loadItems(currentPath, false) }
    finally { setMovingIds(prev => { const n = new Set(prev); n.delete(itemId); return n }) }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => {
      if (isFolder(f)) { setStagedFiles(prev => [...prev, { file: f, id: generateId(), progress: 0, status: 'error', error: 'É uma pasta. Use "Carregar Pasta".' }]); return false }
      return true
    })
    if (files.length) setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
    e.target.value = ''
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setStagedFiles(prev => [...prev, ...files.map(f => {
      const rel = (f as any).webkitRelativePath || f.name
      const parts = rel.split('/'); const folderPart = parts.slice(0, -1).join('/')
      return { file: f, id: generateId(), progress: 0, status: 'pending' as const, folderPath: currentPath ? `${currentPath}/${folderPart}` : folderPart }
    })])
    e.target.value = ''
  }

  const uploadFile = async (staged: StagedFile) => {
    setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'uploading' } : f))
    try {
      const CHUNK = 3 * 1024 * 1024
      const { file } = staged
      const totalSize = file.size
      const folderPath = staged.folderPath ?? currentPathRef.current
      let sessionUri: string | null = null
      let offset = 0
      while (offset < totalSize) {
        const chunk = file.slice(offset, offset + CHUNK)
        const chunkFile = new File([chunk], file.name, { type: file.type })
        const formData = new FormData()
        formData.append('file', chunkFile)
        formData.append('folderPath', folderPath)
        formData.append('chunkStart', offset.toString())
        formData.append('totalSize', totalSize.toString())
        if (sessionUri) formData.append('sessionUri', sessionUri)
        const res = await fetch('/api/drive', { method: 'POST', body: formData })
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Erro')
        if (data.sessionUri) sessionUri = data.sessionUri
        offset += chunk.size
        setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, progress: Math.min(Math.round((offset / totalSize) * 100), 99) } : f))
        if (data.done) break
      }
      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'done', progress: 100 } : f))
      setTimeout(() => { setStagedFiles(prev => prev.filter(f => f.id !== staged.id)); loadItems(currentPathRef.current, false) }, 1500)
    } catch (err: any) {
      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'error', error: err.message } : f))
    }
  }

  const handleUploadAll = async () => {
    if (isUploadingAll) return
    setIsUploadingAll(true)
    const pending = stagedFiles.filter(f => f.status === 'pending')
    const folderUps = pending.filter(f => f.folderPath !== undefined && f.folderPath !== currentPathRef.current)
    const regularUps = pending.filter(f => f.folderPath === undefined || f.folderPath === currentPathRef.current)
    await Promise.all(regularUps.map(uploadFile))
    for (const s of folderUps) await uploadFile(s)
    setIsUploadingAll(false)
  }

  const handleDelete = async (item: DriveItem) => {
    setDeletingIds(prev => new Set(prev).add(item.id))
    try { await apiPost({ action: item.type === 'folder' ? 'deleteFolder' : 'delete', id: item.id }); loadItems(currentPath, false) }
    finally { setDeletingIds(prev => { const n = new Set(prev); n.delete(item.id); return n }) }
  }

  const handleDeleteSelected = async () => {
    const toDelete = items.filter(i => selectedIds.has(i.id))
    toDelete.forEach(item => setDeletingIds(prev => new Set(prev).add(item.id)))
    await Promise.all(toDelete.map(item => apiPost({ action: item.type === 'folder' ? 'deleteFolder' : 'delete', id: item.id })))
    setSelectedIds(new Set()); setSelectionMode(false); loadItems(currentPath, false)
  }

  const openMoveModal = (item?: DriveItem) => {
    if (item) setSelectedIds(new Set([item.id]))
    setMoveFolderPath(''); setShowMoveModal(true)
  }

  const handleMoveSelected = async () => {
    setMoveLoading(true)
    const ids = Array.from(selectedIds)
    ids.forEach(id => setMovingIds(prev => new Set(prev).add(id)))
    await Promise.all(ids.map(id => apiPost({ action: 'move', id, targetPath: moveFolderPath })))
    setMovingIds(new Set()); setSelectedIds(new Set()); setSelectionMode(false)
    setShowMoveModal(false); setMoveLoading(false); loadItems(currentPath, false)
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    if (items.some(i => i.type === 'folder' && i.name.toLowerCase() === name.toLowerCase())) {
      setFolderNameError('Já existe uma pasta com esse nome.'); return
    }
    setCreatingFolder(true); setFolderNameError('')
    await apiPost({ action: 'createFolder', name, folderPath: currentPath })
    setNewFolderName(''); setCreatingFolder(false); setShowNewFolderModal(false)
    loadItems(currentPath, false)
  }

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return
    await apiPost({ action: 'rename', id: selectedItem.id, name: renameValue.trim() })
    setShowRenameModal(false); setSelectedItem(null); setRenameValue('')
    loadItems(currentPath, false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const downloadSelected = () => {
    items.filter(i => selectedIds.has(i.id) && i.type === 'file').forEach(f => {
      const a = document.createElement('a')
      a.href = getDownloadUrl(f.id, f.name)
      a.click()
    })
  }

  const folders = items.filter(i => i.type === 'folder')
  const files = items.filter(i => i.type === 'file')
  const hasPending = stagedFiles.some(f => f.status === 'pending')
  const availableFolders = folders.filter(f => !selectedIds.has(f.id))

  // ── Item Card Component (shared between desktop and mobile) ──────────
  const ItemCard = ({ item, mobile = false }: { item: DriveItem, mobile?: boolean }) => {
    const isDeleting = deletingIds.has(item.id)
    const isMoving = movingIds.has(item.id)
    const isSelected = selectedIds.has(item.id)
    const isDragTarget = dragOverFolder === item.id

    const handleClick = () => {
      if (selectionMode) { toggleSelect(item.id); return }
      if (item.type === 'folder') {
        navigateTo(item.name, currentPath ? `${currentPath}/${item.name}` : item.name)
      } else {
        if (isImage(item.mimeType)) setPreviewFile(item)
        else if (canPreview(item.mimeType)) setEmbedFile(item)
        else window.open(getDownloadUrl(item.id, item.name), '_blank')
      }
    }

    if (mobile) {
      return (
        <div className={cn("flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2a] active:bg-[#1a1a24] transition-colors",
          isSelected && "bg-[#3b82f6]/10",
          isDeleting || isMoving ? "opacity-40" : "")}>
          {selectionMode && (
            <button onClick={() => toggleSelect(item.id)}
              className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                isSelected ? "bg-[#3b82f6] border-[#3b82f6]" : "border-[#2a2a3a]")}>
              {isSelected && <CheckCircle2 size={14} className="text-white"/>}
            </button>
          )}
          <button onClick={handleClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
            {item.type === 'folder' ? (
              <svg width="36" height="36" viewBox="0 0 48 48" fill="none" className="shrink-0">
                <defs><linearGradient id={`m-${item.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6"/><stop offset="50%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient></defs>
                <path d="M4 12C4 9.79 5.79 8 8 8H18L22 12H40C42.21 12 44 13.79 44 16V36C44 38.21 42.21 40 40 40H8C5.79 40 4 38.21 4 36V12Z" fill={`url(#m-${item.id})`} opacity="0.9"/>
              </svg>
            ) : isImage(item.mimeType) ? (
              <div className="w-9 h-9 rounded-lg overflow-hidden border border-[#2a2a3a] shrink-0 bg-[#1a1a24]">
                <img src={getProxyUrl(item.id)} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
              </div>
            ) : (
              <div className="shrink-0"><FileIcon type={getFileType(item.name)} size={36}/></div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">{item.name}</p>
              {item.size && <p className="text-xs text-[#888899]">{formatFileSize(item.size)}</p>}
            </div>
          </button>
          {(isDeleting || isMoving) && <Loader2 size={18} className="animate-spin text-[#7c3aed] shrink-0"/>}
          {!selectionMode && !isDeleting && !isMoving && (
            <div className="flex items-center gap-2 shrink-0">
              {item.type === 'file' && (
                <a href={getDownloadUrl(item.id, item.name)} onClick={e => e.stopPropagation()}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1a1a24] border border-[#2a2a3a] active:bg-[#3b82f6]/20">
                  <Download size={16} className="text-[#3b82f6]"/>
                </a>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#1a1a24]" onClick={e => e.stopPropagation()}>
                    <MoreVertical size={18} className="text-[#888899]"/>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                  {item.type === 'file' && <DropdownMenuItem onClick={() => { isImage(item.mimeType) ? setPreviewFile(item) : setEmbedFile(item) }}>👁 Visualizar</DropdownMenuItem>}
                  {item.type === 'file' && <DropdownMenuItem asChild><a href={getDownloadUrl(item.id, item.name)}><Download size={14}/> Baixar</a></DropdownMenuItem>}
                  {item.type === 'folder' && <DropdownMenuItem asChild><a href={getFolderDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer"><Download size={14}/> Abrir no Drive</a></DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => openMoveModal(item)}><Move size={14}/> Mover para...</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSelectedItem(item); setRenameValue(item.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-400">Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )
    }

    // Desktop card
    return (
      <div
        draggable={!selectionMode}
        onDragStart={e => handleItemDragStart(e, item)}
        onDragEnd={() => setDraggingItemId(null)}
        onDragOver={item.type === 'folder' ? e => handleFolderDragOver(e, item.id) : undefined}
        onDragLeave={item.type === 'folder' ? handleFolderDragLeave : undefined}
        onDrop={item.type === 'folder' ? e => handleFolderDrop(e, item) : undefined}
        className={cn("group relative cosmic-border rounded-xl transition-all duration-200",
          isDeleting || isMoving ? "opacity-40 pointer-events-none" : "",
          isSelected && selectionMode ? "bg-[#3b82f6]/10" : "hover:bg-[#1a1a24]",
          isDragTarget ? "bg-[#7c3aed]/20 scale-105" : "",
          draggingItemId === item.id ? "opacity-50" : ""
        )}
      >
        {(isDeleting || isMoving) && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={20} className="animate-spin text-[#7c3aed]"/>
          </div>
        )}
        {selectionMode && (
          <button onClick={() => toggleSelect(item.id)}
            className={cn("absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center z-10 transition-colors",
              isSelected ? "bg-[#3b82f6] border-[#3b82f6]" : "border-[#2a2a3a]")}>
            {isSelected && <CheckCircle2 size={12} className="text-white"/>}
          </button>
        )}

        {/* Conteúdo principal — clique para preview/navegar */}
        <button onClick={handleClick} className="flex flex-col items-center w-full p-4 pb-2">
          {item.type === 'folder' ? (
            <>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <defs><linearGradient id={`fg-${item.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6"/><stop offset="50%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient></defs>
                <path d="M4 12C4 9.79 5.79 8 8 8H18L22 12H40C42.21 12 44 13.79 44 16V36C44 38.21 42.21 40 40 40H8C5.79 40 4 38.21 4 36V12Z" fill={`url(#fg-${item.id})`} opacity="0.9"/>
              </svg>
              <p className="mt-2 text-xs text-white text-center w-full truncate" title={item.name}>{item.name}</p>
            </>
          ) : (
            <>
              {isImage(item.mimeType) ? (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#2a2a3a] bg-[#1a1a24]">
                  <img src={getProxyUrl(item.id)} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
                </div>
              ) : (
                <FileIcon type={getFileType(item.name)} size={44}/>
              )}
              <p className="mt-1 text-xs text-white text-center w-full truncate" title={item.name}>{item.name}</p>
              {item.size && <p className="text-[10px] text-[#888899]">{formatFileSize(item.size)}</p>}
            </>
          )}
        </button>

        {/* Botão de download redondo — canto inferior direito */}
        {!selectionMode && (
          <div className="absolute bottom-2 right-2" onClick={e => e.stopPropagation()}>
            {item.type === 'file' ? (
              <a href={getDownloadUrl(item.id, item.name)}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-[#0d0d12] border border-[#2a2a3a] hover:border-[#3b82f6] hover:bg-[#3b82f6]/20 transition-all opacity-0 group-hover:opacity-100"
                title="Baixar">
                <Download size={14} className="text-[#3b82f6]"/>
              </a>
            ) : (
              <a href={getFolderDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer"
                className="w-7 h-7 rounded-full flex items-center justify-center bg-[#0d0d12] border border-[#2a2a3a] hover:border-[#3b82f6] hover:bg-[#3b82f6]/20 transition-all opacity-0 group-hover:opacity-100"
                title="Abrir no Drive">
                <Download size={14} className="text-[#3b82f6]"/>
              </a>
            )}
          </div>
        )}

        {/* Menu três pontos — canto superior direito */}
        {!selectionMode && (
          <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                  <MoreVertical size={14} className="text-[#888899]"/>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                {item.type === 'file' && (
                  <DropdownMenuItem asChild>
                    <a href={getDownloadUrl(item.id, item.name)} className="flex items-center gap-2">
                      <Download size={14}/> Baixar
                    </a>
                  </DropdownMenuItem>
                )}
                {item.type === 'folder' && (
                  <DropdownMenuItem asChild>
                    <a href={getFolderDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                      <Download size={14}/> Abrir no Drive
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openMoveModal(item)}><Move size={14}/> Mover para...</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSelectedItem(item); setRenameValue(item.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-400">Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 bg-[#0a0a0f] border-r border-[#1e1e2a] flex-col">
        <div className="p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider" style={{background:'linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            Meus Arquivos
          </h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {breadcrumbs.map((crumb, index) => (
            <button key={index} onClick={() => navigateToBreadcrumb(index)}
              className={cn("w-full text-left py-2 rounded-lg flex items-center gap-2 transition-colors text-sm",
                index === breadcrumbs.length - 1 ? "text-white" : "text-[#888899] hover:text-white hover:bg-[#1a1a24]")}
              style={{ paddingLeft: `${8 + index * 12}px`, paddingRight: '8px', borderLeft: index === breadcrumbs.length - 1 ? '2px solid #7c3aed' : '2px solid transparent' }}>
              <Folder size={14} style={{ color: index === breadcrumbs.length - 1 ? '#7c3aed' : '#3b82f6', flexShrink: 0 }}/>
              <span className="truncate">{crumb.name}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-[#1e1e2a] flex flex-col gap-2">
          <CosmicButton variant="outline" size="sm" className="w-full" onClick={() => { setNewFolderName(''); setFolderNameError(''); setShowNewFolderModal(true) }}>
            <FolderPlus size={16}/> Nova Pasta
          </CosmicButton>
          <button onClick={() => { localStorage.removeItem('aura_auth'); router.push('/') }}
            className="flex items-center gap-2 text-xs text-[#888899] hover:text-white transition-colors px-3 py-2">
            <LogOut size={14}/> Sair
          </button>
        </div>
      </aside>

      {/* ── MOBILE SIDEBAR OVERLAY ──────────────────────────────── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/60"/>
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0f] border-r border-[#1e1e2a] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[#1e1e2a] flex items-center justify-between">
              <h2 className="text-sm font-medium" style={{background:'linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
                Meus Arquivos
              </h2>
              <button onClick={() => setSidebarOpen(false)} className="text-[#888899]"><X size={20}/></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              {breadcrumbs.map((crumb, index) => (
                <button key={index} onClick={() => navigateToBreadcrumb(index)}
                  className={cn("w-full text-left py-3 px-3 rounded-xl flex items-center gap-3 transition-colors text-sm mb-1",
                    index === breadcrumbs.length - 1 ? "bg-[#1a1a24] text-white border-l-2 border-[#7c3aed]" : "text-[#888899]")}
                  style={{ paddingLeft: `${12 + index * 16}px` }}>
                  <Folder size={16} style={{ color: index === breadcrumbs.length - 1 ? '#7c3aed' : '#3b82f6' }}/>
                  <span className="truncate">{crumb.name}</span>
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-[#1e1e2a] space-y-2">
              <button onClick={() => { setSidebarOpen(false); setNewFolderName(''); setShowNewFolderModal(true) }}
                className="w-full py-3 rounded-xl border border-[#2a2a3a] text-white text-sm flex items-center justify-center gap-2 active:bg-[#1a1a24]">
                <FolderPlus size={18}/> Nova Pasta
              </button>
              <button onClick={() => { localStorage.removeItem('aura_auth'); router.push('/') }}
                className="w-full py-3 rounded-xl text-[#888899] text-sm flex items-center justify-center gap-2">
                <LogOut size={16}/> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ────────────────────────────────────────── */}
      <main className="flex-1 bg-[#0d0d12] flex flex-col overflow-hidden">

        {/* DESKTOP TOP BAR */}
        <div className="hidden md:flex items-center justify-between p-6 pb-4 flex-wrap gap-2">
          <nav className="flex items-center gap-1 text-sm flex-wrap">
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={14} className="text-[#888899]"/>}
                <button onClick={() => navigateToBreadcrumb(index)}
                  className={cn("hover:text-white transition-colors", index === breadcrumbs.length - 1 ? "text-white font-medium" : "text-[#888899]")}>
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => loadItems(currentPath, false)} className="p-2 text-[#888899] hover:text-white transition-colors" title="Atualizar">
              <RefreshCw size={16}/>
            </button>
            <CosmicButton variant="outline" size="sm" onClick={() => { setNewFolderName(''); setFolderNameError(''); setShowNewFolderModal(true) }}>
              <FolderPlus size={16}/> Nova Pasta
            </CosmicButton>
            <CosmicButton variant="outline" size="sm" onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()) }}>
              {selectionMode ? 'Cancelar' : 'Selecionar'}
            </CosmicButton>
            <label>
              <CosmicButton variant="outline" size="sm" as="span" className="cursor-pointer">
                <FolderOpen size={16}/> Carregar Pasta
              </CosmicButton>
              <input ref={folderInputRef} type="file" className="hidden" multiple {...({ webkitdirectory: '' } as any)} onChange={handleFolderSelect}/>
            </label>
            <label>
              <CosmicButton variant="filled" size="sm" as="span" className="cursor-pointer">
                <Upload size={16}/> Carregar
              </CosmicButton>
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileSelect}/>
            </label>
          </div>
        </div>

        {/* MOBILE TOP BAR */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2a] bg-[#0a0a0f]">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-[#888899]">
            <Folder size={22} style={{color:'#7c3aed'}}/>
          </button>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap scrollbar-none">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center gap-1 shrink-0">
                  {index > 0 && <ChevronRight size={12} className="text-[#888899]"/>}
                  <button onClick={() => navigateToBreadcrumb(index)}
                    className={cn("transition-colors", index === breadcrumbs.length - 1 ? "text-white font-medium" : "text-[#888899]")}>
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
          </div>
          {breadcrumbs.length > 1 && (
            <button onClick={() => navigateToBreadcrumb(breadcrumbs.length - 2)} className="p-2 text-[#888899]">
              <ArrowLeft size={20}/>
            </button>
          )}
          <button onClick={() => loadItems(currentPath, false)} className="p-2 text-[#888899]">
            <RefreshCw size={18}/>
          </button>
        </div>

        {/* BARRA DE SELEÇÃO */}
        {selectionMode && (
          <div className="mx-4 md:mx-6 mt-2 mb-0 p-3 rounded-xl border border-[#2a2a3a] bg-[#13131a] flex items-center gap-3 flex-wrap">
            <span className="text-sm text-[#888899]">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
            <button onClick={() => setSelectedIds(new Set(items.map(i => i.id)))} className="text-xs text-[#3b82f6] hover:underline">Tudo</button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[#888899] hover:underline">Limpar</button>
            {selectedIds.size > 0 && (
              <>
                <CosmicButton variant="outline" size="sm" onClick={() => openMoveModal()}>
                  <Move size={14}/> Mover
                </CosmicButton>
                <button onClick={downloadSelected}
                  className="flex items-center gap-1 text-sm text-[#3b82f6] hover:text-[#06b6d4] transition-colors px-3 py-1.5 rounded-lg border border-[#3b82f6]/30">
                  <Download size={14}/> Baixar
                </button>
                <button onClick={handleDeleteSelected}
                  className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg border border-red-400/30">
                  <Trash2 size={14}/> Excluir
                </button>
              </>
            )}
          </div>
        )}

        {/* STAGED FILES */}
        {stagedFiles.length > 0 && (
          <div className="mx-4 md:mx-6 mt-4 space-y-2">
            {stagedFiles.map(staged => (
              <div key={staged.id} className="p-3 rounded-xl border border-[#2a2a3a] bg-[#13131a] flex items-center gap-3">
                <FileIcon type={getFileType(staged.file.name)} size={28}/>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{staged.file.name}</p>
                  <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
                    <span className="text-[#888899]">{formatFileSize(staged.file.size)}</span>
                    {staged.status === 'uploading' && <span className="text-[#3b82f6]">{staged.progress}%</span>}
                    {staged.status === 'error' && <span className="text-red-400">{staged.error}</span>}
                    {staged.status === 'done' && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Enviado</span>}
                  </div>
                  {staged.status === 'uploading' && (
                    <div className="mt-1.5 h-0.5 bg-[#2a2a3a] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{width:`${staged.progress}%`,background:'linear-gradient(90deg,#3b82f6,#7c3aed,#06b6d4)'}}/>
                    </div>
                  )}
                </div>
                {staged.status === 'uploading' && <CosmicSpinner size={16}/>}
                {(staged.status === 'pending' || staged.status === 'error') && (
                  <button onClick={() => setStagedFiles(prev => prev.filter(f => f.id !== staged.id))} className="p-1 rounded hover:bg-[#1e1e2a]">
                    <X size={16} className={staged.status === 'error' ? 'text-red-400' : 'text-[#888899]'}/>
                  </button>
                )}
              </div>
            ))}
            {hasPending && (
              <CosmicButton variant="filled" size="sm" onClick={handleUploadAll} className="w-full" loading={isUploadingAll} disabled={isUploadingAll}>
                {isUploadingAll ? <><CosmicSpinner size={16}/> Enviando...</> : <><Upload size={16}/> Carregar {stagedFiles.filter(f=>f.status==='pending').length} arquivo{stagedFiles.filter(f=>f.status==='pending').length>1?'s':''}</>}
              </CosmicButton>
            )}
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL */}
        <div className="flex-1 overflow-y-auto">
          {initialLoading && (
            <div className="flex items-center justify-center h-64"><CosmicSpinner size={32}/></div>
          )}

          {!initialLoading && items.length === 0 && stagedFiles.length === 0 && (
            <div className={cn("m-4 md:m-6 rounded-xl p-12 flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed transition-all cursor-pointer",
              isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/50")}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:'linear-gradient(135deg,#3b82f620,#7c3aed20,#06b6d420)'}}>
                <Upload size={28} style={{color:'#7c3aed'}}/>
              </div>
              <p className="text-white text-lg font-medium mb-1">Carregar arquivos</p>
              <p className="text-[#888899] text-sm text-center">Arraste aqui ou toque para selecionar</p>
            </div>
          )}

          {!initialLoading && items.length > 0 && (
            <>
              {/* DROP ZONE (desktop) */}
              <div className="hidden md:flex mx-6 mt-4 rounded-lg p-3 mb-4 items-center justify-center gap-2 border border-dashed cursor-pointer transition-all"
                style={{borderColor: isDragging ? '#7c3aed' : '#2a2a3a'}}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} className="text-[#888899]"/>
                <p className="text-[#888899] text-sm">Arraste arquivos aqui</p>
              </div>

              {/* DESKTOP GRID */}
              <div className="hidden md:grid mx-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-6">
                {[...folders, ...files].map(item => <ItemCard key={item.id} item={item}/>)}
              </div>

              {/* MOBILE LIST */}
              <div className="md:hidden">
                {[...folders, ...files].map(item => <ItemCard key={item.id} item={item} mobile/>)}
              </div>
            </>
          )}
        </div>

        {/* MOBILE BOTTOM BAR */}
        <div className="md:hidden flex items-center justify-around border-t border-[#1e1e2a] bg-[#0a0a0f] py-2 safe-area-bottom">
          <button onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()) }}
            className={cn("flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors", selectionMode ? "text-[#7c3aed]" : "text-[#888899]")}>
            <CheckCircle2 size={22}/>
            <span className="text-[10px]">Selecionar</span>
          </button>
          <label className="flex flex-col items-center gap-1 px-4 py-2 text-[#888899]">
            <FolderOpen size={22}/>
            <span className="text-[10px]">Pasta</span>
            <input type="file" className="hidden" multiple {...({ webkitdirectory: '' } as any)} onChange={handleFolderSelect}/>
          </label>
          <label className="flex flex-col items-center gap-1 px-4 py-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center -mt-6" style={{background:'linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4)'}}>
              <Upload size={22} className="text-white"/>
            </div>
            <span className="text-[10px] text-[#888899]">Carregar</span>
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileSelect}/>
          </label>
          <button onClick={() => { setNewFolderName(''); setFolderNameError(''); setShowNewFolderModal(true) }}
            className="flex flex-col items-center gap-1 px-4 py-2 text-[#888899]">
            <FolderPlus size={22}/>
            <span className="text-[10px]">Nova Pasta</span>
          </button>
          <button onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-1 px-4 py-2 text-[#888899]">
            <Home size={22}/>
            <span className="text-[10px]">Menu</span>
          </button>
        </div>
      </main>

      {/* ── LIGHTBOX IMAGEM ─────────────────────────────────────── */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => setPreviewFile(null)}>
          <button onClick={() => setPreviewFile(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#1a1a24] flex items-center justify-center text-white hover:bg-[#2a2a3a] z-10">
            <X size={20}/>
          </button>
          <div className="max-w-[95vw] max-h-[95vh] flex flex-col items-center gap-4 p-4" onClick={e => e.stopPropagation()}>
            <img src={getProxyUrl(previewFile.id, previewFile.name)} alt={previewFile.name} className="max-w-full max-h-[80vh] object-contain rounded-xl"/>
            <div className="flex items-center gap-4">
              <p className="text-white text-sm truncate max-w-[250px]">{previewFile.name}</p>
              <a href={getDownloadUrl(previewFile.id, previewFile.name)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1a24] border border-[#2a2a3a] text-[#3b82f6] text-sm hover:border-[#3b82f6] transition-all">
                <Download size={16}/> Baixar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EMBED (VÍDEO/PDF) ──────────────────────────────── */}
      {embedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => setEmbedFile(null)}>
          <button onClick={() => setEmbedFile(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#1a1a24] flex items-center justify-center text-white hover:bg-[#2a2a3a] z-10">
            <X size={20}/>
          </button>
          <div className="w-[95vw] max-w-4xl flex flex-col gap-3 p-4" onClick={e => e.stopPropagation()}>
            <div className="rounded-xl overflow-hidden bg-black" style={{aspectRatio: isVideo(embedFile.mimeType) ? '16/9' : '4/3', maxHeight:'80vh'}}>
              {isVideo(embedFile.mimeType) ? (
                <video src={getProxyUrl(embedFile.id, embedFile.name)} controls autoPlay className="w-full h-full"/>
              ) : (
                <iframe src={getProxyUrl(embedFile.id, embedFile.name)} className="w-full h-full border-0"/>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-white text-sm truncate max-w-[300px]">{embedFile.name}</p>
              <a href={getDownloadUrl(embedFile.id, embedFile.name)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1a24] border border-[#2a2a3a] text-[#3b82f6] text-sm hover:border-[#3b82f6] transition-all">
                <Download size={16}/> Baixar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────────── */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a] mx-4 rounded-2xl">
          <DialogHeader><DialogTitle className="text-white">Nova Pasta</DialogTitle></DialogHeader>
          <div className="py-4 space-y-2">
            <Input value={newFolderName} onChange={e => { setNewFolderName(e.target.value); setFolderNameError('') }}
              className="bg-[#0d0d12] border-[#2a2a3a] text-white h-12" placeholder="Nome da pasta"
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} autoFocus/>
            {folderNameError && <p className="text-xs text-red-400">{folderNameError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleCreateFolder} loading={creatingFolder}>
              {creatingFolder ? 'Criando...' : 'Criar'}
            </CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a] mx-4 rounded-2xl">
          <DialogHeader><DialogTitle className="text-white">Renomear</DialogTitle></DialogHeader>
          <div className="py-4">
            <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
              className="bg-[#0d0d12] border-[#2a2a3a] text-white h-12" placeholder="Novo nome"
              onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus/>
          </div>
          <DialogFooter className="gap-2">
            <CosmicButton variant="outline" size="sm" onClick={() => setShowRenameModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleRename}>Renomear</CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a] mx-4 rounded-2xl">
          <DialogHeader><DialogTitle className="text-white">Mover para...</DialogTitle></DialogHeader>
          <div className="py-4 space-y-1 max-h-[50vh] overflow-y-auto">
            <button onClick={() => setMoveFolderPath('')}
              className={cn("w-full text-left p-4 rounded-xl flex items-center gap-3 transition-colors text-sm",
                moveFolderPath === '' ? "bg-[#3b82f6]/20 text-white" : "text-[#888899] hover:bg-[#1e1e2a]")}>
              <Folder size={18} className="text-[#3b82f6] shrink-0"/> Meus Arquivos (raiz)
            </button>
            {availableFolders.map(f => {
              const path = currentPath ? `${currentPath}/${f.name}` : f.name
              return (
                <button key={f.id} onClick={() => setMoveFolderPath(path)}
                  className={cn("w-full text-left p-4 rounded-xl flex items-center gap-3 transition-colors text-sm",
                    moveFolderPath === path ? "bg-[#3b82f6]/20 text-white" : "text-[#888899] hover:bg-[#1e1e2a]")}>
                  <Folder size={18} className="text-[#3b82f6] shrink-0"/> {f.name}
                </button>
              )
            })}
          </div>
          <DialogFooter className="gap-2">
            <CosmicButton variant="outline" size="sm" onClick={() => setShowMoveModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleMoveSelected} loading={moveLoading}>
              {moveLoading ? 'Movendo...' : 'Mover'}
            </CosmicButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
