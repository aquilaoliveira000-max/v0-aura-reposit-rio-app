'use client'

import { useState, useCallback, useRef, DragEvent, useEffect } from 'react'
import {
  Upload, FolderPlus, ChevronRight, X, MoreHorizontal, Folder, LogOut, Check, RefreshCw, FolderUp,
  Trash2, Move, Loader2, Download, ArrowLeft, Menu, CheckSquare, Pencil, UploadCloud,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { FileIcon } from './file-icons'
import { formatFileSize, getFileType, generateId } from '@/lib/aura-types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

interface DriveItem {
  id: string; name: string; type: 'file' | 'folder'
  /** Assinatura entregue pelo servidor na listagem; prova que o item é da pasta do cliente. */
  sig: string
  mimeType?: string; size?: number; createdAt?: string
}
interface StagedFile {
  file: File; id: string; progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string; folderPath?: string
}
interface BreadcrumbItem { name: string; path: string }
interface ZipProgress { current: number; total: number; name: string }
interface PastaDestino { id: string; name: string; path: string; label: string }

// ── Helpers ───────────────────────────────────────────────────────────
const IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','heic','avif']
const VIDEO_EXTS = ['mp4','mov','avi','mkv','webm','m4v','wmv','flv']
const getExt = (n: string) => n.split('.').pop()?.toLowerCase() || ''
const isImage = (m?: string, n?: string) => !!m?.startsWith('image/') || (!!n && IMAGE_EXTS.includes(getExt(n)))
const isVideo = (m?: string, n?: string) => !!m?.startsWith('video/') || (!!n && VIDEO_EXTS.includes(getExt(n)))
const isPdf   = (m?: string, n?: string) => m === 'application/pdf' || getExt(n||'') === 'pdf'
const canPreview = (m?: string, n?: string) => isImage(m,n) || isVideo(m,n) || isPdf(m,n)
const isFolderFile = (f: File) => f.size === 0 && f.type === ''
const juntar = (base: string, nome: string) => (base ? `${base}/${nome}` : nome)
const getProxyUrl = (item: Pick<DriveItem, 'id' | 'sig' | 'name'>) =>
  `/api/drive/file?id=${item.id}&sig=${encodeURIComponent(item.sig)}&name=${encodeURIComponent(item.name)}`
// Download vai direto ao Drive — sem proxy, sem timeout, sem limite de tamanho
const getDownloadUrl = (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

async function apiPost(body: object) {
  const res = await fetch('/api/drive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}

async function listFolderContents(folderPath: string): Promise<DriveItem[]> {
  const res = await fetch(`/api/drive?folderPath=${encodeURIComponent(folderPath)}`, { cache: 'no-store' })
  const data = await res.json()
  if (!data.success) return []
  return [
    ...data.folders.map((f: any) => ({ ...f, type: 'folder' as const })),
    ...data.files.map((f: any) => ({ ...f, type: 'file' as const }))
  ]
}

async function fetchAllFolders(path: string, parentLabel: string, result: PastaDestino[], depth = 0) {
  if (depth > 4) return // limite de profundidade
  for (const f of (await listFolderContents(path)).filter(i => i.type === 'folder')) {
    const fullPath = juntar(path, f.name)
    const label = parentLabel ? `${parentLabel} › ${f.name}` : f.name
    result.push({ id: f.id, name: f.name, path: fullPath, label })
    await fetchAllFolders(fullPath, label, result, depth + 1)
  }
}

async function downloadFolderAsZip(folder: DriveItem, basePath: string, onProgress: (p: ZipProgress) => void) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const allFiles: { item: DriveItem; zipPath: string }[] = []

  // Percorre pelo caminho real no Drive; o caminho dentro do ZIP começa na pasta baixada.
  async function collect(drivePath: string, zipPath: string, depth = 0) {
    if (depth > 8) return
    for (const child of await listFolderContents(drivePath)) {
      if (child.type === 'file') allFiles.push({ item: child, zipPath: zipPath + child.name })
      else await collect(juntar(drivePath, child.name), `${zipPath}${child.name}/`, depth + 1)
    }
  }
  await collect(juntar(basePath, folder.name), `${folder.name}/`)

  for (let i = 0; i < allFiles.length; i++) {
    const { item, zipPath } = allFiles[i]
    onProgress({ current: i + 1, total: allFiles.length, name: item.name })
    const res = await fetch(getProxyUrl(item))
    zip.file(zipPath, await res.blob())
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url; a.download = `${folder.name}.zip`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Ícone de pasta no tom da marca. */
function IconePasta({ size = 22 }: { size?: number }) {
  return <Folder style={{ width: size, height: size }} className="text-brand-text" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden />
}

const dialogo = 'glass border-line rounded-[var(--radius-dialog)] shadow-[var(--shadow-pop)] text-text sm:max-w-md'

export function FileManager() {
  const router = useRouter()
  const [items, setItems] = useState<DriveItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ name: 'Meus arquivos', path: '' }])
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
  const [clientRoot, setClientRoot] = useState('')
  const [usuario, setUsuario] = useState('')
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [allFolders, setAllFolders] = useState<PastaDestino[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentPathRef = useRef('')

  useEffect(() => { currentPathRef.current = currentPath }, [currentPath])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    // A pasta do cliente vem da sessão no servidor, nunca do navegador.
    fetch('/api/auth', { cache: 'no-store' })
      .then(r => r.json())
      .then((s: { success: boolean; usuario?: string; raiz?: string }) => {
        if (!s.success) { router.replace('/'); return }
        const root = s.raiz || ''
        setUsuario(s.usuario || '')
        setClientRoot(root)
        setCurrentPath(root)
        currentPathRef.current = root
        setBreadcrumbs([{ name: 'Meus arquivos', path: root }])
        loadItems(root, true)
        interval = setInterval(() => loadItems(currentPathRef.current, false), 30000)
      })
      .catch(() => router.replace('/'))
    return () => clearInterval(interval)
  }, [router])

  const loadItems = async (path: string, showLoader = true): Promise<void> => {
    if (showLoader) setInitialLoading(true)
    try {
      const res = await fetch(`/api/drive?folderPath=${encodeURIComponent(path)}&_t=${Date.now()}`, { cache: 'no-store' })
      if (res.status === 401) { router.replace('/'); return }
      const data = await res.json()
      if (data.success) {
        setItems([
          ...data.folders.map((f: any) => ({ ...f, type: 'folder' as const })),
          ...data.files.map((f: any) => ({ ...f, type: 'file' as const }))
        ])
      } else {
        console.error('[Drive] Erro ao listar:', data.error || 'erro desconhecido')
      }
    } catch (err) {
      console.error('[Drive] Falha de rede:', err)
    }
    if (showLoader) setInitialLoading(false)
  }

  const sair = async () => {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => undefined)
    router.replace('/')
  }

  const navigateTo = (name: string, path: string) => {
    setCurrentPath(path); setBreadcrumbs(prev => [...prev, { name, path }])
    setSelectedIds(new Set()); setSelectionMode(false); setSidebarOpen(false)
    loadItems(path, true)
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(breadcrumbs.slice(0, index + 1)); setCurrentPath(crumb.path)
    setSelectedIds(new Set()); setSelectionMode(false); setSidebarOpen(false); loadItems(crumb.path, true)
  }

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => {
      if (isFolderFile(f)) { setStagedFiles(prev => [...prev, { file: f, id: generateId(), progress: 0, status: 'error', error: 'É uma pasta. Use "Enviar pasta".' }]); return false }
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
    const item = items.find(i => i.id === e.dataTransfer.getData('itemId'))
    if (!item || item.id === target.id) return
    setMovingIds(prev => new Set(prev).add(item.id))
    try { await apiPost({ action: 'move', id: item.id, sig: item.sig, targetPath: juntar(currentPath, target.name) }); loadItems(currentPath, false) }
    finally { setMovingIds(prev => { const n = new Set(prev); n.delete(item.id); return n }) }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => {
      if (isFolderFile(f)) { setStagedFiles(prev => [...prev, { file: f, id: generateId(), progress: 0, status: 'error', error: 'É uma pasta. Use "Enviar pasta".' }]); return false }
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
      const folderPart = rel.split('/').slice(0, -1).join('/')
      return { file: f, id: generateId(), progress: 0, status: 'pending' as const, folderPath: juntar(currentPath, folderPart) }
    })])
    e.target.value = ''
  }

  const uploadFile = async (staged: StagedFile) => {
    setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'uploading' } : f))
    try {
      const CHUNK = 8 * 1024 * 1024 // 8MB direto ao Drive
      const { file } = staged
      const totalSize = file.size
      const folderPath = staged.folderPath ?? currentPathRef.current

      // Passo 1: pede session URI ao nosso servidor (autenticação)
      const startData = await apiPost({
        action: 'startUpload',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        totalSize,
        folderPath,
      })
      if (!startData.success || !startData.sessionUri) throw new Error(startData.error || 'Erro ao iniciar o envio')

      const sessionUri = startData.sessionUri

      // Passo 2: chunks direto ao Drive
      let offset = 0
      while (offset < totalSize) {
        const chunk = file.slice(offset, offset + CHUNK)
        const end = offset + chunk.size - 1
        const isLast = end + 1 >= totalSize

        let uploadRes: Response | null = null
        try {
          uploadRes = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes ${offset}-${end}/${totalSize}`,
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: chunk,
          })
        } catch {
          // "Failed to fetch" no último chunk é normal — o Drive fecha a conexão
          // após confirmar o upload mas antes de enviar resposta completa
          if (isLast) break
          throw new Error('Falha de rede durante o envio')
        }

        if (uploadRes.status !== 200 && uploadRes.status !== 201 && uploadRes.status !== 308) {
          if (isLast) break
          throw new Error(`Erro no envio: ${uploadRes.status}`)
        }

        offset += chunk.size
        setStagedFiles(prev => prev.map(f =>
          f.id === staged.id ? { ...f, progress: Math.min(Math.round((offset / totalSize) * 100), 99) } : f
        ))

        if (isLast && (uploadRes.status === 200 || uploadRes.status === 201)) break
      }

      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'done', progress: 100 } : f))
      setTimeout(() => {
        setStagedFiles(prev => prev.filter(f => f.id !== staged.id))
        loadItems(currentPathRef.current, false)
      }, 1500)
    } catch (err: any) {
      if (err.name === 'AbortError') return // cancelado pelo usuário
      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'error', error: err.message } : f))
    }
  }

  const handleUploadAll = async () => {
    if (isUploadingAll) return
    setIsUploadingAll(true)
    const pending = stagedFiles.filter(f => f.status === 'pending')
    const folderUps = pending.filter(f => f.folderPath && f.folderPath !== currentPathRef.current)
    const regularUps = pending.filter(f => !f.folderPath || f.folderPath === currentPathRef.current)
    await Promise.all(regularUps.map(uploadFile))
    for (const s of folderUps) await uploadFile(s)
    setIsUploadingAll(false)
  }

  const handleDelete = async (item: DriveItem) => {
    setDeletingIds(prev => new Set(prev).add(item.id))
    try { await apiPost({ action: item.type === 'folder' ? 'deleteFolder' : 'delete', id: item.id, sig: item.sig }); loadItems(currentPath, false) }
    finally { setDeletingIds(prev => { const n = new Set(prev); n.delete(item.id); return n }) }
  }

  const handleDeleteSelected = async () => {
    const toDelete = items.filter(i => selectedIds.has(i.id))
    toDelete.forEach(i => setDeletingIds(prev => new Set(prev).add(i.id)))
    await Promise.all(toDelete.map(i => apiPost({ action: i.type === 'folder' ? 'deleteFolder' : 'delete', id: i.id, sig: i.sig })))
    setSelectedIds(new Set()); setSelectionMode(false); loadItems(currentPath, false)
  }

  const openMoveModal = async (item?: DriveItem) => {
    if (item) setSelectedIds(new Set([item.id]))
    setMoveFolderPath(clientRoot); setShowMoveModal(true)
    setLoadingFolders(true)
    const result: PastaDestino[] = []
    await fetchAllFolders(clientRoot, '', result)
    // Filtra a própria pasta selecionada
    setAllFolders(result.filter(f => !(item?.type === 'folder' && f.id === item.id)))
    setLoadingFolders(false)
  }

  const handleMoveSelected = async () => {
    setMoveLoading(true)
    const alvo = items.filter(i => selectedIds.has(i.id))
    // Só escurece se for seleção múltipla real (selectionMode ativo)
    if (selectionMode) alvo.forEach(i => setMovingIds(prev => new Set(prev).add(i.id)))
    await Promise.all(alvo.map(i => apiPost({ action: 'move', id: i.id, sig: i.sig, targetPath: moveFolderPath })))
    setMovingIds(new Set()); setSelectedIds(new Set()); setSelectionMode(false)
    setShowMoveModal(false); setMoveLoading(false); loadItems(currentPath, false)
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim(); if (!name) return
    if (name.includes('/')) { setFolderNameError('O nome não pode ter barra (/).'); return }
    if (items.some(i => i.type === 'folder' && i.name.toLowerCase() === name.toLowerCase())) { setFolderNameError('Já existe uma pasta com esse nome.'); return }
    setCreatingFolder(true); setFolderNameError('')
    await apiPost({ action: 'createFolder', name, folderPath: currentPath })
    setNewFolderName(''); setCreatingFolder(false); setShowNewFolderModal(false)
    loadItems(currentPath, false)
  }

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return
    await apiPost({ action: 'rename', id: selectedItem.id, sig: selectedItem.sig, name: renameValue.trim() })
    setShowRenameModal(false); setSelectedItem(null); setRenameValue('')
    loadItems(currentPath, false)
  }

  const cancelUpload = (id: string) => setStagedFiles(prev => prev.filter(f => f.id !== id))

  const handleDownloadFolder = async (folder: DriveItem) => {
    setZipProgress({ current: 0, total: 0, name: 'Preparando...' })
    try {
      await downloadFolderAsZip(folder, currentPath, (p) => setZipProgress(p))
    } catch (err: any) {
      alert('Erro ao baixar a pasta: ' + err.message)
    } finally {
      setZipProgress(null)
    }
  }

  const downloadSelected = () => {
    items.filter(i => selectedIds.has(i.id) && i.type === 'file').forEach(f => {
      const a = document.createElement('a'); a.href = getDownloadUrl(f.id); a.click()
    })
    items.filter(i => selectedIds.has(i.id) && i.type === 'folder').forEach(f => handleDownloadFolder(f))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const abrirItem = (item: DriveItem) => {
    if (selectionMode) { toggleSelect(item.id); return }
    if (item.type === 'folder') navigateTo(item.name, juntar(currentPath, item.name))
    else if (isImage(item.mimeType, item.name)) setPreviewFile(item)
    else if (canPreview(item.mimeType, item.name)) setEmbedFile(item)
    else window.open(getDownloadUrl(item.id), '_blank')
  }

  const abrirNovaPasta = () => { setNewFolderName(''); setFolderNameError(''); setSidebarOpen(false); setShowNewFolderModal(true) }
  const alternarSelecao = () => { setSelectionMode(!selectionMode); setSelectedIds(new Set()) }

  const folders = items.filter(i => i.type === 'folder')
  const files = items.filter(i => i.type === 'file')
  const pendentes = stagedFiles.filter(f => f.status === 'pending').length
  const pastaAtual = breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Meus arquivos'

  const ItemMenu = ({ item }: { item: DriveItem }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="btn btn-ghost size-8" aria-label={`Ações de ${item.name}`} onClick={e => e.stopPropagation()}>
          <MoreHorizontal className="size-4"/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass min-w-44 rounded-[12px] border-line p-1 text-text shadow-[var(--shadow-pop)]">
        {item.type === 'file' ? (
          <DropdownMenuItem asChild><a href={getDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer"><Download className="size-4"/> Baixar</a></DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => handleDownloadFolder(item)}><Download className="size-4"/> Baixar como ZIP</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openMoveModal(item)}><Move className="size-4"/> Mover para...</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setSelectedItem(item); setRenameValue(item.name); setShowRenameModal(true) }}><Pencil className="size-4"/> Renomear</DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem onClick={() => handleDelete(item)} className="text-danger focus:text-danger"><Trash2 className="size-4 text-danger"/> Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const Marcador = ({ item }: { item: DriveItem }) => {
    const marcado = selectedIds.has(item.id)
    return (
      <button onClick={e => { e.stopPropagation(); toggleSelect(item.id) }} aria-label={marcado ? 'Desmarcar' : 'Marcar'}
        className={cn('grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
          marcado ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface-sunken')}>
        {marcado && <Check className="size-3.5" strokeWidth={3}/>}
      </button>
    )
  }

  const estadoCard = (item: DriveItem) => cn(
    (deletingIds.has(item.id) || movingIds.has(item.id)) && 'pointer-events-none opacity-40',
    selectionMode && selectedIds.has(item.id) && 'border-brand bg-brand-soft',
    dragOverFolder === item.id && 'border-brand bg-brand-soft',
    draggingItemId === item.id && 'opacity-50',
  )

  const CartaoPasta = ({ item }: { item: DriveItem }) => (
    <div
      draggable={!selectionMode}
      onDragStart={e => handleItemDragStart(e, item)}
      onDragEnd={() => setDraggingItemId(null)}
      onDragOver={e => handleFolderDragOver(e, item.id)}
      onDragLeave={handleFolderDragLeave}
      onDrop={e => handleFolderDrop(e, item)}
      className={cn('panel hover-lift group relative flex items-center gap-3 py-2.5 pl-3 pr-2', estadoCard(item))}
    >
      {selectionMode && <Marcador item={item}/>}
      <button onClick={() => abrirItem(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="selo size-10 shrink-0"><IconePasta/></span>
        <span className="min-w-0 flex-1 truncate text-base font-medium" title={item.name}>{item.name}</span>
      </button>
      {(deletingIds.has(item.id) || movingIds.has(item.id))
        ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-text"/>
        : !selectionMode && <div className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"><ItemMenu item={item}/></div>}
    </div>
  )

  const CartaoArquivo = ({ item }: { item: DriveItem }) => (
    <div
      draggable={!selectionMode}
      onDragStart={e => handleItemDragStart(e, item)}
      onDragEnd={() => setDraggingItemId(null)}
      className={cn('panel hover-lift group relative flex flex-col overflow-hidden', estadoCard(item))}
    >
      <button onClick={() => abrirItem(item)} className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden border-b border-line bg-surface-sunken">
        {isImage(item.mimeType, item.name) ? (
          <img src={getProxyUrl(item)} alt="" loading="lazy" className="size-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
        ) : (
          <FileIcon type={getFileType(item.name)} size={30}/>
        )}
        {(deletingIds.has(item.id) || movingIds.has(item.id)) && (
          <span className="absolute inset-0 grid place-items-center bg-black/40"><Loader2 className="size-5 animate-spin text-brand-text"/></span>
        )}
      </button>
      {selectionMode && <div className="absolute left-2.5 top-2.5"><Marcador item={item}/></div>}
      <div className="flex items-center gap-1 py-2 pl-3 pr-1.5">
        <button onClick={() => abrirItem(item)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <p className="text-xs text-text-3 tabular">{item.size ? formatFileSize(item.size) : getExt(item.name).toUpperCase() || 'Arquivo'}</p>
        </button>
        {!selectionMode && <ItemMenu item={item}/>}
      </div>
    </div>
  )

  const LinhaMobile = ({ item }: { item: DriveItem }) => (
    <div className={cn('flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 transition-colors',
      selectionMode && selectedIds.has(item.id) ? 'bg-brand-soft' : 'active:bg-surface-hover',
      (deletingIds.has(item.id) || movingIds.has(item.id)) && 'opacity-40')}>
      {selectionMode && <Marcador item={item}/>}
      <button onClick={() => abrirItem(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="selo size-11 shrink-0 overflow-hidden">
          {item.type === 'folder' ? <IconePasta/> : isImage(item.mimeType, item.name)
            ? <img src={getProxyUrl(item)} alt="" loading="lazy" className="size-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
            : <FileIcon type={getFileType(item.name)} size={20}/>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{item.name}</span>
          <span className="block text-xs text-text-3 tabular">{item.type === 'folder' ? 'Pasta' : item.size ? formatFileSize(item.size) : 'Arquivo'}</span>
        </span>
      </button>
      {(deletingIds.has(item.id) || movingIds.has(item.id)) ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-text"/> : !selectionMode && (
        <div className="flex shrink-0 items-center">
          {item.type === 'file' ? (
            <a href={getDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost size-10" aria-label={`Baixar ${item.name}`}>
              <Download className="size-[18px]"/>
            </a>
          ) : (
            <button onClick={() => handleDownloadFolder(item)} className="btn btn-ghost size-10" aria-label={`Baixar ${item.name} como ZIP`}>
              <Download className="size-[18px]"/>
            </button>
          )}
          <ItemMenu item={item}/>
        </div>
      )}
    </div>
  )

  const Menu_ = () => (
    <nav className="flex h-full flex-col gap-5 px-3 py-5">
      <div className="px-2"><Logo height={28}/></div>
      {usuario ? (
        <div className="rounded-[12px] border border-line bg-surface-sunken px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-text">{usuario}</p>
          <p className="truncate text-xs text-text-3">{clientRoot ? `Pasta ${clientRoot.split('/').pop()}` : 'Acesso a todas as pastas'}</p>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <p className="px-2.5 pb-1 text-xs font-medium text-text-3">Você está em</p>
        {breadcrumbs.map((crumb, index) => {
          const atual = index === breadcrumbs.length - 1
          return (
            <button key={index} onClick={() => navigateToBreadcrumb(index)}
              className={cn('group flex h-9 items-center gap-2.5 rounded-[10px] pr-2.5 text-left text-base transition-colors duration-150',
                atual ? 'bg-brand-soft font-medium text-text shadow-[inset_0_0_0_1px_var(--line)]' : 'text-text-2 hover:bg-surface-hover hover:text-text')}
              style={{ paddingLeft: 10 + Math.min(index, 6) * 12 }}>
              <Folder className={cn('size-[18px] shrink-0', atual ? 'text-brand-text' : 'text-text-3 group-hover:text-text-2')} aria-hidden/>
              <span className="flex-1 truncate">{crumb.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
        <button onClick={abrirNovaPasta} className="btn btn-secondary h-9 px-3.5 text-base"><FolderPlus className="size-4"/> Nova pasta</button>
        <button onClick={sair} className="btn btn-ghost h-9 px-3.5 text-base"><LogOut className="size-4"/> Sair</button>
      </div>
    </nav>
  )

  return (
    <div className="relative min-h-dvh">
      <div className="ambient" aria-hidden/>
      {/* Entradas de arquivo únicas, acionadas pelos botões e pela área de soltar. */}
      <input ref={fileInputRef} id="enviar-arquivos" type="file" className="hidden" multiple onChange={handleFileSelect}/>
      <input id="enviar-pasta" type="file" className="hidden" multiple {...({ webkitdirectory: '' } as any)} onChange={handleFolderSelect}/>

      <aside className="glass fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-line lg:block"><Menu_/></aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)}/>
          <aside className="glass absolute inset-y-0 left-0 w-[min(280px,85vw)] border-r border-line" style={{ background: 'var(--glass-strong)' }}>
            <button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" className="btn btn-ghost absolute right-2 top-4 size-9"><X className="size-4"/></button>
            <Menu_/>
          </aside>
        </div>
      )}

      <div className="relative z-[1] lg:pl-[248px]">
        <header className="glass sticky top-0 z-10 flex h-16 items-center gap-2 border-b border-line px-3 sm:px-6">
          <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" className="btn btn-ghost size-9 lg:hidden"><Menu className="size-[18px]"/></button>
          {breadcrumbs.length > 1 && (
            <button onClick={() => navigateToBreadcrumb(breadcrumbs.length - 2)} aria-label="Voltar" className="btn btn-ghost size-9 md:hidden"><ArrowLeft className="size-[18px]"/></button>
          )}
          {/* No celular, a pasta inicial mostra a logo; o caminho aparece só dentro das subpastas. */}
          {breadcrumbs.length === 1 && <div className="flex-1 md:hidden"><Logo height={22}/></div>}
          <nav aria-label="Caminho" className={cn('min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-base [scrollbar-width:none]', breadcrumbs.length === 1 ? 'hidden md:flex' : 'flex')}>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex shrink-0 items-center gap-1">
                {index > 0 && <ChevronRight className="size-3.5 text-text-3"/>}
                <button onClick={() => navigateToBreadcrumb(index)}
                  className={cn('rounded-md px-1.5 py-1 transition-colors hover:bg-surface-hover', index === breadcrumbs.length - 1 ? 'font-medium text-text' : 'text-text-3 hover:text-text')}>
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => loadItems(currentPath, false)} aria-label="Atualizar" title="Atualizar" className="btn btn-ghost size-9"><RefreshCw className="size-4"/></button>
            <button onClick={alternarSelecao} className={cn('btn h-9 px-3.5 text-base max-md:hidden', selectionMode ? 'btn-primary' : 'btn-secondary')}>
              <CheckSquare className="size-4"/> {selectionMode ? 'Cancelar' : 'Selecionar'}
            </button>
            <button onClick={abrirNovaPasta} className="btn btn-secondary h-9 px-3.5 text-base max-lg:hidden"><FolderPlus className="size-4"/> Nova pasta</button>
            <label htmlFor="enviar-pasta" role="button" className="btn btn-secondary h-9 px-3.5 text-base max-md:hidden"><FolderUp className="size-4"/> Enviar pasta</label>
            <label htmlFor="enviar-arquivos" role="button" className="btn btn-primary h-9 px-3.5 text-base max-md:hidden"><Upload className="size-4"/> Enviar arquivos</label>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] px-4 pb-32 pt-7 sm:px-6 md:pb-16 lg:px-8">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em]">{pastaAtual}</h1>
            <p className="text-base text-text-3">
              {initialLoading ? 'Carregando...' : items.length ? `${plural(folders.length, 'pasta', 'pastas')} · ${plural(files.length, 'arquivo', 'arquivos')}` : 'Pasta vazia'}
            </p>
          </div>

          {/* BARRA DE SELEÇÃO */}
          {selectionMode && (
            <div className="glass sticky top-[76px] z-[5] mb-5 flex flex-wrap items-center gap-2 rounded-[14px] border border-line px-3 py-2.5 shadow-[var(--shadow-pop)]">
              <span className="px-1 text-base font-medium tabular">{plural(selectedIds.size, 'selecionado', 'selecionados')}</span>
              <button onClick={() => setSelectedIds(new Set(items.map(i => i.id)))} className="btn btn-ghost h-8 px-2.5 text-sm">Todos</button>
              <button onClick={() => setSelectedIds(new Set())} className="btn btn-ghost h-8 px-2.5 text-sm">Limpar</button>
              <span className="flex-1"/>
              {selectedIds.size > 0 && (
                <>
                  <button onClick={() => openMoveModal()} className="btn btn-secondary h-8 px-3 text-sm"><Move className="size-4"/> Mover</button>
                  <button onClick={downloadSelected} className="btn btn-secondary h-8 px-3 text-sm"><Download className="size-4"/> Baixar</button>
                  <button onClick={handleDeleteSelected} className="btn btn-danger h-8 px-3 text-sm"><Trash2 className="size-4"/> Excluir</button>
                </>
              )}
            </div>
          )}

          {/* ARQUIVOS NA FILA */}
          {stagedFiles.length > 0 && (
            <section className="panel mb-6 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 className="text-base font-semibold">Envios</h2>
                {pendentes > 0 && (
                  <button onClick={handleUploadAll} disabled={isUploadingAll} className="btn btn-primary h-8 px-3 text-sm">
                    {isUploadingAll ? <Loader2 className="size-4 animate-spin"/> : <Upload className="size-4"/>}
                    {isUploadingAll ? 'Enviando...' : `Enviar ${plural(pendentes, 'arquivo', 'arquivos')}`}
                  </button>
                )}
              </div>
              <ul>
                {stagedFiles.map(s => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="selo size-9 shrink-0"><FileIcon type={getFileType(s.file.name)} size={18}/></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base">{s.file.name}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className="text-text-3 tabular">{formatFileSize(s.file.size)}</span>
                        {s.status === 'pending' && <span className="text-text-3">Aguardando</span>}
                        {s.status === 'uploading' && <span className="text-brand-text tabular">{s.progress}%</span>}
                        {s.status === 'error' && <span className="truncate text-danger">{s.error}</span>}
                        {s.status === 'done' && <span className="flex items-center gap-1 text-success"><Check className="size-3"/> Enviado</span>}
                      </div>
                      {s.status === 'uploading' && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
                          <div className="h-full rounded-full transition-[width]" style={{ width: `${s.progress}%`, background: 'var(--aura-gradient)' }}/>
                        </div>
                      )}
                    </div>
                    {s.status === 'uploading' && <Loader2 className="size-4 shrink-0 animate-spin text-brand-text"/>}
                    {s.status !== 'done' && s.status !== 'uploading' && (
                      <button onClick={() => cancelUpload(s.id)} className="btn btn-ghost size-8" aria-label="Tirar da fila"><X className="size-4"/></button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {initialLoading ? (
            <div className="grid h-64 place-items-center"><Loader2 className="size-7 animate-spin text-brand-text" aria-label="Carregando"/></div>
          ) : (
            <>
              {/* ÁREA DE SOLTAR */}
              <button
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn('mb-7 flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed text-center transition-colors',
                  items.length === 0 ? 'min-h-[280px] px-6 py-12' : 'px-4 py-5 max-md:hidden',
                  isDragging ? 'border-brand bg-brand-soft' : 'border-line-strong hover:border-brand hover:bg-surface')}
              >
                <span className={cn('grid place-items-center rounded-2xl bg-brand-soft text-brand-text', items.length === 0 ? 'size-14' : 'size-10')}>
                  <UploadCloud className={items.length === 0 ? 'size-7' : 'size-5'} aria-hidden/>
                </span>
                <span className="text-md font-medium">{items.length === 0 ? 'Esta pasta está vazia' : 'Solte arquivos aqui para enviar'}</span>
                <span className="text-sm text-text-3">{items.length === 0 ? 'Toque para escolher ou arraste arquivos até aqui.' : 'ou clique para escolher no computador'}</span>
              </button>

              {folders.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 text-sm font-medium text-text-3 max-md:hidden">Pastas</h2>
                  <div className="grid gap-3 max-md:hidden sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {folders.map(item => <CartaoPasta key={item.id} item={item}/>)}
                  </div>
                </section>
              )}
              {files.length > 0 && (
                <section className="max-md:hidden">
                  <h2 className="mb-3 text-sm font-medium text-text-3">Arquivos</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {files.map(item => <CartaoArquivo key={item.id} item={item}/>)}
                  </div>
                </section>
              )}
              {items.length > 0 && (
                <div className="panel overflow-hidden md:hidden">
                  {[...folders, ...files].map(item => <LinhaMobile key={item.id} item={item}/>)}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* BARRA INFERIOR NO CELULAR */}
      <div className="glass fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t border-line px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 md:hidden">
        <button onClick={alternarSelecao} className={cn('flex w-16 flex-col items-center gap-1 py-1 text-2xs', selectionMode ? 'text-brand-text' : 'text-text-3')}>
          <CheckSquare className="size-[22px]"/> Selecionar
        </button>
        <label htmlFor="enviar-pasta" role="button" className="flex w-16 flex-col items-center gap-1 py-1 text-2xs text-text-3">
          <FolderUp className="size-[22px]"/> Pasta
        </label>
        <label htmlFor="enviar-arquivos" role="button" className="-mt-6 flex w-16 flex-col items-center gap-1 text-2xs text-text-2">
          <span className="grid size-14 place-items-center rounded-full bg-brand text-on-brand shadow-[0_10px_30px_-8px_var(--brand)]"><Upload className="size-6"/></span>
          Enviar
        </label>
        <button onClick={abrirNovaPasta} className="flex w-16 flex-col items-center gap-1 py-1 text-2xs text-text-3">
          <FolderPlus className="size-[22px]"/> Nova pasta
        </button>
        <button onClick={() => setSidebarOpen(true)} className="flex w-16 flex-col items-center gap-1 py-1 text-2xs text-text-3">
          <Menu className="size-[22px]"/> Menu
        </button>
      </div>

      {/* VISUALIZAR IMAGEM */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_3_10/0.92)] backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
          <button onClick={() => setPreviewFile(null)} aria-label="Fechar" className="btn btn-secondary absolute right-4 top-4 z-10 size-10 rounded-full"><X className="size-5"/></button>
          <div className="flex max-h-[95vh] max-w-[95vw] flex-col items-center gap-4 p-4" onClick={e => e.stopPropagation()}>
            <img src={getProxyUrl(previewFile)} alt={previewFile.name} className="max-h-[80vh] max-w-full rounded-[var(--radius-card)] object-contain"/>
            <div className="flex items-center gap-3">
              <p className="max-w-[200px] truncate text-base md:max-w-[420px]">{previewFile.name}</p>
              <a href={getDownloadUrl(previewFile.id)} target="_blank" rel="noopener noreferrer" className="btn btn-primary h-9 px-3.5 text-base"><Download className="size-4"/> Baixar</a>
            </div>
          </div>
        </div>
      )}

      {/* VÍDEO E PDF */}
      {embedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_3_10/0.92)] backdrop-blur-sm" onClick={() => setEmbedFile(null)}>
          <button onClick={() => setEmbedFile(null)} aria-label="Fechar" className="btn btn-secondary absolute right-4 top-4 z-10 size-10 rounded-full"><X className="size-5"/></button>
          <div className="flex w-[95vw] max-w-4xl flex-col gap-3 p-4" onClick={e => e.stopPropagation()}>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-black" style={{ aspectRatio: isVideo(embedFile.mimeType, embedFile.name) ? '16/9' : '4/3', maxHeight: '80vh' }}>
              {isVideo(embedFile.mimeType, embedFile.name)
                ? <video src={getProxyUrl(embedFile)} controls autoPlay className="size-full"/>
                : <iframe src={getProxyUrl(embedFile)} title={embedFile.name} className="size-full border-0"/>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="max-w-[200px] truncate text-base md:max-w-[420px]">{embedFile.name}</p>
              <a href={getDownloadUrl(embedFile.id)} target="_blank" rel="noopener noreferrer" className="btn btn-primary h-9 px-3.5 text-base"><Download className="size-4"/> Baixar</a>
            </div>
          </div>
        </div>
      )}

      {/* PROGRESSO DO ZIP */}
      {zipProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(4_3_10/0.7)] backdrop-blur-sm">
          <div className="glass flex w-[90vw] max-w-sm flex-col gap-4 rounded-[var(--radius-dialog)] border border-line p-7 shadow-[var(--shadow-pop)]">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand-text"><Loader2 className="size-5 animate-spin"/></span>
              <div className="min-w-0">
                <p className="text-md font-semibold">Preparando o ZIP</p>
                <p className="truncate text-sm text-text-3">{zipProgress.name}</p>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full transition-[width] duration-300"
                style={{ width: zipProgress.total > 0 ? `${Math.round((zipProgress.current / zipProgress.total) * 100)}%` : '8%', background: 'var(--aura-gradient)' }}/>
            </div>
            {zipProgress.total > 0 && <p className="text-sm text-text-2 tabular">{zipProgress.current} de {zipProgress.total} arquivos</p>}
          </div>
        </div>
      )}

      {/* JANELAS */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className={dialogo}>
          <DialogHeader><DialogTitle className="text-xl">Nova pasta</DialogTitle><DialogDescription className="text-text-2">Ela será criada em {pastaAtual}.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-1.5">
            <input value={newFolderName} onChange={e => { setNewFolderName(e.target.value); setFolderNameError('') }}
              className="campo h-11 px-3" placeholder="Nome da pasta" aria-invalid={Boolean(folderNameError)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} autoFocus/>
            {folderNameError && <p className="text-xs text-danger" role="alert">{folderNameError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setShowNewFolderModal(false)} className="btn btn-ghost h-9 px-3.5 text-base">Cancelar</button>
            <button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()} className="btn btn-primary h-9 px-3.5 text-base">
              {creatingFolder && <Loader2 className="size-4 animate-spin"/>} {creatingFolder ? 'Criando...' : 'Criar pasta'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className={dialogo}>
          <DialogHeader><DialogTitle className="text-xl">Renomear</DialogTitle><DialogDescription className="text-text-2">Escolha o novo nome.</DialogDescription></DialogHeader>
          <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
            className="campo h-11 px-3" placeholder="Novo nome"
            onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus/>
          <DialogFooter className="gap-2">
            <button onClick={() => setShowRenameModal(false)} className="btn btn-ghost h-9 px-3.5 text-base">Cancelar</button>
            <button onClick={handleRename} disabled={!renameValue.trim()} className="btn btn-primary h-9 px-3.5 text-base">Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveModal} onOpenChange={setShowMoveModal}>
        <DialogContent className={dialogo}>
          <DialogHeader><DialogTitle className="text-xl">Mover para...</DialogTitle><DialogDescription className="text-text-2">Escolha a pasta de destino.</DialogDescription></DialogHeader>
          <div className="-mx-2 flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto px-2">
            {[{ id: 'raiz', path: clientRoot, label: 'Meus arquivos' }, ...(loadingFolders ? [] : allFolders)].map(f => (
              <button key={f.path || 'raiz'} onClick={() => setMoveFolderPath(f.path)}
                className={cn('flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-base transition-colors',
                  moveFolderPath === f.path ? 'bg-brand-soft font-medium text-text shadow-[inset_0_0_0_1px_var(--line)]' : 'text-text-2 hover:bg-surface-hover hover:text-text')}>
                <Folder className={cn('size-[18px] shrink-0', moveFolderPath === f.path ? 'text-brand-text' : 'text-text-3')}/>
                <span className="truncate">{f.label}</span>
                {moveFolderPath === f.path && <Check className="ml-auto size-4 shrink-0 text-brand-text"/>}
              </button>
            ))}
            {loadingFolders && <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-brand-text"/></div>}
            {!loadingFolders && allFolders.length === 0 && <p className="py-4 text-center text-sm text-text-3">Nenhuma outra pasta ainda.</p>}
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setShowMoveModal(false)} className="btn btn-ghost h-9 px-3.5 text-base">Cancelar</button>
            <button onClick={handleMoveSelected} disabled={moveLoading} className="btn btn-primary h-9 px-3.5 text-base">
              {moveLoading && <Loader2 className="size-4 animate-spin"/>} {moveLoading ? 'Movendo...' : 'Mover aqui'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
