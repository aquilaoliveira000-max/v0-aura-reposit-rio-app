'use client'

import { useState, useCallback, useRef, DragEvent, useEffect, useMemo } from 'react'
import {
  Upload, FolderPlus, ChevronRight, ChevronLeft, X, MoreHorizontal, Folder, LogOut, Check, RefreshCw, FolderUp,
  Trash2, Move, Loader2, Download, ArrowLeft, Menu, CheckSquare, Pencil, UploadCloud, Star, Search,
  LayoutGrid, List, ArrowDownUp, Palette,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { FileIcon } from './file-icons'
import { formatFileSize, getFileType, generateId } from '@/lib/aura-types'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

type Cor = 'roxo' | 'azul' | 'rosa' | 'verde' | 'amarelo' | 'laranja' | 'vermelho'
interface DriveItem {
  id: string; name: string; type: 'file' | 'folder'
  /** Assinatura entregue pelo servidor na listagem; prova que o item é da pasta do cliente. */
  sig: string
  mimeType?: string; size?: number; createdAt?: string; modifiedAt?: string
  cor?: Cor; favorito?: boolean
}
interface StagedFile {
  file: File; id: string; progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string; folderPath?: string
}
interface ZipProgress { current: number; total: number; name: string }
interface PastaDestino { id: string; name: string; path: string; label: string }
type Ordem = 'nome' | 'recentes' | 'tamanho'
type Vista = 'grade' | 'lista'

// ── Helpers ───────────────────────────────────────────────────────────
const IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','heic','avif']
const VIDEO_EXTS = ['mp4','mov','avi','mkv','webm','m4v','wmv','flv']
const getExt = (n: string) => n.split('.').pop()?.toLowerCase() || ''
const isImage = (m?: string, n?: string) => !!m?.startsWith('image/') || (!!n && IMAGE_EXTS.includes(getExt(n)))
const isVideo = (m?: string, n?: string) => !!m?.startsWith('video/') || (!!n && VIDEO_EXTS.includes(getExt(n)))
const isPdf   = (m?: string, n?: string) => m === 'application/pdf' || getExt(n||'') === 'pdf'
const canPreview = (m?: string, n?: string) => isImage(m,n) || isVideo(m,n) || isPdf(m,n)
const isFolderFile = (f: File) => f.size === 0 && f.type === ''
const juntar = (base: string, nome: string) => (!nome ? base : base ? `${base}/${nome}` : nome)
const getProxyUrl = (item: Pick<DriveItem, 'id' | 'sig' | 'name'>) =>
  `/api/drive/file?id=${item.id}&sig=${encodeURIComponent(item.sig)}&name=${encodeURIComponent(item.name)}`
// Download vai direto ao Drive — sem proxy, sem timeout, sem limite de tamanho
const getDownloadUrl = (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const dataCurta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Cores para destacar pastas, tiradas do espectro da marca e dos tons de estado. */
const CORES: { id: Cor; nome: string; valor: string }[] = [
  { id: 'roxo', nome: 'Roxo', valor: 'var(--brand-text)' },
  { id: 'azul', nome: 'Azul', valor: '#7a8bff' },
  { id: 'rosa', nome: 'Rosa', valor: '#f07bdc' },
  { id: 'verde', nome: 'Verde', valor: 'var(--success)' },
  { id: 'amarelo', nome: 'Amarelo', valor: 'var(--warning)' },
  { id: 'laranja', nome: 'Laranja', valor: '#f39a5b' },
  { id: 'vermelho', nome: 'Vermelho', valor: 'var(--danger)' },
]
const valorCor = (cor?: Cor) => CORES.find(c => c.id === cor)?.valor ?? 'var(--brand-text)'
/** Fundo e borda suaves do cartão de uma pasta colorida. */
const estiloCor = (cor?: Cor) => cor ? {
  background: `color-mix(in oklch, ${valorCor(cor)} 9%, var(--surface))`,
  borderColor: `color-mix(in oklch, ${valorCor(cor)} 34%, transparent)`,
} : undefined

const lerPreferencia = <T extends string>(chave: string, padrao: T, validos: T[]): T => {
  try { const v = localStorage.getItem(chave) as T | null; return v && validos.includes(v) ? v : padrao } catch { return padrao }
}
const gravarPreferencia = (chave: string, valor: string) => { try { localStorage.setItem(chave, valor) } catch { /* modo privado */ } }

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

/** Ícone de pasta na cor escolhida (ou no tom da marca). */
function IconePasta({ size = 22, cor }: { size?: number; cor?: Cor }) {
  return <Folder style={{ width: size, height: size, color: valorCor(cor) }} fill="currentColor" fillOpacity={cor ? 0.32 : 0.18} strokeWidth={1.75} aria-hidden />
}

const dialogo = 'glass border-line rounded-[var(--radius-dialog)] shadow-[var(--shadow-pop)] text-text sm:max-w-md'
const menuClasse = 'glass min-w-48 rounded-[12px] border-line p-1 text-text shadow-[var(--shadow-pop)]'

export function FileManager() {
  const router = useRouter()
  const [items, setItems] = useState<DriveItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')
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
  const [previewFile, setPreviewFile] = useState<DriveItem | null>(null)
  const [embedFile, setEmbedFile] = useState<DriveItem | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clientRoot, setClientRoot] = useState('')
  const [usuario, setUsuario] = useState('')
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [allFolders, setAllFolders] = useState<PastaDestino[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [vista, setVista] = useState<Vista>('grade')
  const [excluir, setExcluir] = useState<DriveItem[] | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentPathRef = useRef('')
  const enviando = useRef(false)

  useEffect(() => { currentPathRef.current = currentPath }, [currentPath])
  useEffect(() => {
    setOrdem(lerPreferencia<Ordem>('aura_ordem', 'nome', ['nome', 'recentes', 'tamanho']))
    setVista(lerPreferencia<Vista>('aura_vista', 'grade', ['grade', 'lista']))
  }, [])

  const loadItems = useCallback(async (path: string, showLoader = true): Promise<void> => {
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
      } else if (res.status === 403 && path !== clientRootRef.current) {
        // Endereço com pasta de fora: volta para a pasta do cliente.
        abrirPasta(clientRootRef.current, 'substituir')
      } else {
        console.error('[Drive] Erro ao listar:', data.error || 'erro desconhecido')
      }
    } catch (err) {
      console.error('[Drive] Falha de rede:', err)
    }
    if (showLoader) setInitialLoading(false)
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientRootRef = useRef('')

  /** Pasta aberta no endereço (?pasta=...), relativa à pasta do cliente: o "voltar" do navegador funciona. */
  const caminhoDoEndereco = (root: string) => {
    const rel = new URLSearchParams(window.location.search).get('pasta') || ''
    return juntar(root, rel.split('/').map(p => p.trim()).filter(Boolean).join('/'))
  }
  const abrirPasta = (path: string, historico: 'empilhar' | 'substituir' | 'nada' = 'empilhar') => {
    const root = clientRootRef.current
    const rel = root && path.startsWith(root) ? path.slice(root.length).replace(/^\//, '') : path
    if (historico !== 'nada') {
      const url = rel ? `/files?pasta=${encodeURIComponent(rel)}` : '/files'
      if (historico === 'empilhar') window.history.pushState({ pasta: path }, '', url)
      else window.history.replaceState({ pasta: path }, '', url)
    }
    setCurrentPath(path); currentPathRef.current = path
    setSelectedIds(new Set()); setSelectionMode(false); setSidebarOpen(false); setBusca('')
    loadItems(path, true)
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    // A pasta do cliente vem da sessão no servidor, nunca do navegador.
    fetch('/api/auth', { cache: 'no-store' })
      .then(r => r.json())
      .then((s: { success: boolean; usuario?: string; raiz?: string }) => {
        if (!s.success) { router.replace('/'); return }
        const root = s.raiz || ''
        clientRootRef.current = root
        setUsuario(s.usuario || '')
        setClientRoot(root)
        abrirPasta(caminhoDoEndereco(root), 'substituir')
        interval = setInterval(() => document.visibilityState === 'visible' && loadItems(currentPathRef.current, false), 30000)
      })
      .catch(() => router.replace('/'))
    const aoVoltar = () => abrirPasta(caminhoDoEndereco(clientRootRef.current), 'nada')
    window.addEventListener('popstate', aoVoltar)
    return () => { clearInterval(interval); window.removeEventListener('popstate', aoVoltar) }
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  // Caminho visível: "Meus arquivos" e as subpastas a partir da pasta do cliente.
  const breadcrumbs = useMemo(() => {
    const rel = clientRoot && currentPath.startsWith(clientRoot) ? currentPath.slice(clientRoot.length).replace(/^\//, '') : clientRoot ? '' : currentPath
    const partes = rel ? rel.split('/') : []
    return [{ name: 'Meus arquivos', path: clientRoot }, ...partes.map((nome, i) => ({ name: nome, path: juntar(clientRoot, partes.slice(0, i + 1).join('/')) }))]
  }, [currentPath, clientRoot])
  const pastaAcima = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null
  const voltar = () => pastaAcima && abrirPasta(pastaAcima.path)

  const sair = async () => {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => undefined)
    router.replace('/')
  }

  // ── Envio ──
  const adicionarNaFila = (files: File[], folderPath?: (f: File) => string) => {
    const validos = files.filter(f => {
      if (isFolderFile(f)) { setStagedFiles(prev => [...prev, { file: f, id: generateId(), progress: 0, status: 'error', error: 'É uma pasta. Use "Enviar pasta".' }]); return false }
      return true
    })
    if (validos.length) setStagedFiles(prev => [...prev, ...validos.map(f => ({ file: f, id: generateId(), progress: 0, status: 'pending' as const, folderPath: folderPath?.(f) ?? currentPathRef.current }))])
  }

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDragging(true) }, [])
  // Só encerra quando o arrasto sai da janela (relatedTarget nulo), não ao passar entre elementos.
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); if (!e.relatedTarget) setIsDragging(false) }, [])
  const handleDrop = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); adicionarNaFila(Array.from(e.dataTransfer.files)) }

  const handleItemDragStart = (e: React.DragEvent, item: DriveItem) => {
    setDraggingItemId(item.id); e.dataTransfer.setData('itemId', item.id)
  }
  const handleFolderDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); e.stopPropagation(); setDragOverFolder(id) }
  const handleFolderDragLeave = () => setDragOverFolder(null)
  const handleFolderDrop = async (e: React.DragEvent, target: DriveItem) => {
    e.preventDefault(); e.stopPropagation(); setDragOverFolder(null); setIsDragging(false)
    if (e.dataTransfer.files.length) { adicionarNaFila(Array.from(e.dataTransfer.files), () => juntar(currentPath, target.name)); return }
    const item = items.find(i => i.id === e.dataTransfer.getData('itemId'))
    if (!item || item.id === target.id) return
    setMovingIds(prev => new Set(prev).add(item.id))
    try { await apiPost({ action: 'move', id: item.id, sig: item.sig, targetPath: juntar(currentPath, target.name) }); loadItems(currentPath, false) }
    finally { setMovingIds(prev => { const n = new Set(prev); n.delete(item.id); return n }) }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { adicionarNaFila(Array.from(e.target.files || [])); e.target.value = '' }
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    adicionarNaFila(Array.from(e.target.files || []), f => {
      const rel = (f as any).webkitRelativePath || f.name
      return juntar(currentPathRef.current, rel.split('/').slice(0, -1).join('/'))
    })
    e.target.value = ''
  }

  const uploadFile = async (staged: StagedFile) => {
    setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'uploading' } : f))
    try {
      const CHUNK = 8 * 1024 * 1024 // 8MB direto ao Drive
      const { file } = staged
      const totalSize = file.size

      // Passo 1: pede session URI ao nosso servidor (autenticação)
      const startData = await apiPost({
        action: 'startUpload',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        totalSize,
        folderPath: staged.folderPath ?? currentPathRef.current,
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
      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, status: 'error', error: err.message } : f))
    }
  }

  // O envio começa sozinho: arquivos da pasta atual juntos (até 3 por vez), pastas inteiras um a um.
  useEffect(() => {
    const pendentes = stagedFiles.filter(f => f.status === 'pending')
    if (!pendentes.length || enviando.current) return
    enviando.current = true
    ;(async () => {
      const soltos = pendentes.filter(f => f.folderPath === currentPathRef.current)
      const emPastas = pendentes.filter(f => f.folderPath !== currentPathRef.current)
      for (let i = 0; i < soltos.length; i += 3) await Promise.all(soltos.slice(i, i + 3).map(uploadFile))
      for (const s of emPastas) await uploadFile(s)
      enviando.current = false
      setStagedFiles(prev => [...prev]) // confere se entrou mais coisa na fila durante o envio
    })()
  }, [stagedFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const tentarDeNovo = (id: string) => setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'pending', progress: 0, error: undefined } : f))
  const cancelUpload = (id: string) => setStagedFiles(prev => prev.filter(f => f.id !== id))

  // ── Ações nos itens ──
  const confirmarExclusao = async () => {
    if (!excluir) return
    setExcluindo(true)
    excluir.forEach(i => setDeletingIds(prev => new Set(prev).add(i.id)))
    await Promise.all(excluir.map(i => apiPost({ action: i.type === 'folder' ? 'deleteFolder' : 'delete', id: i.id, sig: i.sig })))
    setDeletingIds(new Set()); setExcluir(null); setExcluindo(false)
    setSelectedIds(new Set()); setSelectionMode(false); loadItems(currentPath, false)
  }

  /** Cor e favorito: atualiza na hora e grava no Drive em seguida. */
  const marcar = async (item: DriveItem, mudanca: { cor?: Cor | null; favorito?: boolean }) => {
    setItems(prev => prev.map(i => i.id === item.id ? {
      ...i,
      ...('cor' in mudanca ? { cor: mudanca.cor ?? undefined } : {}),
      ...('favorito' in mudanca ? { favorito: mudanca.favorito || undefined } : {}),
    } : i))
    const r = await apiPost({ action: 'marcar', id: item.id, sig: item.sig, ...mudanca }).catch(() => ({ success: false }))
    if (!r.success) loadItems(currentPathRef.current, false)
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
    alvo.forEach(i => setMovingIds(prev => new Set(prev).add(i.id)))
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

  const abrirRenomear = (item: DriveItem) => { setSelectedItem(item); setRenameValue(item.name); setShowRenameModal(true) }
  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return
    if (renameValue.includes('/')) return
    await apiPost({ action: 'rename', id: selectedItem.id, sig: selectedItem.sig, name: renameValue.trim() })
    setShowRenameModal(false); setSelectedItem(null); setRenameValue('')
    loadItems(currentPath, false)
  }

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
    if (item.type === 'folder') abrirPasta(juntar(currentPath, item.name))
    else if (isImage(item.mimeType, item.name)) setPreviewFile(item)
    else if (canPreview(item.mimeType, item.name)) setEmbedFile(item)
    else window.open(getDownloadUrl(item.id), '_blank')
  }

  const abrirNovaPasta = () => { setNewFolderName(''); setFolderNameError(''); setSidebarOpen(false); setShowNewFolderModal(true) }
  const alternarSelecao = () => { setSelectionMode(!selectionMode); setSelectedIds(new Set()) }
  const mudarOrdem = (o: Ordem) => { setOrdem(o); gravarPreferencia('aura_ordem', o) }
  const mudarVista = (v: Vista) => { setVista(v); gravarPreferencia('aura_vista', v) }

  // ── Lista visível: busca, favoritos primeiro, depois a ordem escolhida ──
  const ordenar = useCallback((a: DriveItem, b: DriveItem) => {
    if (!!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1
    if (ordem === 'recentes') return (b.modifiedAt || '').localeCompare(a.modifiedAt || '')
    if (ordem === 'tamanho') return (b.size || 0) - (a.size || 0)
    return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
  }, [ordem])
  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim())
    return termo ? items.filter(i => semAcento(i.name).includes(termo)) : items
  }, [items, busca])
  const folders = useMemo(() => visiveis.filter(i => i.type === 'folder').sort(ordenar), [visiveis, ordenar])
  const files = useMemo(() => visiveis.filter(i => i.type === 'file').sort(ordenar), [visiveis, ordenar])
  const imagens = useMemo(() => files.filter(f => isImage(f.mimeType, f.name)), [files])
  const pastaAtual = breadcrumbs[breadcrumbs.length - 1]?.name ?? 'Meus arquivos'
  const enviandoAgora = stagedFiles.filter(f => f.status === 'uploading' || f.status === 'pending').length
  const totalPasta = { pastas: items.filter(i => i.type === 'folder').length, arquivos: items.filter(i => i.type === 'file').length }

  // Teclado na visualização: Esc fecha, setas passam as imagens.
  useEffect(() => {
    if (!previewFile && !embedFile) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPreviewFile(null); setEmbedFile(null) }
      if (previewFile && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const i = imagens.findIndex(f => f.id === previewFile.id)
        const prox = imagens[(i + (e.key === 'ArrowRight' ? 1 : -1) + imagens.length) % imagens.length]
        if (prox) setPreviewFile(prox)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [previewFile, embedFile, imagens])
  const passarImagem = (passo: number) => {
    if (!previewFile) return
    const i = imagens.findIndex(f => f.id === previewFile.id)
    setPreviewFile(imagens[(i + passo + imagens.length) % imagens.length] ?? previewFile)
  }

  const ItemMenu = ({ item }: { item: DriveItem }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="btn btn-ghost size-8" aria-label={`Ações de ${item.name}`} onClick={e => e.stopPropagation()}>
          <MoreHorizontal className="size-4"/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuClasse} onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => marcar(item, { favorito: !item.favorito })}>
          <Star className={cn('size-4', item.favorito && 'fill-current text-warning')}/> {item.favorito ? 'Tirar dos favoritos' : 'Favoritar'}
        </DropdownMenuItem>
        {item.type === 'file' ? (
          <DropdownMenuItem asChild><a href={getDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer"><Download className="size-4"/> Baixar</a></DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => handleDownloadFolder(item)}><Download className="size-4"/> Baixar como ZIP</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openMoveModal(item)}><Move className="size-4"/> Mover para...</DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrirRenomear(item)}><Pencil className="size-4"/> Renomear</DropdownMenuItem>
        {item.type === 'folder' && (
          <>
            <DropdownMenuSeparator className="bg-line"/>
            <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-xs font-medium text-text-3"><Palette className="size-3.5"/> Cor da pasta</DropdownMenuLabel>
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-0.5">
              <DropdownMenuItem onClick={() => marcar(item, { cor: null })} aria-label="Sem cor" title="Sem cor"
                className={cn('size-6 justify-center rounded-full border border-line-strong p-0', !item.cor && 'ring-2 ring-text ring-offset-2 ring-offset-[var(--surface-solid)]')}>
                <X className="size-3 text-text-3"/>
              </DropdownMenuItem>
              {CORES.map(c => (
                <DropdownMenuItem key={c.id} onClick={() => marcar(item, { cor: c.id })} aria-label={c.nome} title={c.nome}
                  className={cn('size-6 rounded-full p-0 focus:bg-transparent', item.cor === c.id && 'ring-2 ring-text ring-offset-2 ring-offset-[var(--surface-solid)]')}
                  style={{ background: c.valor }}/>
              ))}
            </div>
          </>
        )}
        <DropdownMenuSeparator className="bg-line"/>
        <DropdownMenuItem onClick={() => setExcluir([item])} className="text-danger focus:text-danger"><Trash2 className="size-4 text-danger"/> Excluir</DropdownMenuItem>
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

  const Favorito = ({ item, className }: { item: DriveItem; className?: string }) =>
    item.favorito ? <Star className={cn('size-3.5 shrink-0 fill-current text-warning', className)} aria-label="Favorito"/> : null

  const ocupado = (item: DriveItem) => deletingIds.has(item.id) || movingIds.has(item.id)
  const estadoCard = (item: DriveItem) => cn(
    ocupado(item) && 'pointer-events-none opacity-40',
    selectionMode && selectedIds.has(item.id) && '!border-brand !bg-brand-soft',
    dragOverFolder === item.id && '!border-brand !bg-brand-soft',
    draggingItemId === item.id && 'opacity-50',
  )
  const alvoDePasta = (item: DriveItem) => ({
    onDragOver: (e: React.DragEvent) => handleFolderDragOver(e, item.id),
    onDragLeave: handleFolderDragLeave,
    onDrop: (e: React.DragEvent) => handleFolderDrop(e, item),
  })

  const CartaoPasta = ({ item }: { item: DriveItem }) => (
    <div
      draggable={!selectionMode}
      onDragStart={e => handleItemDragStart(e, item)}
      onDragEnd={() => setDraggingItemId(null)}
      {...alvoDePasta(item)}
      style={estiloCor(item.cor)}
      className={cn('panel hover-lift group relative flex items-center gap-3 py-2.5 pl-3 pr-2', estadoCard(item))}
    >
      {selectionMode && <Marcador item={item}/>}
      <button onClick={() => abrirItem(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="selo size-10 shrink-0"><IconePasta cor={item.cor}/></span>
        <span className="min-w-0 flex-1 truncate text-base font-medium" title={item.name}>{item.name}</span>
        <Favorito item={item}/>
      </button>
      {ocupado(item)
        ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-text"/>
        : !selectionMode && <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100"><ItemMenu item={item}/></div>}
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
          <img src={getProxyUrl(item)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
        ) : (
          <span className="flex flex-col items-center gap-2">
            <FileIcon type={getFileType(item.name)} size={30}/>
            <span className="rounded-md bg-surface px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-text-3">{getExt(item.name).toUpperCase() || 'ARQUIVO'}</span>
          </span>
        )}
        {ocupado(item) && <span className="absolute inset-0 grid place-items-center bg-black/40"><Loader2 className="size-5 animate-spin text-brand-text"/></span>}
        {item.favorito && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/55 backdrop-blur"><Star className="size-3.5 fill-current text-warning"/></span>}
      </button>
      {selectionMode && <div className="absolute left-2.5 top-2.5"><Marcador item={item}/></div>}
      <div className="flex items-center gap-1 py-2 pl-3 pr-1.5">
        <button onClick={() => abrirItem(item)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
          <p className="truncate text-xs text-text-3 tabular">{[item.size ? formatFileSize(item.size) : '', dataCurta(item.modifiedAt)].filter(Boolean).join(' · ')}</p>
        </button>
        {!selectionMode && <ItemMenu item={item}/>}
      </div>
    </div>
  )

  /** Linha da vista em lista (computador) e do celular. */
  const Linha = ({ item, compacta }: { item: DriveItem; compacta?: boolean }) => (
    <div
      draggable={!selectionMode && !compacta}
      onDragStart={e => handleItemDragStart(e, item)}
      onDragEnd={() => setDraggingItemId(null)}
      {...(item.type === 'folder' ? alvoDePasta(item) : {})}
      className={cn('group flex items-center gap-3 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 md:px-4',
        selectionMode && selectedIds.has(item.id) ? 'bg-brand-soft' : 'hover:bg-surface-hover active:bg-surface-hover',
        dragOverFolder === item.id && 'bg-brand-soft', ocupado(item) && 'opacity-40')}>
      {selectionMode && <Marcador item={item}/>}
      <button onClick={() => abrirItem(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="selo size-10 shrink-0 overflow-hidden" style={item.type === 'folder' ? estiloCor(item.cor) : undefined}>
          {item.type === 'folder' ? <IconePasta cor={item.cor} size={20}/> : isImage(item.mimeType, item.name)
            ? <img src={getProxyUrl(item)} alt="" loading="lazy" className="size-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
            : <FileIcon type={getFileType(item.name)} size={19}/>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5"><span className="truncate text-base font-medium">{item.name}</span><Favorito item={item}/></span>
          <span className="block text-xs text-text-3 tabular md:hidden">{item.type === 'folder' ? 'Pasta' : [item.size ? formatFileSize(item.size) : '', dataCurta(item.modifiedAt)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="hidden w-32 shrink-0 text-sm text-text-3 tabular md:block">{dataCurta(item.modifiedAt)}</span>
        <span className="hidden w-24 shrink-0 text-right text-sm text-text-3 tabular md:block">{item.type === 'folder' ? '—' : item.size ? formatFileSize(item.size) : ''}</span>
      </button>
      {ocupado(item) ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-text"/> : !selectionMode && (
        <div className="flex shrink-0 items-center">
          {item.type === 'file' ? (
            <a href={getDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost size-9 md:opacity-0 md:group-hover:opacity-100" aria-label={`Baixar ${item.name}`}>
              <Download className="size-[18px]"/>
            </a>
          ) : (
            <button onClick={() => handleDownloadFolder(item)} className="btn btn-ghost size-9 md:opacity-0 md:group-hover:opacity-100" aria-label={`Baixar ${item.name} como ZIP`}>
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
            <button key={crumb.path || 'raiz'} onClick={() => !atual && abrirPasta(crumb.path)}
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

  const rotuloOrdem: Record<Ordem, string> = { nome: 'Nome', recentes: 'Mais recentes', tamanho: 'Tamanho' }

  return (
    <div className="relative min-h-dvh" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
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

      {/* Soltar arquivos em qualquer lugar da tela */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[45] flex justify-center px-6">
          <div className="glass flex items-center gap-3 rounded-full border border-brand px-5 py-3 shadow-[var(--shadow-pop)]">
            <span className="grid size-9 place-items-center rounded-full bg-brand text-on-brand"><UploadCloud className="size-5"/></span>
            <p className="text-base"><span className="font-semibold">Solte para enviar</span> <span className="text-text-2">em {pastaAtual}, ou em cima de uma pasta.</span></p>
          </div>
        </div>
      )}

      <div className={cn('relative z-[1] transition-[box-shadow] lg:pl-[248px]', isDragging && 'shadow-[inset_0_0_0_2px_var(--brand)]')}>
        <header className="glass sticky top-0 z-10 flex h-16 items-center gap-2 border-b border-line px-3 sm:px-6">
          <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" className="btn btn-ghost size-9 lg:hidden"><Menu className="size-[18px]"/></button>
          {pastaAcima ? (
            <button onClick={voltar} className="btn btn-ghost h-9 shrink-0 px-2.5 text-base" aria-label={`Voltar para ${pastaAcima.name}`} title={`Voltar para ${pastaAcima.name}`}>
              <ArrowLeft className="size-[18px]"/> <span className="max-sm:hidden">Voltar</span>
            </button>
          ) : null}
          {/* No celular, a pasta inicial mostra a logo; o caminho aparece só dentro das subpastas. */}
          {!pastaAcima && <div className="flex-1 md:hidden"><Logo height={22}/></div>}
          <nav aria-label="Caminho" className={cn('min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-base [scrollbar-width:none]', pastaAcima ? 'flex' : 'hidden md:flex')}>
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path || 'raiz'} className="flex shrink-0 items-center gap-1">
                {index > 0 && <ChevronRight className="size-3.5 text-text-3"/>}
                <button onClick={() => index < breadcrumbs.length - 1 && abrirPasta(crumb.path)}
                  className={cn('rounded-md px-1.5 py-1 transition-colors', index === breadcrumbs.length - 1 ? 'font-medium text-text' : 'text-text-3 hover:bg-surface-hover hover:text-text')}>
                  {crumb.name}
                </button>
              </div>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => loadItems(currentPath, false)} aria-label="Atualizar" title="Atualizar" className="btn btn-ghost size-9"><RefreshCw className="size-4"/></button>
            <button onClick={abrirNovaPasta} className="btn btn-secondary h-9 px-3.5 text-base max-lg:hidden"><FolderPlus className="size-4"/> Nova pasta</button>
            <label htmlFor="enviar-pasta" role="button" className="btn btn-secondary h-9 px-3.5 text-base max-md:hidden"><FolderUp className="size-4"/> Enviar pasta</label>
            <label htmlFor="enviar-arquivos" role="button" className="btn btn-primary h-9 px-3.5 text-base max-md:hidden"><Upload className="size-4"/> Enviar arquivos</label>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] px-4 pb-32 pt-7 sm:px-6 md:pb-16 lg:px-8">
          <div className="mb-5 flex flex-col gap-1">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.02em]">{pastaAtual}</h1>
            <p className="text-base text-text-3">
              {initialLoading ? 'Carregando...' : items.length ? `${plural(totalPasta.pastas, 'pasta', 'pastas')} · ${plural(totalPasta.arquivos, 'arquivo', 'arquivos')}` : 'Pasta vazia'}
            </p>
          </div>

          {/* FERRAMENTAS: busca, ordem, vista, seleção */}
          {!initialLoading && items.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-[1_1_220px] sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3"/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={`Buscar em ${pastaAtual}`} aria-label="Buscar nesta pasta"
                  className="campo h-9 pl-9 pr-9"/>
                {busca && <button onClick={() => setBusca('')} aria-label="Limpar busca" className="btn btn-ghost absolute right-0.5 top-0.5 size-8"><X className="size-4"/></button>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="btn btn-secondary h-9 px-3 text-base"><ArrowDownUp className="size-4"/> <span className="max-sm:hidden">{rotuloOrdem[ordem]}</span></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={menuClasse}>
                  <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-text-3">Ordenar por</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={ordem} onValueChange={v => mudarOrdem(v as Ordem)}>
                    {(Object.keys(rotuloOrdem) as Ordem[]).map(o => <DropdownMenuRadioItem key={o} value={o}>{rotuloOrdem[o]}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5 max-md:hidden" role="group" aria-label="Vista">
                {([['grade', LayoutGrid, 'Grade'], ['lista', List, 'Lista']] as const).map(([v, Icone, nome]) => (
                  <button key={v} onClick={() => mudarVista(v)} aria-pressed={vista === v} aria-label={nome} title={nome}
                    className={cn('btn size-8 rounded-[8px]', vista === v ? 'bg-surface-hover text-text shadow-[inset_0_0_0_1px_var(--line)]' : 'text-text-3 hover:text-text')}>
                    <Icone className="size-4"/>
                  </button>
                ))}
              </div>
              <button onClick={alternarSelecao} className={cn('btn h-9 px-3 text-base max-md:hidden', selectionMode ? 'btn-primary' : 'btn-secondary')}>
                <CheckSquare className="size-4"/> {selectionMode ? 'Cancelar' : 'Selecionar'}
              </button>
            </div>
          )}

          {/* BARRA DE SELEÇÃO */}
          {selectionMode && (
            <div className="glass sticky top-[76px] z-[5] mb-5 flex flex-wrap items-center gap-2 rounded-[14px] border border-line px-3 py-2.5 shadow-[var(--shadow-pop)]">
              <span className="px-1 text-base font-medium tabular">{plural(selectedIds.size, 'selecionado', 'selecionados')}</span>
              <button onClick={() => setSelectedIds(new Set(visiveis.map(i => i.id)))} className="btn btn-ghost h-8 px-2.5 text-sm">Todos</button>
              <button onClick={() => setSelectedIds(new Set())} className="btn btn-ghost h-8 px-2.5 text-sm">Limpar</button>
              <span className="flex-1"/>
              {selectedIds.size > 0 && (
                <>
                  <button onClick={() => openMoveModal()} className="btn btn-secondary h-8 px-3 text-sm"><Move className="size-4"/> Mover</button>
                  <button onClick={downloadSelected} className="btn btn-secondary h-8 px-3 text-sm"><Download className="size-4"/> Baixar</button>
                  <button onClick={() => setExcluir(items.filter(i => selectedIds.has(i.id)))} className="btn btn-danger h-8 px-3 text-sm"><Trash2 className="size-4"/> Excluir</button>
                </>
              )}
              <button onClick={alternarSelecao} aria-label="Sair da seleção" className="btn btn-ghost size-8 md:hidden"><X className="size-4"/></button>
            </div>
          )}

          {/* ENVIOS */}
          {stagedFiles.length > 0 && (
            <section className="panel mb-6 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  {enviandoAgora > 0 && <Loader2 className="size-4 animate-spin text-brand-text"/>}
                  {enviandoAgora > 0 ? `Enviando ${plural(enviandoAgora, 'arquivo', 'arquivos')}` : 'Envios'}
                </h2>
                {enviandoAgora === 0 && <button onClick={() => setStagedFiles([])} className="btn btn-ghost h-8 px-2.5 text-sm">Limpar</button>}
              </div>
              <ul className="max-h-72 overflow-y-auto">
                {stagedFiles.map(s => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="selo size-9 shrink-0"><FileIcon type={getFileType(s.file.name)} size={18}/></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base">{s.file.name}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className="text-text-3 tabular">{formatFileSize(s.file.size)}</span>
                        {s.status === 'pending' && <span className="text-text-3">Na fila</span>}
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
                    {s.status === 'error' && s.error !== 'É uma pasta. Use "Enviar pasta".' && (
                      <button onClick={() => tentarDeNovo(s.id)} className="btn btn-secondary h-8 px-2.5 text-sm">Tentar de novo</button>
                    )}
                    {(s.status === 'error' || s.status === 'pending') && (
                      <button onClick={() => cancelUpload(s.id)} className="btn btn-ghost size-8" aria-label="Tirar da fila"><X className="size-4"/></button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {initialLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Carregando">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="panel h-[62px] animate-pulse"/>)}
            </div>
          ) : items.length === 0 ? (
            <button onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[300px] w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-12 text-center transition-colors hover:border-brand hover:bg-surface">
              <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-text"><UploadCloud className="size-7" aria-hidden/></span>
              <span className="text-md font-medium">Esta pasta está vazia</span>
              <span className="text-sm text-text-3">Toque para escolher arquivos ou arraste até aqui.</span>
            </button>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface text-text-3"><Search className="size-5"/></span>
              <p className="text-md font-medium">Nada com “{busca}” nesta pasta</p>
              <button onClick={() => setBusca('')} className="btn btn-ghost h-8 px-3 text-sm">Limpar busca</button>
            </div>
          ) : (
            <>
              {/* Computador em grade */}
              {vista === 'grade' && (
                <div className="max-md:hidden">
                  {folders.length > 0 && (
                    <section className="mb-8">
                      <h2 className="mb-3 text-sm font-medium text-text-3">Pastas</h2>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {folders.map(item => <CartaoPasta key={item.id} item={item}/>)}
                      </div>
                    </section>
                  )}
                  {files.length > 0 && (
                    <section>
                      <h2 className="mb-3 text-sm font-medium text-text-3">Arquivos</h2>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {files.map(item => <CartaoArquivo key={item.id} item={item}/>)}
                      </div>
                    </section>
                  )}
                  <p className="mt-8 text-center text-sm text-text-3">Dica: arraste arquivos para qualquer lugar da tela para enviar, ou para cima de uma pasta para enviar direto nela.</p>
                </div>
              )}
              {/* Computador em lista */}
              {vista === 'lista' && (
                <div className="panel overflow-hidden max-md:hidden">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs font-medium text-text-3">
                    {selectionMode && <span className="w-5"/>}
                    <span className="flex-1 pl-[52px]">Nome</span>
                    <span className="w-32">Modificado</span>
                    <span className="w-24 text-right">Tamanho</span>
                    <span className="w-[68px]"/>
                  </div>
                  {[...folders, ...files].map(item => <Linha key={item.id} item={item}/>)}
                </div>
              )}
              {/* Celular */}
              <div className="panel overflow-hidden md:hidden">
                {[...folders, ...files].map(item => <Linha key={item.id} item={item} compacta/>)}
              </div>
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
          {imagens.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); passarImagem(-1) }} aria-label="Imagem anterior" className="btn btn-secondary absolute left-3 top-1/2 z-10 size-11 -translate-y-1/2 rounded-full"><ChevronLeft className="size-5"/></button>
              <button onClick={e => { e.stopPropagation(); passarImagem(1) }} aria-label="Próxima imagem" className="btn btn-secondary absolute right-3 top-1/2 z-10 size-11 -translate-y-1/2 rounded-full"><ChevronRight className="size-5"/></button>
            </>
          )}
          <div className="flex max-h-[95vh] max-w-[95vw] flex-col items-center gap-4 p-4" onClick={e => e.stopPropagation()}>
            <img key={previewFile.id} src={getProxyUrl(previewFile)} alt={previewFile.name} className="max-h-[80vh] max-w-full rounded-[var(--radius-card)] object-contain"/>
            <div className="flex items-center gap-3">
              <p className="max-w-[200px] truncate text-base md:max-w-[420px]">{previewFile.name}</p>
              {imagens.length > 1 && <span className="text-sm text-text-3 tabular">{imagens.findIndex(f => f.id === previewFile.id) + 1} de {imagens.length}</span>}
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
      <Dialog open={!!excluir} onOpenChange={aberto => !aberto && !excluindo && setExcluir(null)}>
        <DialogContent className={dialogo}>
          <DialogHeader>
            <DialogTitle className="text-xl">
              {excluir?.length === 1 ? `Excluir ${excluir[0].type === 'folder' ? 'a pasta' : 'o arquivo'}?` : `Excluir ${plural(excluir?.length ?? 0, 'item', 'itens')}?`}
            </DialogTitle>
            <DialogDescription className="text-text-2">
              {excluir?.length === 1 ? <><span className="font-medium text-text">{excluir[0].name}</span>{excluir[0].type === 'folder' ? ' e tudo o que estiver dentro dela' : ''} vai para a lixeira do Drive da +Aura.</> : 'Os itens selecionados vão para a lixeira do Drive da +Aura.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button onClick={() => setExcluir(null)} disabled={excluindo} className="btn btn-ghost h-9 px-3.5 text-base">Cancelar</button>
            <button onClick={confirmarExclusao} disabled={excluindo} className="btn h-9 bg-danger px-3.5 text-base text-white hover:brightness-110">
              {excluindo ? <Loader2 className="size-4 animate-spin"/> : <Trash2 className="size-4"/>} {excluindo ? 'Excluindo...' : 'Excluir'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            className="campo h-11 px-3" placeholder="Novo nome" aria-invalid={renameValue.includes('/')}
            onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus
            onFocus={e => { const ponto = e.target.value.lastIndexOf('.'); if (selectedItem?.type === 'file' && ponto > 0) e.target.setSelectionRange(0, ponto) }}/>
          {renameValue.includes('/') && <p className="-mt-2 text-xs text-danger">O nome não pode ter barra (/).</p>}
          <DialogFooter className="gap-2">
            <button onClick={() => setShowRenameModal(false)} className="btn btn-ghost h-9 px-3.5 text-base">Cancelar</button>
            <button onClick={handleRename} disabled={!renameValue.trim() || renameValue.includes('/')} className="btn btn-primary h-9 px-3.5 text-base">Salvar</button>
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
            <button onClick={handleMoveSelected} disabled={moveLoading || moveFolderPath === currentPath} className="btn btn-primary h-9 px-3.5 text-base">
              {moveLoading && <Loader2 className="size-4 animate-spin"/>} {moveLoading ? 'Movendo...' : 'Mover aqui'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
