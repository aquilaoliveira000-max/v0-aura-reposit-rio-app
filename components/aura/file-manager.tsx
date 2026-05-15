'use client'

import { useState, useCallback, useRef, DragEvent, useEffect } from 'react'
import { Upload, FolderPlus, ChevronRight, X, MoreVertical, Folder, LogOut, CheckCircle2, RefreshCw, FolderOpen, Trash2, Move, Loader2 } from 'lucide-react'
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

function isImage(mimeType?: string) {
  return mimeType?.startsWith('image/') || false
}

function isVideo(mimeType?: string) {
  return mimeType?.startsWith('video/') || false
}

function getDirectUrl(fileId: string) {
  return `https://drive.google.com/uc?id=${fileId}`
}

function getViewUrl(file: DriveItem) {
  if (file.webViewLink) return file.webViewLink
  return `https://drive.google.com/file/d/${file.id}/view`
}

interface StagedFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  folderPath?: string
}

interface BreadcrumbItem {
  name: string
  path: string
}

function isFolder(file: File): boolean {
  return file.size === 0 && file.type === ''
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
    setSelectedIds(new Set())
    setSelectionMode(false)
    loadItems(path, true)
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(breadcrumbs.slice(0, index + 1))
    setCurrentPath(crumb.path)
    setSelectedIds(new Set())
    setSelectionMode(false)
    loadItems(crumb.path, true)
  }

  // ── Drag & Drop de arquivos externos ──────────────────────────────
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => {
      if (isFolder(f)) {
        setStagedFiles(prev => [...prev, { file: f, id: generateId(), progress: 0, status: 'error', error: 'É uma pasta. Use "Carregar Pasta".' }])
        return false
      }
      return true
    })
    if (files.length) setStagedFiles(prev => [...prev, ...files.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const }))])
  }, [])

  // ── Drag & Drop entre itens (mover para pasta) ────────────────────
  const handleItemDragStart = (e: React.DragEvent, item: DriveItem) => {
    setDraggingItemId(item.id)
    e.dataTransfer.setData('itemId', item.id)
    e.dataTransfer.setData('itemName', item.name)
    e.dataTransfer.setData('itemType', item.type)
  }

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault(); e.stopPropagation()
    setDragOverFolder(folderId)
  }

  const handleFolderDragLeave = () => setDragOverFolder(null)

  const handleFolderDrop = async (e: React.DragEvent, targetFolder: DriveItem) => {
    e.preventDefault(); e.stopPropagation()
    setDragOverFolder(null)
    const itemId = e.dataTransfer.getData('itemId')
    if (!itemId || itemId === targetFolder.id) return
    const targetPath = currentPath ? `${currentPath}/${targetFolder.name}` : targetFolder.name
    await moveItem(itemId, targetPath)
  }

  const moveItem = async (itemId: string, targetPath: string) => {
    setMovingIds(prev => new Set(prev).add(itemId))
    try {
      await apiPost({ action: 'move', id: itemId, targetPath })
      loadItems(currentPath, false)
    } finally {
      setMovingIds(prev => { const n = new Set(prev); n.delete(itemId); return n })
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────
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
      const parts = rel.split('/')
      const folderPart = parts.slice(0, -1).join('/')
      return { file: f, id: generateId(), progress: 0, status: 'pending' as const, folderPath: currentPath ? `${currentPath}/${folderPart}` : folderPart }
    })])
    e.target.value = ''
  }

  const uploadFile = async (staged: StagedFile) => {
    setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'uploading' } : f))
    try {
      const CHUNK_SIZE = 3 * 1024 * 1024 // 3MB por chunk
      const file = staged.file
      const totalSize = file.size
      const folderPath = staged.folderPath ?? currentPathRef.current
      let sessionUri: string | null = null
      let offset = 0

      while (offset < totalSize) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE)
        const chunkFile = new File([chunk], file.name, { type: file.type })
        const formData = new FormData()
        formData.append('file', chunkFile)
        formData.append('folderPath', folderPath)
        formData.append('chunkStart', offset.toString())
        formData.append('totalSize', totalSize.toString())
        if (sessionUri) formData.append('sessionUri', sessionUri)

        const res = await fetch('/api/drive', { method: 'POST', body: formData })
        const data = await res.json()

        if (!data.success) throw new Error(data.error || 'Erro no upload')
        if (data.sessionUri) sessionUri = data.sessionUri

        offset += chunk.size
        const progress = Math.min(Math.round((offset / totalSize) * 100), 99)
        setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, progress } : f))

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
    const folderUploads = pending.filter(f => f.folderPath !== undefined && f.folderPath !== currentPathRef.current)
    const regularUploads = pending.filter(f => f.folderPath === undefined || f.folderPath === currentPathRef.current)
    await Promise.all(regularUploads.map(uploadFile))
    for (const staged of folderUploads) {
      await uploadFile(staged)
    }
    setIsUploadingAll(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (item: DriveItem) => {
    setDeletingIds(prev => new Set(prev).add(item.id))
    try {
      await apiPost({ action: item.type === 'folder' ? 'deleteFolder' : 'delete', id: item.id })
      loadItems(currentPath, false)
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }

  const handleDeleteSelected = async () => {
    const toDelete = items.filter(i => selectedIds.has(i.id))
    toDelete.forEach(item => setDeletingIds(prev => new Set(prev).add(item.id)))
    await Promise.all(toDelete.map(item => apiPost({ action: item.type === 'folder' ? 'deleteFolder' : 'delete', id: item.id })))
    setSelectedIds(new Set()); setSelectionMode(false)
    loadItems(currentPath, false)
  }

  // ── Move ───────────────────────────────────────────────────────────
  const openMoveModal = (item?: DriveItem) => {
    if (item) {
      setSelectedIds(new Set([item.id]))
    }
    setMoveFolderPath('')
    setShowMoveModal(true)
  }

  const handleMoveSelected = async () => {
    setMoveLoading(true)
    const ids = Array.from(selectedIds)
    ids.forEach(id => setMovingIds(prev => new Set(prev).add(id)))
    await Promise.all(ids.map(id => apiPost({ action: 'move', id, targetPath: moveFolderPath })))
    setMovingIds(new Set())
    setSelectedIds(new Set()); setSelectionMode(false)
    setShowMoveModal(false); setMoveLoading(false)
    loadItems(currentPath, false)
  }

  // ── Criar pasta ────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    const exists = items.some(i => i.type === 'folder' && i.name.toLowerCase() === name.toLowerCase())
    if (exists) { setFolderNameError('Já existe uma pasta com esse nome.'); return }
    setCreatingFolder(true); setFolderNameError('')
    await apiPost({ action: 'createFolder', name, folderPath: currentPath })
    setNewFolderName(''); setCreatingFolder(false); setShowNewFolderModal(false)
    loadItems(currentPath, false)
  }

  // ── Renomear ───────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return
    await apiPost({ action: 'rename', id: selectedItem.id, name: renameValue.trim() })
    setShowRenameModal(false); setSelectedItem(null); setRenameValue('')
    loadItems(currentPath, false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const folders = items.filter(i => i.type === 'folder')
  const files = items.filter(i => i.type === 'file')
  const hasPending = stagedFiles.some(f => f.status === 'pending')

  // Todas as pastas para o modal de mover (exceto as selecionadas)
  const availableFolders = folders.filter(f => !selectedIds.has(f.id))

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-60 bg-[#0a0a0f] border-r border-[#1e1e2a] flex flex-col">
        <div className="p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider" style={{background:'linear-gradient(135deg,#3b82f6,#7c3aed,#06b6d4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            Meus Arquivos
          </h2>
        </div>
        {/* Árvore de navegação — mostra o caminho atual como hierarquia */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {breadcrumbs.map((crumb, index) => (
            <button
              key={index}
              onClick={() => navigateToBreadcrumb(index)}
              className={cn(
                "w-full text-left py-2 rounded-lg flex items-center gap-2 transition-colors text-sm",
                index === breadcrumbs.length - 1
                  ? "text-white"
                  : "text-[#888899] hover:text-white hover:bg-[#1a1a24]"
              )}
              style={{ paddingLeft: `${8 + index * 12}px`, paddingRight: '8px', borderLeft: index === breadcrumbs.length - 1 ? '2px solid #7c3aed' : '2px solid transparent' }}
            >
              <Folder size={14} style={{ color: index === breadcrumbs.length - 1 ? '#7c3aed' : '#3b82f6', flexShrink: 0 }} />
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

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="flex-1 bg-[#0d0d12] p-6 overflow-y-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
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

        {/* Barra seleção múltipla */}
        {selectionMode && (
          <div className="mb-4 p-3 rounded-lg border border-[#2a2a3a] bg-[#13131a] flex items-center gap-3 flex-wrap">
            <span className="text-sm text-[#888899]">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
            <button onClick={() => setSelectedIds(new Set(items.map(i => i.id)))} className="text-xs text-[#3b82f6] hover:underline">Tudo</button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[#888899] hover:underline">Limpar</button>
            {selectedIds.size > 0 && (
              <>
                <CosmicButton variant="outline" size="sm" onClick={() => openMoveModal()}>
                  <Move size={14}/> Mover
                </CosmicButton>
                <button onClick={handleDeleteSelected}
                  className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg border border-red-400/30 hover:border-red-400/60">
                  <Trash2 size={14}/> Excluir selecionados
                </button>
              </>
            )}
          </div>
        )}

        {/* Staged Files */}
        {stagedFiles.length > 0 && (
          <div className="mb-6 space-y-2">
            {stagedFiles.map(staged => (
              <div key={staged.id} className="p-3 rounded-lg border border-[#2a2a3a] bg-[#13131a] flex items-center gap-3">
                <FileIcon type={getFileType(staged.file.name)} size={28}/>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{staged.file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-[#888899]">{formatFileSize(staged.file.size)}</p>
                    {staged.folderPath && <p className="text-xs text-[#888899] truncate">→ {staged.folderPath}</p>}
                    {staged.status === 'uploading' && <span className="text-xs text-[#3b82f6]">{staged.progress}%</span>}
                    {staged.status === 'error' && <span className="text-xs text-red-400">{staged.error}</span>}
                    {staged.status === 'done' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Enviado</span>}
                  </div>
                  {staged.status === 'uploading' && (
                    <div className="mt-1.5 h-0.5 bg-[#2a2a3a] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{width:`${staged.progress}%`,background:'linear-gradient(90deg,#3b82f6,#7c3aed,#06b6d4)'}}/>
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {staged.status === 'uploading' && <CosmicSpinner size={16}/>}
                  {(staged.status === 'pending' || staged.status === 'error') && (
                    <button onClick={() => setStagedFiles(prev => prev.filter(f => f.id !== staged.id))} className="p-1 hover:bg-[#1e1e2a] rounded transition-colors">
                      <X size={16} className={staged.status === 'error' ? 'text-red-400' : 'text-[#888899]'}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {hasPending && (
              <CosmicButton variant="filled" size="sm" onClick={handleUploadAll} className="w-full mt-2" loading={isUploadingAll} disabled={isUploadingAll}>
                {isUploadingAll ? <><CosmicSpinner size={16}/> Enviando...</> : <><Upload size={16}/> Carregar {stagedFiles.filter(f=>f.status==='pending').length > 1 ? `${stagedFiles.filter(f=>f.status==='pending').length} arquivos` : 'arquivo'}</>}
              </CosmicButton>
            )}
          </div>
        )}

        {initialLoading && <div className="flex items-center justify-center h-64"><CosmicSpinner size={32}/></div>}

        {!initialLoading && items.length === 0 && stagedFiles.length === 0 && (
          <div className={cn("rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed transition-all duration-300 cursor-pointer",
            isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/50")}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:'linear-gradient(135deg,#3b82f620,#7c3aed20,#06b6d420)'}}>
              <Upload size={28} style={{color:'#7c3aed'}}/>
            </div>
            <p className="text-white text-lg font-medium mb-1">Arraste arquivos aqui</p>
            <p className="text-[#888899] text-sm">ou use os botões acima — para pastas use "Carregar Pasta"</p>
          </div>
        )}

        {!initialLoading && (items.length > 0 || stagedFiles.length > 0) && (
          <>
            <div className={cn("rounded-lg p-3 mb-6 flex items-center justify-center gap-2 border border-dashed transition-all duration-300 cursor-pointer",
              isDragging ? "border-[#7c3aed] bg-[#7c3aed]/5" : "border-[#2a2a3a] hover:border-[#3b82f6]/40")}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} className="text-[#888899]"/>
              <p className="text-[#888899] text-sm">Arraste arquivos aqui (pastas: use "Carregar Pasta")</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {folders.map(folder => {
                const isDeleting = deletingIds.has(folder.id)
                const isMoving = movingIds.has(folder.id)
                const isSelected = selectedIds.has(folder.id)
                const isDragTarget = dragOverFolder === folder.id
                return (
                  <div key={folder.id}
                    draggable={!selectionMode}
                    onDragStart={e => handleItemDragStart(e, folder)}
                    onDragEnd={() => setDraggingItemId(null)}
                    onDragOver={e => handleFolderDragOver(e, folder.id)}
                    onDragLeave={handleFolderDragLeave}
                    onDrop={e => handleFolderDrop(e, folder)}
                    className={cn("group relative cosmic-border p-4 rounded-xl transition-all duration-200",
                      isDeleting || isMoving ? "opacity-40 pointer-events-none" : "",
                      isSelected && selectionMode ? "bg-[#3b82f6]/10" : "hover:bg-[#1a1a24]",
                      isDragTarget ? "bg-[#7c3aed]/20 border-[#7c3aed] scale-105" : "",
                      draggingItemId === folder.id ? "opacity-50" : ""
                    )}>
                    {(isDeleting || isMoving) && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <Loader2 size={20} className="animate-spin text-[#7c3aed]"/>
                      </div>
                    )}
                    {selectionMode && (
                      <button onClick={() => toggleSelect(folder.id)}
                        className={cn("absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10",
                          isSelected ? "bg-[#3b82f6] border-[#3b82f6]" : "border-[#2a2a3a] bg-transparent")}>
                        {isSelected && <CheckCircle2 size={12} className="text-white"/>}
                      </button>
                    )}
                    <button onClick={() => selectionMode ? toggleSelect(folder.id) : navigateTo(folder.name, currentPath ? `${currentPath}/${folder.name}` : folder.name)}
                      className="flex flex-col items-center w-full pr-5">
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
                      <p className="mt-2 text-xs text-white text-center w-full truncate" title={folder.name}>{folder.name}</p>
                    </button>
                    {!selectionMode && (
                      <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                              <MoreVertical size={14} className="text-[#888899]"/>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                            <DropdownMenuItem onClick={() => openMoveModal(folder)}><Move size={14}/> Mover para...</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelectedItem(folder); setRenameValue(folder.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(folder)} className="text-red-400">Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                )
              })}

              {files.map(file => {
                const isDeleting = deletingIds.has(file.id)
                const isMoving = movingIds.has(file.id)
                const isSelected = selectedIds.has(file.id)
                return (
                  <div key={file.id}
                    draggable={!selectionMode}
                    onDragStart={e => handleItemDragStart(e, file)}
                    onDragEnd={() => setDraggingItemId(null)}
                    className={cn("group relative cosmic-border p-4 rounded-xl transition-all duration-200",
                      isDeleting || isMoving ? "opacity-40 pointer-events-none" : "",
                      isSelected && selectionMode ? "bg-[#3b82f6]/10" : "hover:bg-[#1a1a24]",
                      draggingItemId === file.id ? "opacity-50" : ""
                    )}>
                    {(isDeleting || isMoving) && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <Loader2 size={20} className="animate-spin text-[#7c3aed]"/>
                      </div>
                    )}
                    {selectionMode && (
                      <button onClick={() => toggleSelect(file.id)}
                        className={cn("absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10",
                          isSelected ? "bg-[#3b82f6] border-[#3b82f6]" : "border-[#2a2a3a] bg-transparent")}>
                        {isSelected && <CheckCircle2 size={12} className="text-white"/>}
                      </button>
                    )}
                    {!selectionMode ? (
                      <a href={`https://drive.google.com/uc?export=download&id=${file.id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center group/dl pr-5" title={`Baixar ${file.name}`}>
                        <FileIcon type={getFileType(file.name)} size={44}/>
                        <p className="mt-2 text-xs text-white text-center w-full truncate group-hover/dl:text-[#06b6d4] transition-colors" title={file.name}>{file.name}</p>
                        {file.size && <p className="text-[10px] text-[#888899] mt-0.5">{formatFileSize(file.size)}</p>}
                        <p className="text-[10px] text-[#3b82f6] mt-0.5 opacity-0 group-hover/dl:opacity-100 transition-opacity">↓ baixar</p>
                      </a>
                    ) : (
                      <button onClick={() => toggleSelect(file.id)} className="flex flex-col items-center w-full">
                        <FileIcon type={getFileType(file.name)} size={44}/>
                        <p className="mt-2 text-xs text-white text-center w-full truncate" title={file.name}>{file.name}</p>
                        {file.size && <p className="text-[10px] text-[#888899] mt-0.5">{formatFileSize(file.size)}</p>}
                      </button>
                    )}
                    {!selectionMode && (
                      <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#18181c] rounded transition-all">
                              <MoreVertical size={14} className="text-[#888899]"/>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-[#18181c] border-[#2a2a32]">
                            <DropdownMenuItem onClick={() => openMoveModal(file)}><Move size={14}/> Mover para...</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelectedItem(file); setRenameValue(file.name); setShowRenameModal(true) }}>Renomear</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(file)} className="text-red-400">Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>

      {/* ── Lightbox de imagem ───────────────────────────────────── */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setPreviewFile(null)}
        >
          <button
            onClick={() => setPreviewFile(null)}
            className="absolute top-4 right-4 text-white hover:text-[#06b6d4] transition-colors text-2xl font-light"
          >
            ✕
          </button>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img
              src={getDirectUrl(previewFile.id)}
              alt={previewFile.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="flex items-center gap-4">
              <p className="text-white text-sm truncate max-w-[300px]">{previewFile.name}</p>
              <a
                href={`https://drive.google.com/uc?export=download&id=${previewFile.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#3b82f6] hover:text-[#06b6d4] transition-colors"
                onClick={e => e.stopPropagation()}
              >
                ↓ baixar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────── */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className="bg-[#13131a] border-[#2a2a3a]">
          <DialogHeader><DialogTitle className="text-white">Nova Pasta</DialogTitle></DialogHeader>
          <div className="py-4 space-y-2">
            <Input value={newFolderName} onChange={e => { setNewFolderName(e.target.value); setFolderNameError('') }}
              className="bg-[#0d0d12] border-[#2a2a3a] text-white" placeholder="Nome da pasta"
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} autoFocus/>
            {folderNameError && <p className="text-xs text-red-400">{folderNameError}</p>}
          </div>
          <DialogFooter>
            <CosmicButton variant="outline" size="sm" onClick={() => setShowNewFolderModal(false)}>Cancelar</CosmicButton>
            <CosmicButton variant="filled" size="sm" onClick={handleCreateFolder} loading={creatingFolder}>
              {creatingFolder ? 'Criando...' : 'Criar'}
            </CosmicButton>
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
          <div className="py-4 space-y-1 max-h-[300px] overflow-y-auto">
            {/* Opção: pasta raiz */}
            <button onClick={() => setMoveFolderPath('')}
              className={cn("w-full text-left p-3 rounded-lg flex items-center gap-2 transition-colors text-sm",
                moveFolderPath === '' ? "bg-[#3b82f6]/20 text-white" : "text-[#888899] hover:bg-[#1e1e2a]")}>
              <Folder size={16} className="text-[#3b82f6] shrink-0"/> Meus Arquivos (raiz)
            </button>
            {availableFolders.map(f => {
              const path = currentPath ? `${currentPath}/${f.name}` : f.name
              return (
                <button key={f.id} onClick={() => setMoveFolderPath(path)}
                  className={cn("w-full text-left p-3 rounded-lg flex items-center gap-2 transition-colors text-sm",
                    moveFolderPath === path ? "bg-[#3b82f6]/20 text-white" : "text-[#888899] hover:bg-[#1e1e2a]")}>
                  <Folder size={16} className="text-[#3b82f6] shrink-0"/> {f.name}
                </button>
              )
            })}
            {availableFolders.length === 0 && currentPath === '' && (
              <p className="text-sm text-[#888899] text-center py-4">Nenhuma pasta disponível aqui</p>
            )}
          </div>
          <DialogFooter>
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
