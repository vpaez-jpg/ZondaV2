'use client'

import { useState, useTransition, useRef, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Upload, TrendingUp, Clock, CheckCircle2, Scale,
  ChevronDown, ChevronUp, Trash2, Pencil, Mic, MicOff, Sparkles,
  FileSpreadsheet, DollarSign, Users, GripVertical, Percent,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { crearCobro, actualizarCobro, eliminarCobro } from './actions'
import type { Cobro, CobroPayload, Moneda, EstadoCobro, ProbabilidadLitigio } from '@/lib/cobros-types'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Perfil { id: string; nombre: string; logo_url: string | null; whatsapp_link: string | null }
interface ClienteSimple { id: string; nombre: string }
interface Props { perfil: Perfil; clientes: ClienteSimple[]; cobros: Cobro[] }

interface ClienteGrupo {
  key: string
  nombre: string
  clienteId: string | null
  cobros: Cobro[]
}

type SortMode = 'reciente' | 'nombre' | 'monto' | 'pendientes' | 'litigios' | 'manual'

const AREAS_LEGALES = [
  'Civil',
  'Comercial',
  'Laboral',
  'Penal',
  'Familia',
  'Societario',
  'Tributario / Fiscal',
  'Administrativo',
  'Inmobiliario',
  'Propiedad Intelectual / Marcas',
  'Internacional',
  'Ambiental',
  'Seguros y Responsabilidad Civil',
  'Concursal / Insolvencia',
  'Otra',
] as const

const PREFS_KEY = 'zonda_cobros_prefs_v1'

// ── Helpers ───────────────────────────────────────────────────────────────────
function ars(n: number) { return '$ ' + Math.round(n).toLocaleString('es-AR') }
function usd(n: number) { return 'US$ ' + Math.round(n).toLocaleString('es-AR') }
function fmt(n: number, moneda: Moneda) { return moneda === 'USD' ? usd(n) : ars(n) }

function agruparPorCliente(cobros: Cobro[]): ClienteGrupo[] {
  const map = new Map<string, ClienteGrupo>()
  for (const c of cobros) {
    const key = c.cliente_id ?? `nombre:${c.cliente_nombre ?? 'sin-cliente'}`
    if (!map.has(key)) map.set(key, { key, nombre: c.cliente_nombre ?? 'Sin cliente', clienteId: c.cliente_id, cobros: [] })
    map.get(key)!.cobros.push(c)
  }
  return Array.from(map.values())
}

const ESTADO_BADGE: Record<EstadoCobro, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente',  className: 'badge-pendiente' },
  parcial:   { label: 'Parcial',    className: 'badge-parcial' },
  cobrado:   { label: 'Cobrado',    className: 'badge-cobrado' },
  cancelado: { label: 'Cancelado',  className: 'badge-cancelado' },
}

const PROB_LABEL: Record<ProbabilidadLitigio, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

function formVacio(): Partial<CobroPayload> {
  return {
    tipo: 'directo', concepto: '', cliente_nombre: '', cliente_id: null,
    moneda: 'ARS', monto_total: undefined as unknown as number,
    forma_pago: 'unico', num_cuotas: null, monto_cuota: null,
    con_interes: false, tasa_interes: null, cuotas_pagadas: 0,
    estado: 'pendiente', monto_cobrado: 0, fecha_vencimiento: null,
    parte_contraria: null, monto_litigio: null, porcentaje_acordado: null,
    expectativa_cobro: null, probabilidad: null, etapa_litigio: null,
    fecha_estimada_resolucion: null, notas: null, area: null,
  }
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CobrosShell({ perfil, clientes, cobros: cobrosInit }: Props) {
  const router = useRouter()
  const [cobros, setCobros]                   = useState<Cobro[]>(cobrosInit)
  const [dialogMode, setDialogMode]           = useState<'selector' | 'manual' | 'asistente' | 'importar' | null>(null)
  const [form, setForm]                       = useState<Partial<CobroPayload>>(formVacio())
  const [editingCobro, setEditingCobro]       = useState<Cobro | null>(null)
  const [isPending, startTransition]          = useTransition()
  const [error, setError]                     = useState('')
  const [expandedKey, setExpandedKey]         = useState<string | null>(null)

  // — Filtros, drag y persistencia
  const [sortBy, setSortBy]                   = useState<SortMode>('reciente')
  const [ordenKeys, setOrdenKeys]             = useState<string[] | null>(null)
  const [areaFiltro, setAreaFiltro]           = useState<string>('')
  const [savedConfirm, setSavedConfirm]       = useState(false)
  const [dragIdx, setDragIdx]                 = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx]         = useState<number | null>(null)

  // Cargar preferencias guardadas al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (!raw) return
      const prefs = JSON.parse(raw)
      if (prefs.sortBy) setSortBy(prefs.sortBy)
      if (prefs.ordenKeys) { setOrdenKeys(prefs.ordenKeys); setSortBy('manual') }
      if (prefs.areaFiltro) setAreaFiltro(prefs.areaFiltro)
    } catch { /* sin prefs guardadas */ }
  }, [])

  // — Asistente IA
  const [textoAsistente, setTextoAsistente]   = useState('')
  const [procesando, setProcesando]           = useState(false)
  const [grabando, setGrabando]               = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef                        = useRef<any>(null)

  // — Importar
  const [contenidoImport, setContenidoImport] = useState('')
  const [importando, setImportando]           = useState(false)
  const [importPreview, setImportPreview]     = useState<Partial<CobroPayload>[]>([])
  const [nombreArchivo, setNombreArchivo]     = useState('')
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  // ── Métricas ────────────────────────────────────────────────────────────────
  const grupos = useMemo(() => agruparPorCliente(cobros), [cobros])
  const directos  = cobros.filter(c => c.tipo === 'directo')
  const litigios  = cobros.filter(c => c.tipo === 'litigio')
  const numClientes    = grupos.length
  const cobradoARS     = directos.filter(c => c.moneda === 'ARS').reduce((s, c) => s + c.monto_cobrado, 0)
  const pendienteARS   = directos.filter(c => c.moneda === 'ARS' && c.estado !== 'cobrado' && c.estado !== 'cancelado').reduce((s, c) => s + c.monto_total - c.monto_cobrado, 0)
  const pendienteUSD   = directos.filter(c => c.moneda === 'USD' && c.estado !== 'cobrado' && c.estado !== 'cancelado').reduce((s, c) => s + c.monto_total - c.monto_cobrado, 0)
  const litigiosActivos  = litigios.filter(c => c.estado !== 'cancelado')
  const litigiosCobrados = litigios.filter(c => c.estado === 'cobrado')
  const pctLitigios    = litigiosActivos.length > 0 ? Math.round(litigiosCobrados.length / litigiosActivos.length * 100) : null
  const expectativaTotal = litigiosActivos.reduce((s, c) => s + (c.expectativa_cobro ?? 0), 0)

  // ── Grupos ordenados y filtrados ─────────────────────────────────────────────
  const displayedGrupos = useMemo(() => {
    // Filtro por área
    const gruposFiltrados = areaFiltro
      ? grupos.filter(g => g.cobros.some(c => c.area === areaFiltro))
      : grupos

    if (sortBy === 'manual' && ordenKeys) {
      const m = new Map(gruposFiltrados.map(g => [g.key, g]))
      return [...ordenKeys.map(k => m.get(k)).filter(Boolean) as ClienteGrupo[], ...gruposFiltrados.filter(g => !ordenKeys.includes(g.key))]
    }
    const s = [...gruposFiltrados]

    switch (sortBy) {
      case 'nombre':
        s.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); break
      case 'reciente':
        s.sort((a, b) => Math.max(...b.cobros.map(c => new Date(c.created_at).getTime())) - Math.max(...a.cobros.map(c => new Date(c.created_at).getTime()))); break
      case 'monto':
        s.sort((a, b) => {
          const pend = (g: ClienteGrupo) => g.cobros.filter(c => c.tipo === 'directo' && c.moneda === 'ARS' && c.estado !== 'cobrado' && c.estado !== 'cancelado').reduce((s, c) => s + c.monto_total - c.monto_cobrado, 0)
          return pend(b) - pend(a)
        }); break
      case 'pendientes':
        s.sort((a, b) => (a.cobros.some(c => c.estado === 'pendiente') ? 0 : 1) - (b.cobros.some(c => c.estado === 'pendiente') ? 0 : 1)); break
      case 'litigios':
        s.sort((a, b) => b.cobros.filter(c => c.tipo === 'litigio').length - a.cobros.filter(c => c.tipo === 'litigio').length); break
    }
    return s
  }, [grupos, sortBy, ordenKeys, areaFiltro])

  // ── Persistencia ─────────────────────────────────────────────────────────────
  function handleGuardarOrden() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy, ordenKeys, areaFiltro }))
    setSavedConfirm(true)
    setTimeout(() => setSavedConfirm(false), 2500)
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  function openCreate(preset?: { id?: string; nombre?: string }) {
    setEditingCobro(null)
    setForm({ ...formVacio(), ...(preset ? { cliente_id: preset.id ?? null, cliente_nombre: preset.nombre ?? '' } : {}) })
    setError(''); setDialogMode('selector')
  }

  function openEdit(cobro: Cobro) {
    setEditingCobro(cobro)
    setForm({
      tipo: cobro.tipo, concepto: cobro.concepto, cliente_nombre: cobro.cliente_nombre,
      cliente_id: cobro.cliente_id, moneda: cobro.moneda, monto_total: cobro.monto_total,
      forma_pago: cobro.forma_pago, num_cuotas: cobro.num_cuotas, monto_cuota: cobro.monto_cuota,
      con_interes: cobro.con_interes, tasa_interes: cobro.tasa_interes, cuotas_pagadas: cobro.cuotas_pagadas,
      estado: cobro.estado, monto_cobrado: cobro.monto_cobrado, fecha_vencimiento: cobro.fecha_vencimiento,
      parte_contraria: cobro.parte_contraria, monto_litigio: cobro.monto_litigio,
      porcentaje_acordado: cobro.porcentaje_acordado, expectativa_cobro: cobro.expectativa_cobro,
      probabilidad: cobro.probabilidad, etapa_litigio: cobro.etapa_litigio,
      fecha_estimada_resolucion: cobro.fecha_estimada_resolucion, notas: cobro.notas, area: cobro.area,
    })
    setError(''); setDialogMode('manual')
  }

  function closeDialog() {
    setDialogMode(null); setError('')
    setTextoAsistente(''); setImportPreview([]); setEditingCobro(null)
  }

  function handleFormChange(field: keyof CobroPayload, value: unknown) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if ((field === 'monto_litigio' || field === 'porcentaje_acordado') && next.tipo === 'litigio') {
        const ml = Number(next.monto_litigio) || 0
        const pct = Number(next.porcentaje_acordado) || 0
        next.expectativa_cobro = ml > 0 && pct > 0 ? Math.round(ml * pct / 100) : null
      }
      if ((field === 'monto_total' || field === 'num_cuotas') && next.forma_pago === 'cuotas') {
        const mt = Number(next.monto_total) || 0
        const nc = Number(next.num_cuotas) || 1
        next.monto_cuota = mt > 0 ? Math.round(mt / nc) : null
      }
      return next
    })
  }

  function handleSubmitManual(payload = form) {
    if (!payload.concepto?.trim()) { setError('El concepto es obligatorio.'); return }
    if (!payload.monto_total && payload.tipo === 'directo') { setError('El monto es obligatorio.'); return }
    if (payload.tipo === 'litigio' && !payload.monto_litigio) { setError('El monto del litigio es obligatorio.'); return }
    startTransition(async () => {
      if (editingCobro) {
        const result = await actualizarCobro(editingCobro.id, payload as CobroPayload)
        if (result.error) { setError(result.error); return }
        setCobros(prev => prev.map(c => c.id === editingCobro.id ? { ...c, ...(payload as CobroPayload) } : c))
      } else {
        const result = await crearCobro(payload as CobroPayload)
        if (result.error) { setError(result.error); return }
        router.refresh()
      }
      closeDialog()
    })
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este registro?')) return
    const result = await eliminarCobro(id)
    if (result.error) alert(result.error)
    else setCobros(prev => prev.filter(c => c.id !== id))
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  function handleDragStart(idx: number) { setDragIdx(idx) }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== idx) setDragOverIdx(idx)
  }
  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const newOrder = displayedGrupos.map(g => g.key)
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    setOrdenKeys(newOrder); setSortBy('manual')
    setDragIdx(null); setDragOverIdx(null)
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null) }

  // ── Asistente IA ─────────────────────────────────────────────────────────────
  function toggleGrabacion() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SRApi = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!SRApi) return
    if (grabando) { recognitionRef.current?.stop(); setGrabando(false); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SRApi() as any
    rec.lang = 'es-AR'; rec.continuous = true; rec.interimResults = true
    rec.onstart = () => setGrabando(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setTextoAsistente(t) }
    rec.onend = () => setGrabando(false)
    recognitionRef.current = rec; rec.start()
  }

  async function handleProcesarAsistente() {
    if (!textoAsistente.trim()) return
    setProcesando(true); setError('')
    try {
      const res = await fetch('/api/procesar-cobro-natural', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: textoAsistente }) })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setForm({ ...formVacio(), ...data.cobro }); setDialogMode('manual')
    } catch (e) { setError(String(e)) }
    finally { setProcesando(false) }
  }

  // ── Importar ─────────────────────────────────────────────────────────────────
  async function excelToText(file: File): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    if (!win.XLSX) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload = () => resolve(); s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel'))
        document.head.appendChild(s)
      })
    }
    const XLSX = win.XLSX
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const texts: string[] = []
    wb.SheetNames.forEach((name: string) => {
      const csv: string = XLSX.utils.sheet_to_csv(wb.Sheets[name])
      if (csv.trim()) texts.push(`=== Hoja: ${name} ===\n${csv}`)
    })
    return texts.join('\n\n')
  }

  async function pdfToText(file: File): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    if (!win.pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        s.onload = () => { win.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve() }
        s.onerror = () => reject(new Error('No se pudo cargar el lector de PDF'))
        document.head.appendChild(s)
      })
    }
    const buffer = await file.arrayBuffer()
    const pdf = await win.pdfjsLib.getDocument({ data: buffer }).promise
    const texts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texts.push(content.items.map((item: any) => item.str).join(' '))
    }
    return texts.join('\n\n')
  }

  async function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNombreArchivo(file.name); setError('')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const texto = ext === 'xlsx' || ext === 'xls' ? await excelToText(file)
        : ext === 'pdf' ? await pdfToText(file)
        : await file.text()
      setContenidoImport(texto)
    } catch (err) { setError('Error al leer el archivo: ' + String(err)) }
  }

  async function handleProcesarImport() {
    if (!contenidoImport.trim()) return
    setImportando(true); setError('')
    try {
      const res = await fetch('/api/importar-cobros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contenido: contenidoImport }) })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setImportPreview(data.cobros)
    } catch (e) { setError(String(e)) }
    finally { setImportando(false) }
  }

  async function handleConfirmarImport() {
    startTransition(async () => {
      for (const cobro of importPreview) await crearCobro(cobro as CobroPayload)
      router.refresh(); closeDialog()
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30">

      {/* Header */}
      <header className="bg-background border-b border-border px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/partner/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">Gestión de Cobros</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"
              onClick={() => { setImportPreview([]); setNombreArchivo(''); setContenidoImport(''); setError(''); setDialogMode('importar') }}
              className="gap-1.5 text-xs text-muted-foreground">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Importar Excel / PDF
            </Button>
            <Button size="sm" onClick={() => openCreate()} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Nuevo registro
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Métricas: clientes (angosto) + 4 iguales ── */}
        <div className="grid grid-cols-2 lg:grid-cols-[0.65fr_1fr_1fr_1fr_1fr] gap-3">
          <Card className="col-span-2 lg:col-span-1">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-slate-500" />
                <p className="text-xs text-muted-foreground">Clientes</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{numClientes}</p>
            </CardContent>
          </Card>
          <MetricCard icon={<CheckCircle2 className="w-4 h-4 text-foreground/60" />} label="Cobros recibidos">
            <p className="text-lg font-bold text-foreground">{ars(cobradoARS)}</p>
          </MetricCard>
          <MetricCard icon={<Clock className="w-4 h-4 text-muted-foreground" />} label="Cobros pendientes">
            <p className="text-lg font-bold text-foreground">{ars(pendienteARS)}</p>
            {pendienteUSD > 0 && <p className="text-xs text-muted-foreground">{usd(pendienteUSD)}</p>}
          </MetricCard>
          <MetricCard icon={<Percent className="w-4 h-4 text-muted-foreground" />} label="Litigios cobrados">
            {pctLitigios !== null ? (
              <>
                <p className="text-2xl font-bold text-foreground">{pctLitigios}%</p>
                <p className="text-xs text-muted-foreground">{litigiosCobrados.length} de {litigiosActivos.length}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Sin litigios</p>
            )}
          </MetricCard>
          <MetricCard icon={<Scale className="w-4 h-4 text-muted-foreground" />} label="Expectativa litigios">
            <p className="text-lg font-bold text-foreground">{ars(expectativaTotal)}</p>
            {litigiosActivos.length > 0 && <p className="text-xs text-muted-foreground">{litigiosActivos.length} litigio{litigiosActivos.length !== 1 ? 's' : ''}</p>}
          </MetricCard>
        </div>

        {/* ── Filtros ── */}
        {grupos.length > 0 && (
          <div className="space-y-2">
            {/* Fila 1: conteo + selector área + botón guardar */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1 min-w-0">
                {displayedGrupos.length} cliente{displayedGrupos.length !== 1 ? 's' : ''}
                {areaFiltro && <span className="ml-1 font-medium text-foreground">en {areaFiltro}</span>}
                {sortBy === 'manual' && <span className="ml-1 font-medium text-foreground">· Orden manual</span>}
              </p>
              {/* Selector de área */}
              <select
                value={areaFiltro}
                onChange={e => setAreaFiltro(e.target.value)}
                className="text-[11px] h-7 rounded-full border border-border bg-background px-2.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todas las áreas</option>
                {AREAS_LEGALES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {/* Guardar orden */}
              <button
                onClick={handleGuardarOrden}
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                  savedConfirm
                    ? 'bg-muted border-border text-foreground'
                    : 'border-border text-muted-foreground hover:border-slate-400 hover:text-foreground'
                )}
              >
                {savedConfirm ? '✓ Guardado' : 'Guardar orden'}
              </button>
            </div>
            {/* Fila 2: pills de ordenamiento */}
            <div className="flex items-center gap-1 flex-wrap">
              {([
                { key: 'reciente',   label: 'Más reciente' },
                { key: 'nombre',     label: 'A–Z' },
                { key: 'monto',      label: 'Monto ↓' },
                { key: 'pendientes', label: 'Pendientes' },
                { key: 'litigios',   label: 'Litigios' },
              ] as { key: SortMode; label: string }[]).map(opt => (
                <button key={opt.key} onClick={() => { setSortBy(opt.key); setOrdenKeys(null) }}
                  className={cn(
                    'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                    sortBy === opt.key && sortBy !== 'manual'
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:border-slate-400 hover:text-foreground'
                  )}>
                  {opt.label}
                </button>
              ))}
              {sortBy === 'manual' && (
                <span className="text-[11px] px-2.5 py-1 rounded-full border bg-foreground text-background border-foreground">
                  Manual
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Lista de clientes ── */}
        {displayedGrupos.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No hay cobros registrados todavía.</p>
              <Button onClick={() => openCreate()} size="sm" variant="outline">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar primer cobro
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 select-none">
              <GripVertical className="w-3 h-3" />
              Arrastrá una tarjeta para ordenar manualmente
            </p>
            {displayedGrupos.map((grupo, idx) => (
              <div
                key={grupo.key}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'transition-all duration-150',
                  dragIdx === idx && 'opacity-40 scale-[0.99]',
                  dragOverIdx === idx && dragIdx !== idx && 'ring-2 ring-foreground/20 rounded-xl',
                )}
              >
                <ClienteCard
                  grupo={grupo}
                  expanded={expandedKey === grupo.key}
                  onToggle={() => setExpandedKey(expandedKey === grupo.key ? null : grupo.key)}
                  onEdit={openEdit}
                  onDelete={handleEliminar}
                  onAddCobro={() => openCreate({ id: grupo.clienteId ?? undefined, nombre: grupo.nombre })}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Selector de modo ── */}
      <Dialog open={dialogMode === 'selector'} onOpenChange={v => !v && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo registro</DialogTitle>
            <DialogDescription>¿Cómo querés cargar la información?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            {[
              { icon: <Pencil className="w-5 h-5 text-slate-600" />, titulo: 'Formulario manual', desc: 'Completás cada campo vos mismo', action: () => setDialogMode('manual') },
              { icon: <Sparkles className="w-5 h-5 text-muted-foreground" />, titulo: 'Asistente IA', desc: 'Describís en lenguaje natural o grabás voz', action: () => setDialogMode('asistente') },
            ].map(item => (
              <button key={item.titulo} onClick={item.action}
                className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-slate-300 hover:bg-muted/40 transition-all text-left group">
                <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-slate-200 transition-colors flex items-center justify-center shrink-0">{item.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.titulo}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Asistente IA ── */}
      <Dialog open={dialogMode === 'asistente'} onOpenChange={v => !v && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-muted-foreground" /> Asistente IA</DialogTitle>
            <DialogDescription>Describí el cobro como si le hablaras a un colega.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tu descripción</Label>
                <button onClick={toggleGrabacion}
                  className={cn('flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border transition-colors',
                    grabando ? 'border-red-300 text-red-600 bg-red-50 animate-pulse' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {grabando ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  {grabando ? 'Detener' : 'Grabar voz'}
                </button>
              </div>
              <textarea value={textoAsistente} onChange={e => setTextoAsistente(e.target.value)} rows={5}
                placeholder='Ej: "Cobro a García $850.000 en 3 cuotas sin interés, vence en junio" o "Litigo contra Empresa SA, me pagan el 25% del resultado, el juicio vale 50M..."'
                className="w-full text-sm rounded-md border border-input bg-transparent px-3 py-2 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex gap-2">
              <Button onClick={handleProcesarAsistente} disabled={procesando || !textoAsistente.trim()} className="flex-1">
                {procesando ? 'Procesando...' : 'Analizar y pre-llenar formulario →'}
              </Button>
              <Button variant="outline" onClick={() => setDialogMode('selector')}>Atrás</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Importar ── */}
      <Dialog open={dialogMode === 'importar'} onOpenChange={v => !v && closeDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Importar planilla con IA</DialogTitle>
            <DialogDescription>Excel (.xlsx), CSV o PDF — la IA interpreta tus columnas y crea los registros.</DialogDescription>
          </DialogHeader>
          {importPreview.length === 0 ? (
            <div className="space-y-4 pt-1">
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-slate-400 hover:bg-muted/30 transition-all group">
                <Upload className="w-8 h-8 text-muted-foreground group-hover:text-foreground mx-auto mb-3 transition-colors" />
                <p className="text-sm font-medium text-foreground">{nombreArchivo || 'Hacé click para seleccionar'}</p>
                <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx), CSV, PDF o texto plano</p>
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls,.pdf" className="hidden" onChange={handleArchivoSeleccionado} />
              {contenidoImport && (
                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground font-mono max-h-28 overflow-y-auto">
                  {contenidoImport.slice(0, 500)}{contenidoImport.length > 500 ? '...' : ''}
                </div>
              )}
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="flex gap-2">
                <Button onClick={handleProcesarImport} disabled={importando || !contenidoImport} className="flex-1">
                  {importando ? 'La IA está procesando...' : 'Procesar con IA →'}
                </Button>
                <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-foreground/60" />
                <span className="font-medium">La IA encontró {importPreview.length} registro{importPreview.length !== 1 ? 's' : ''}. Revisá antes de guardar.</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importPreview.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-[10px]">{c.tipo === 'litigio' ? 'Litigio' : 'Directo'}</Badge>
                      <span className="text-sm font-medium">{c.concepto || '(sin concepto)'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.cliente_nombre && `${c.cliente_nombre} · `}
                      {c.moneda} {c.monto_total ? Math.round(c.monto_total).toLocaleString('es-AR') : '—'}
                      {c.tipo === 'litigio' && c.porcentaje_acordado && ` · ${c.porcentaje_acordado}% del resultado`}
                      {c.forma_pago === 'cuotas' && c.num_cuotas && ` · ${c.num_cuotas} cuotas`}
                    </p>
                  </div>
                ))}
              </div>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="flex gap-2">
                <Button onClick={handleConfirmarImport} disabled={isPending} className="flex-1">
                  {isPending ? 'Guardando...' : `Guardar ${importPreview.length} registro${importPreview.length !== 1 ? 's' : ''}`}
                </Button>
                <Button variant="outline" onClick={() => setImportPreview([])}>Volver a cargar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Formulario manual / edición ── */}
      <Dialog open={dialogMode === 'manual'} onOpenChange={v => !v && closeDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCobro
                ? `Editar ${editingCobro.tipo === 'litigio' ? 'litigio' : 'cobro'}`
                : form.tipo === 'litigio' ? 'Nuevo litigio' : 'Nuevo cobro'}
            </DialogTitle>
          </DialogHeader>
          <FormularioCobro
            form={form}
            clientes={clientes}
            onChange={handleFormChange}
            onSubmit={() => handleSubmitManual()}
            onBack={() => editingCobro ? closeDialog() : setDialogMode('selector')}
            isPending={isPending}
            error={error}
            isEditing={!!editingCobro}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── ClienteCard ───────────────────────────────────────────────────────────────
function ClienteCard({ grupo, expanded, onToggle, onEdit, onDelete, onAddCobro }: {
  grupo: ClienteGrupo; expanded: boolean; onToggle: () => void
  onEdit: (c: Cobro) => void; onDelete: (id: string) => void; onAddCobro: () => void
}) {
  const directos  = grupo.cobros.filter(c => c.tipo === 'directo')
  const litigios  = grupo.cobros.filter(c => c.tipo === 'litigio')
  const pendARS   = directos.filter(c => c.moneda === 'ARS' && c.estado !== 'cobrado' && c.estado !== 'cancelado').reduce((s, c) => s + c.monto_total - c.monto_cobrado, 0)
  const pendUSD   = directos.filter(c => c.moneda === 'USD' && c.estado !== 'cobrado' && c.estado !== 'cancelado').reduce((s, c) => s + c.monto_total - c.monto_cobrado, 0)
  const expectativa = litigios.filter(c => c.estado !== 'cancelado').reduce((s, c) => s + (c.expectativa_cobro ?? 0), 0)
  const todoCobrado = grupo.cobros.every(c => c.estado === 'cobrado' || c.estado === 'cancelado')
  // Áreas únicas del grupo
  const areas = [...new Set(grupo.cobros.map(c => c.area).filter(Boolean))] as string[]

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-center gap-3 cursor-pointer select-none" onClick={onToggle}>
        <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-foreground">{grupo.nombre}</p>
            {areas.map(a => (
              <span key={a} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {a}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {pendARS > 0 && <span className="text-muted-foreground font-medium">Pendiente {ars(pendARS)}</span>}
            {pendUSD > 0 && <span className="text-muted-foreground font-medium">Pendiente {usd(pendUSD)}</span>}
            {pendARS === 0 && pendUSD === 0 && directos.length > 0 && todoCobrado && (
              <span className="text-foreground font-medium">Todo cobrado</span>
            )}
            {expectativa > 0 && <span className="text-muted-foreground">Expectativa {ars(expectativa)}</span>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {grupo.cobros.some(c => c.estado === 'pendiente') && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border badge-pendiente">Pendiente</span>
          )}
          {todoCobrado && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border badge-cobrado">Cobrado</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <>
          <Separator />
          <div className="p-4 space-y-3 bg-muted/20">
            {grupo.cobros.map(cobro => (
              <CobroDetailCard key={cobro.id} cobro={cobro} onEdit={() => onEdit(cobro)} onDelete={() => onDelete(cobro.id)} />
            ))}
            <button onClick={(e) => { e.stopPropagation(); onAddCobro() }}
              className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-slate-400 rounded-lg py-2.5 transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-3 h-3" /> Agregar otro cobro a {grupo.nombre}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}

// ── CobroDetailCard ───────────────────────────────────────────────────────────
function CobroDetailCard({ cobro, onEdit, onDelete }: { cobro: Cobro; onEdit: () => void; onDelete: () => void }) {
  const isLitigio = cobro.tipo === 'litigio'
  const badge = ESTADO_BADGE[cobro.estado]

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className={cn('text-[10px]', isLitigio ? 'text-foreground border-border bg-muted' : 'text-muted-foreground')}>
              {isLitigio ? 'Litigio' : 'Cobro directo'}
            </Badge>
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border', badge.className)}>{badge.label}</span>
            {cobro.area && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {cobro.area}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground">{cobro.concepto}</p>
        </div>
        <div className="text-right shrink-0">
          {isLitigio ? (
            <>
              <p className="text-sm font-bold text-foreground">{fmt(cobro.expectativa_cobro ?? 0, cobro.moneda)}</p>
              {cobro.porcentaje_acordado && <p className="text-[10px] text-muted-foreground">{cobro.porcentaje_acordado}% de {fmt(cobro.monto_litigio ?? 0, cobro.moneda)}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-foreground">{fmt(cobro.monto_total, cobro.moneda)}</p>
              {cobro.monto_cobrado > 0 && cobro.estado !== 'cobrado' && (
                <p className="text-[10px] text-muted-foreground">Cobrado: {fmt(cobro.monto_cobrado, cobro.moneda)}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-3">
        {!isLitigio && cobro.forma_pago === 'cuotas' && cobro.num_cuotas && (
          <InfoItem label="Cuotas" value={`${cobro.num_cuotas} cuota${cobro.num_cuotas !== 1 ? 's' : ''}${cobro.con_interes && cobro.tasa_interes ? ` · ${cobro.tasa_interes}% m.` : ''}`} />
        )}
        {cobro.fecha_vencimiento && (
          <InfoItem label="Vencimiento" value={new Date(cobro.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-AR')} />
        )}
        {isLitigio && cobro.parte_contraria && <InfoItem label="Parte contraria" value={cobro.parte_contraria} />}
        {isLitigio && cobro.probabilidad && <InfoItem label="Probabilidad" value={PROB_LABEL[cobro.probabilidad]} />}
        {isLitigio && cobro.etapa_litigio && <InfoItem label="Etapa" value={cobro.etapa_litigio} />}
        {isLitigio && cobro.fecha_estimada_resolucion && (
          <InfoItem label="Est. resolución" value={new Date(cobro.fecha_estimada_resolucion + 'T12:00:00').toLocaleDateString('es-AR')} />
        )}
      </div>

      {cobro.notas && <p className="text-xs text-muted-foreground italic mb-3">{cobro.notas}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs gap-1">
          <Pencil className="w-3 h-3" /> Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive h-7 text-xs gap-1">
          <Trash2 className="w-3 h-3" /> Eliminar
        </Button>
      </div>
    </div>
  )
}

// ── FormularioCobro ───────────────────────────────────────────────────────────
function FormularioCobro({ form, clientes, onChange, onSubmit, onBack, isPending, error, isEditing }: {
  form: Partial<CobroPayload>; clientes: ClienteSimple[]
  onChange: (field: keyof CobroPayload, value: unknown) => void
  onSubmit: () => void; onBack: () => void
  isPending: boolean; error: string; isEditing?: boolean
}) {
  const esLitigio = form.tipo === 'litigio'

  return (
    <div className="space-y-5 pt-1">
      <div className="grid grid-cols-2 gap-2">
        {(['directo', 'litigio'] as const).map(t => (
          <button key={t} onClick={() => onChange('tipo', t)}
            className={cn('flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all',
              form.tipo === t ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-slate-400')}>
            {t === 'directo' ? <DollarSign className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
            {t === 'directo' ? 'Cobro directo' : 'Expectativa litigio'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs">{esLitigio ? 'Nombre del litigio / autos' : 'Concepto'} <span className="text-destructive">*</span></Label>
          <Input value={form.concepto ?? ''} onChange={e => onChange('concepto', e.target.value)}
            placeholder={esLitigio ? 'Ej: García c/ Empresa SA — daños y perjuicios' : 'Ej: Registro de marca "Heladería El Pibe"'} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cliente</Label>
          {clientes.length > 0 ? (
            <select value={form.cliente_id ?? ''} onChange={e => {
              const id = e.target.value
              const c = clientes.find(x => x.id === id)
              onChange('cliente_id', id || null)
              onChange('cliente_nombre', c?.nombre ?? form.cliente_nombre ?? '')
            }} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="">— Sin cliente vinculado —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          ) : (
            <Input value={form.cliente_nombre ?? ''} onChange={e => onChange('cliente_nombre', e.target.value)} placeholder="Nombre del cliente" />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Moneda</Label>
          <div className="grid grid-cols-2 gap-2 h-9">
            {(['ARS', 'USD'] as Moneda[]).map(m => (
              <button key={m} onClick={() => onChange('moneda', m)}
                className={cn('rounded-md border text-sm font-medium transition-colors',
                  form.moneda === m ? 'bg-foreground text-background border-foreground' : 'border-input text-muted-foreground hover:border-slate-400')}>
                {m === 'ARS' ? '$ Pesos' : 'US$ Dólares'}
              </button>
            ))}
          </div>
        </div>

        {!esLitigio && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto total <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={form.monto_total ?? ''} onChange={e => onChange('monto_total', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pago</Label>
              <div className="grid grid-cols-2 gap-2 h-9">
                {(['unico', 'cuotas'] as const).map(f => (
                  <button key={f} onClick={() => onChange('forma_pago', f)}
                    className={cn('rounded-md border text-sm font-medium transition-colors',
                      form.forma_pago === f ? 'bg-foreground text-background border-foreground' : 'border-input text-muted-foreground hover:border-slate-400')}>
                    {f === 'unico' ? 'Pago único' : 'En cuotas'}
                  </button>
                ))}
              </div>
            </div>
            {form.forma_pago === 'cuotas' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número de cuotas</Label>
                  <Input type="number" min={2} value={form.num_cuotas ?? ''} onChange={e => onChange('num_cuotas', Number(e.target.value))} placeholder="Ej: 3" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Monto por cuota (calculado)</Label>
                  <Input readOnly value={form.monto_cuota ? Math.round(form.monto_cuota).toLocaleString('es-AR') : '—'} className="bg-muted/50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">¿Tiene interés?</Label>
                  <div className="grid grid-cols-2 gap-2 h-9">
                    {[false, true].map(v => (
                      <button key={String(v)} onClick={() => onChange('con_interes', v)}
                        className={cn('rounded-md border text-sm font-medium transition-colors',
                          form.con_interes === v ? 'bg-foreground text-background border-foreground' : 'border-input text-muted-foreground hover:border-slate-400')}>
                        {v ? 'Con interés' : 'Sin interés'}
                      </button>
                    ))}
                  </div>
                </div>
                {form.con_interes && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tasa mensual (%)</Label>
                    <Input type="number" step={0.1} min={0} value={form.tasa_interes ?? ''} onChange={e => onChange('tasa_interes', Number(e.target.value))} placeholder="Ej: 3.5" />
                  </div>
                )}
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de vencimiento</Label>
              <Input type="date" value={form.fecha_vencimiento ?? ''} onChange={e => onChange('fecha_vencimiento', e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <select value={form.estado ?? 'pendiente'} onChange={e => onChange('estado', e.target.value as EstadoCobro)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="pendiente">Pendiente</option>
                <option value="parcial">Parcial</option>
                <option value="cobrado">Cobrado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            {(form.estado === 'parcial' || form.estado === 'cobrado') && (
              <div className="space-y-1.5">
                <Label className="text-xs">Monto cobrado hasta ahora</Label>
                <Input type="number" min={0} value={form.monto_cobrado ?? ''} onChange={e => onChange('monto_cobrado', Number(e.target.value))} placeholder="0" />
              </div>
            )}
          </>
        )}

        {esLitigio && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Parte contraria</Label>
              <Input value={form.parte_contraria ?? ''} onChange={e => onChange('parte_contraria', e.target.value)} placeholder="Ej: Empresa SA" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto en disputa <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={form.monto_litigio ?? ''} onChange={e => onChange('monto_litigio', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porcentaje acordado (%)</Label>
              <Input type="number" min={0} max={100} step={0.5} value={form.porcentaje_acordado ?? ''} onChange={e => onChange('porcentaje_acordado', Number(e.target.value))} placeholder="Ej: 20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expectativa de cobro (calculada)</Label>
              <Input readOnly value={form.expectativa_cobro ? Math.round(form.expectativa_cobro).toLocaleString('es-AR') : '—'} className="bg-muted/50 font-medium" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Probabilidad de éxito</Label>
              <div className="grid grid-cols-3 gap-2 h-9">
                {(['alta', 'media', 'baja'] as ProbabilidadLitigio[]).map(p => (
                  <button key={p} onClick={() => onChange('probabilidad', p)}
                    className={cn('rounded-md border text-xs font-medium capitalize transition-colors',
                      form.probabilidad === p ? 'bg-foreground text-background border-foreground' : 'border-input text-muted-foreground hover:border-slate-400')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Etapa del litigio</Label>
              <Input value={form.etapa_litigio ?? ''} onChange={e => onChange('etapa_litigio', e.target.value)} placeholder="Ej: Primera instancia, apelación..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha estimada de resolución</Label>
              <Input type="date" value={form.fecha_estimada_resolucion ?? ''} onChange={e => onChange('fecha_estimada_resolucion', e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <select value={form.estado ?? 'pendiente'} onChange={e => onChange('estado', e.target.value as EstadoCobro)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="pendiente">Pendiente</option>
                <option value="parcial">Parcial</option>
                <option value="cobrado">Cobrado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Área legal</Label>
          <select value={form.area ?? ''} onChange={e => onChange('area', e.target.value || null)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="">— Sin área definida —</option>
            {AREAS_LEGALES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs">Notas adicionales</Label>
          <textarea value={form.notas ?? ''} onChange={e => onChange('notas', e.target.value || null)} rows={2}
            className="w-full text-sm rounded-md border border-input bg-transparent px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Cualquier info adicional..." />
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-2 pt-1">
        <Button onClick={onSubmit} disabled={isPending} className="flex-1">
          {isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : `Crear ${esLitigio ? 'litigio' : 'cobro'}`}
        </Button>
        <Button variant="outline" onClick={onBack}>{isEditing ? 'Cancelar' : 'Atrás'}</Button>
      </div>
    </div>
  )
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function MetricCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">{icon}<p className="text-xs text-muted-foreground">{label}</p></div>
        {children}
      </CardContent>
    </Card>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
    </div>
  )
}
