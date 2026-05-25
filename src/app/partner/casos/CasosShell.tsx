'use client'

import { useState, useRef } from 'react'
import { useRouter }         from 'next/navigation'
import { cn }                from '@/lib/utils'
import TimelineEditorModal, { type Etapa } from './TimelineEditorModal'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Caso {
  id:               string
  titulo:           string
  tipo_caso:        string
  cliente_nombre:   string
  cliente_email:    string | null
  cliente_whatsapp: string | null
  cliente_id:       string | null
  estado:           'activo' | 'finalizado' | 'archivado'
  etapa_actual:     number
  invitation_token: string
  created_at:       string
  caso_etapas:      { numero: number; completada: boolean }[]
}

interface Props {
  casosIniciales: Caso[]
  nombrePartner:  string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIPO_COLORES: Record<string, string> = {
  'Divorcio':   'bg-blue-50 text-blue-700 border-blue-200',
  'Sucesión':   'bg-amber-50 text-amber-700 border-amber-200',
  'Laboral':    'bg-green-50 text-green-700 border-green-200',
  'Penal':      'bg-red-50 text-red-700 border-red-200',
  'Accidente':  'bg-orange-50 text-orange-700 border-orange-200',
  'Contrato':   'bg-purple-50 text-purple-700 border-purple-200',
}
function tipoBadge(tipo: string) {
  return TIPO_COLORES[tipo] ?? 'bg-muted text-muted-foreground border-border'
}

const TIPOS_CASO_COMUNES = [
  'Divorcio', 'Sucesión', 'Laboral', 'Penal', 'Accidente',
  'Contrato', 'Alquiler', 'Societario', 'Administrativo', 'General',
]

// ── Componente principal ───────────────────────────────────────────────────────

export default function CasosShell({ casosIniciales, nombrePartner }: Props) {
  const router = useRouter()
  const [casos,       setCasos]       = useState<Caso[]>(casosIniciales)
  const [modo,        setModo]        = useState<'lista' | 'nuevo' | 'importar'>('lista')
  const [importTab,   setImportTab]   = useState<'texto' | 'excel'>('texto')
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'finalizado'>('todos')

  // Estado del formulario rápido
  const [formNombre,    setFormNombre]    = useState('')
  const [formEmail,     setFormEmail]     = useState('')
  const [formWhatsApp,  setFormWhatsApp]  = useState('')
  const [formTitulo,    setFormTitulo]    = useState('')
  const [formTipo,      setFormTipo]      = useState('General')
  const [creando,       setCreando]       = useState(false)
  const [errorForm,     setErrorForm]     = useState('')

  // Importar texto
  const [textoImport,    setTextoImport]    = useState('')
  const [extrayendo,     setExtrayendo]     = useState(false)
  const [clientesDetect, setClientesDetect] = useState<{
    clienteNombre: string; clienteWhatsapp: string|null; clienteEmail: string|null; titulo: string
  }[]>([])
  const [importando,     setImportando]     = useState(false)
  const [importOk,       setImportOk]       = useState(0)

  // Importar Excel
  const [excelRows,    setExcelRows]    = useState<Record<string, string>[]>([])
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [colNombre,    setColNombre]    = useState('')
  const [colWhatsApp,  setColWhatsApp]  = useState('')
  const [colEmail,     setColEmail]     = useState('')
  const [colTitulo,    setColTitulo]    = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Timeline editor modal
  const [editorCaso, setEditorCaso] = useState<Caso | null>(null)
  const [etapasEditor, setEtapasEditor] = useState<Etapa[]>([])

  // Invitar
  const [invitandoCasoId, setInvitandoCasoId] = useState<string | null>(null)
  const [invitData, setInvitData]   = useState<{ url: string; mensaje_wa: string; wa_link: string } | null>(null)
  const [copiado,   setCopiado]     = useState(false)

  // Nota / update del caso
  const [notaCasoId,  setNotaCasoId]  = useState<string | null>(null)
  const [notaTexto,   setNotaTexto]   = useState('')
  const [notaEnv,     setNotaEnv]     = useState(false)

  // ── Filtrado ───────────────────────────────────────────────────────────────

  const casosFiltrados = casos.filter(c => {
    const matchBusq  = !busqueda || c.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.titulo.toLowerCase().includes(busqueda.toLowerCase())
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    return matchBusq && matchEstado
  })

  // ── Alta manual ────────────────────────────────────────────────────────────

  async function crearCaso(e: React.FormEvent) {
    e.preventDefault()
    setErrorForm('')
    if (!formNombre.trim()) { setErrorForm('El nombre es obligatorio.'); return }
    if (!formTitulo.trim()) { setErrorForm('El título del caso es obligatorio.'); return }
    setCreando(true)
    try {
      const res  = await fetch('/api/partner/casos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNombre:   formNombre.trim(),
          clienteEmail:    formEmail.trim()    || null,
          clienteWhatsapp: formWhatsApp.trim() || null,
          titulo:          formTitulo.trim(),
          tipoCaso:        formTipo,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorForm(data.error ?? 'Error creando caso'); return }

      // Agregar al estado local y volver a la lista
      const nuevoCaso: Caso = {
        id:               data.id,
        titulo:           formTitulo.trim(),
        tipo_caso:        formTipo,
        cliente_nombre:   formNombre.trim(),
        cliente_email:    formEmail.trim()    || null,
        cliente_whatsapp: formWhatsApp.trim() || null,
        cliente_id:       null,
        estado:           'activo',
        etapa_actual:     1,
        invitation_token: data.invitation_token,
        created_at:       new Date().toISOString(),
        caso_etapas:      [],
      }
      setCasos(prev => [nuevoCaso, ...prev])
      setFormNombre(''); setFormEmail(''); setFormWhatsApp(''); setFormTitulo(''); setFormTipo('General')
      setModo('lista')
    } finally {
      setCreando(false)
    }
  }

  // ── Importar texto (IA) ────────────────────────────────────────────────────

  async function extraerDeTexto() {
    if (!textoImport.trim()) return
    setExtrayendo(true)
    setClientesDetect([])
    try {
      const res  = await fetch('/api/partner/casos/importar-texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoImport }),
      })
      const data = await res.json()
      setClientesDetect(data.clientes ?? [])
    } finally {
      setExtrayendo(false)
    }
  }

  async function importarClientesDetectados() {
    if (!clientesDetect.length) return
    setImportando(true)
    try {
      const res = await fetch('/api/partner/casos/importar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientes: clientesDetect }),
      })
      const data = await res.json()
      if (data.casos) {
        const nuevos: Caso[] = data.casos.map((c: { id: string; cliente_nombre: string; titulo: string }) => ({
          id: c.id, titulo: c.titulo, tipo_caso: 'General',
          cliente_nombre: c.cliente_nombre, cliente_email: null,
          cliente_whatsapp: null, cliente_id: null, estado: 'activo',
          etapa_actual: 1, invitation_token: '', created_at: new Date().toISOString(),
          caso_etapas: [],
        }))
        setCasos(prev => [...nuevos, ...prev])
        setImportOk(data.creados)
        setClientesDetect([])
        setTextoImport('')
      }
    } finally {
      setImportando(false)
    }
  }

  // ── Importar Excel ────────────────────────────────────────────────────────

  async function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const XLSX = await import('xlsx').catch(() => null)
    if (!XLSX) {
      alert('Instalá el paquete xlsx para importar Excel: npm install xlsx')
      return
    }

    const buffer = await file.arrayBuffer()
    const wb     = XLSX.read(buffer, { type: 'array' })
    const ws     = wb.Sheets[wb.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows   = (XLSX.utils.sheet_to_json as any)(ws, { defval: '' }) as Record<string, string>[]

    if (!rows.length) return
    const headers = Object.keys(rows[0])
    setExcelHeaders(headers)
    setExcelRows(rows.slice(0, 200)) // máximo 200 filas en preview

    // Auto-detect columnas
    const find = (kws: string[]) => headers.find(h =>
      kws.some(k => h.toLowerCase().includes(k.toLowerCase()))
    ) ?? ''
    setColNombre(find(['nombre', 'name', 'cliente', 'razón', 'razon']))
    setColWhatsApp(find(['whatsapp', 'cel', 'telef', 'phone', 'movil', 'móvil', 'wsp']))
    setColEmail(find(['email', 'mail', 'correo']))
    setColTitulo(find(['asunto', 'caso', 'titulo', 'matter', 'motivo', 'descripcion']))
  }

  async function importarExcel() {
    if (!excelRows.length || !colNombre) return
    const clientes = excelRows
      .filter(r => r[colNombre]?.trim())
      .map(r => ({
        clienteNombre:   r[colNombre]?.trim() ?? '',
        clienteWhatsapp: colWhatsApp ? (r[colWhatsApp]?.trim() || null) : null,
        clienteEmail:    colEmail    ? (r[colEmail]?.trim()    || null) : null,
        titulo:          colTitulo   ? (r[colTitulo]?.trim()   || 'Sin especificar') : 'Sin especificar',
      }))

    setImportando(true)
    try {
      const res  = await fetch('/api/partner/casos/importar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientes }),
      })
      const data = await res.json()
      if (data.casos) {
        const nuevos: Caso[] = data.casos.map((c: { id: string; cliente_nombre: string; titulo: string }) => ({
          id: c.id, titulo: c.titulo, tipo_caso: 'General',
          cliente_nombre: c.cliente_nombre, cliente_email: null,
          cliente_whatsapp: null, cliente_id: null, estado: 'activo',
          etapa_actual: 1, invitation_token: '', created_at: new Date().toISOString(),
          caso_etapas: [],
        }))
        setCasos(prev => [...nuevos, ...prev])
        setImportOk(data.creados)
        setExcelRows([])
        setExcelHeaders([])
        setModo('lista')
      }
    } finally {
      setImportando(false)
    }
  }

  // ── Invitar ────────────────────────────────────────────────────────────────

  async function obtenerInvitacion(casoId: string) {
    setInvitandoCasoId(casoId)
    setInvitData(null)
    const res  = await fetch(`/api/partner/casos/${casoId}/invitar`)
    const data = await res.json()
    if (data.url) setInvitData(data)
  }

  async function copiarMensaje(texto: string) {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  // ── Abrir editor de timeline ──────────────────────────────────────────────

  function abrirEditor(caso: Caso) {
    const etapas: Etapa[] = (caso.caso_etapas ?? []).map(e => ({
      titulo:               '',
      descripcion_juridica: '',
      descripcion_cliente:  '',
      ...e,
    }))
    setEtapasEditor(etapas)
    setEditorCaso(caso)
  }

  // ── Avanzar etapa ─────────────────────────────────────────────────────────

  async function avanzarEtapa(casoId: string) {
    const res  = await fetch(`/api/partner/casos/${casoId}/avanzar`, { method: 'POST' })
    const data = await res.json()
    setCasos(prev => prev.map(c =>
      c.id === casoId
        ? { ...c, etapa_actual: data.etapa_actual, estado: data.finalizado ? 'finalizado' : 'activo' }
        : c
    ))
  }

  // ── Nota / Update ─────────────────────────────────────────────────────────

  async function enviarNota(casoId: string) {
    if (!notaTexto.trim()) return
    setNotaEnv(true)
    try {
      await fetch(`/api/partner/casos/${casoId}/nota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto_juridico: notaTexto }),
      })
      setNotaTexto('')
      setNotaCasoId(null)
    } finally {
      setNotaEnv(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30">

      {/* Timeline editor modal */}
      {editorCaso && (
        <TimelineEditorModal
          casoId={editorCaso.id}
          titulo={editorCaso.titulo}
          tipoCaso={editorCaso.tipo_caso}
          nombrePartner={nombrePartner}
          etapasIniciales={etapasEditor}
          onClose={() => { setEditorCaso(null); setEtapasEditor([]) }}
          onPublicado={etapas => {
            setCasos(prev => prev.map(c => c.id === editorCaso.id
              ? { ...c, caso_etapas: etapas.map(e => ({ numero: e.numero, completada: false })) }
              : c
            ))
          }}
        />
      )}

      {/* Invitación modal */}
      {invitandoCasoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setInvitandoCasoId(null); setInvitData(null) }} />
          <div className="relative w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Invitar al cliente</p>
              <button onClick={() => { setInvitandoCasoId(null); setInvitData(null) }} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            {!invitData ? (
              <div className="flex items-center justify-center py-8">
                <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : (
              <>
                <div className="bg-muted/40 rounded-xl border border-border p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Link de acceso</p>
                  <p className="text-xs text-foreground font-mono break-all">{invitData.url}</p>
                </div>
                <div className="bg-muted/40 rounded-xl border border-border p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Mensaje WhatsApp listo</p>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{invitData.mensaje_wa}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copiarMensaje(invitData.mensaje_wa)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-border rounded-lg py-2 hover:bg-muted transition-colors"
                  >
                    {copiado ? '✓ Copiado' : 'Copiar mensaje'}
                  </button>
                  <a
                    href={invitData.wa_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-[#25D366] border border-[#25D366]/30 rounded-lg py-2 hover:bg-[#25D366]/5 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.522 5.855L.057 23.882a.5.5 0 00.61.61l6.028-1.465A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.177-1.431l-.37-.22-3.832.931.95-3.821-.241-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    Enviar por WhatsApp
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-background border-b border-border px-6 py-3.5 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/partner/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </a>
            <div>
              <p className="text-sm font-semibold text-foreground">Mis Casos</p>
              <p className="text-xs text-muted-foreground">{casos.length} caso{casos.length !== 1 ? 's' : ''} en total</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModo(m => m === 'importar' ? 'lista' : 'importar')}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                modo === 'importar'
                  ? 'bg-foreground text-primary-foreground border-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground bg-background'
              )}
            >
              ↑ Importar
            </button>
            <button
              onClick={() => setModo(m => m === 'nuevo' ? 'lista' : 'nuevo')}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                modo === 'nuevo'
                  ? 'bg-foreground text-primary-foreground border-foreground'
                  : 'border-border text-foreground hover:border-foreground/30 bg-background'
              )}
            >
              + Nuevo caso
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* ── Alta rápida manual ───────────────────────────────────────────── */}
        {modo === 'nuevo' && (
          <div className="bg-background border border-border rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-foreground mb-4">Alta rápida — 3 campos mínimos</p>
            <form onSubmit={crearCaso} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Nombre del cliente <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formNombre}
                    onChange={e => setFormNombre(e.target.value)}
                    placeholder="Ej: Juan Pérez / Rodríguez Hnos. SRL"
                    className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Título del caso <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitulo}
                    onChange={e => setFormTitulo(e.target.value)}
                    placeholder="Ej: Divorcio García / Sucesión Rodríguez"
                    className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">WhatsApp / Email</label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={formWhatsApp}
                      onChange={e => setFormWhatsApp(e.target.value)}
                      placeholder="5491123456789"
                      className="flex-1 text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                    <input
                      type="email"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="flex-1 text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Tipo de caso</label>
                  <select
                    value={formTipo}
                    onChange={e => setFormTipo(e.target.value)}
                    className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  >
                    {TIPOS_CASO_COMUNES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {errorForm && <p className="text-xs text-destructive">{errorForm}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creando}
                  className="flex items-center gap-2 bg-foreground text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {creando ? 'Creando...' : '✓ Crear caso'}
                </button>
                <button
                  type="button"
                  onClick={() => setModo('lista')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Importar ─────────────────────────────────────────────────────── */}
        {modo === 'importar' && (
          <div className="bg-background border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Tabs */}
            <div className="flex border-b border-border">
              {(['texto', 'excel'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setImportTab(tab)}
                  className={cn(
                    'flex-1 py-3 text-xs font-medium transition-colors',
                    importTab === tab
                      ? 'text-foreground bg-background border-b-2 border-foreground'
                      : 'text-muted-foreground hover:text-foreground bg-muted/20'
                  )}
                >
                  {tab === 'texto' ? '📋 Cajón de texto inteligente' : '📊 Importar desde Excel'}
                </button>
              ))}
            </div>

            {/* Texto libre */}
            {importTab === 'texto' && (
              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pegá acá cualquier texto desordenado — mensajes de WhatsApp, una lista vieja, notas sueltas. La IA va a identificar los clientes y sus casos automáticamente.
                </p>
                <textarea
                  value={textoImport}
                  onChange={e => setTextoImport(e.target.value)}
                  rows={6}
                  placeholder={'Ej:\n"Juan Pérez me llama por un divorcio, su cel es 11-3456-7890\nMaría García - sucesión del padre, mariagarcia@gmail.com\nContactar a Luis Rodríguez por accidente de tránsito, 15-2234-5566"'}
                  className="w-full resize-none bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 leading-relaxed focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
                <button
                  onClick={extraerDeTexto}
                  disabled={!textoImport.trim() || extrayendo}
                  className="flex items-center gap-2 bg-foreground text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {extrayendo ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Analizando texto...
                    </>
                  ) : '🔍 Extraer clientes con IA'}
                </button>

                {/* Clientes detectados */}
                {clientesDetect.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">{clientesDetect.length} clientes detectados — revisalos antes de importar:</p>
                    {clientesDetect.map((c, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card text-sm">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground shrink-0">
                          {c.clienteNombre[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{c.clienteNombre}</p>
                          <p className="text-xs text-muted-foreground">{c.titulo} {c.clienteWhatsapp && `· ${c.clienteWhatsapp}`}</p>
                        </div>
                        <button onClick={() => setClientesDetect(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive text-lg leading-none">×</button>
                      </div>
                    ))}
                    <button
                      onClick={importarClientesDetectados}
                      disabled={importando}
                      className="w-full flex items-center justify-center gap-2 bg-foreground text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {importando ? 'Importando...' : `✓ Importar ${clientesDetect.length} clientes`}
                    </button>
                  </div>
                )}

                {importOk > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground">
                    <svg className="w-4 h-4 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {importOk} clientes importados correctamente.
                    <button onClick={() => { setImportOk(0); setModo('lista') }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Ver lista →</button>
                  </div>
                )}
              </div>
            )}

            {/* Excel */}
            {importTab === 'excel' && (
              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Subí cualquier archivo Excel o CSV. El sistema detecta automáticamente las columnas de nombre, teléfono, email y asunto — y te deja confirmar el mapeo antes de importar.
                </p>

                {excelRows.length === 0 ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-foreground/30 hover:bg-muted/20 transition-all"
                  >
                    <svg className="w-8 h-8 text-muted-foreground mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm font-medium text-foreground">Arrastrá o hacé clic para subir</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls o .csv</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs font-medium text-foreground">{excelRows.length} filas detectadas — mapeá las columnas:</p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Nombre *', val: colNombre, set: setColNombre },
                        { label: 'WhatsApp', val: colWhatsApp, set: setColWhatsApp },
                        { label: 'Email',    val: colEmail,    set: setColEmail    },
                        { label: 'Asunto',   val: colTitulo,   set: setColTitulo   },
                      ].map(({ label, val, set }) => (
                        <div key={label}>
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">{label}</label>
                          <select
                            value={val}
                            onChange={e => set(e.target.value)}
                            className="w-full text-xs rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-foreground focus:outline-none"
                          >
                            <option value="">— no usar —</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border">
                            {[colNombre, colWhatsApp, colEmail, colTitulo].filter(Boolean).map(h => (
                              <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {excelRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              {[colNombre, colWhatsApp, colEmail, colTitulo].filter(Boolean).map(h => (
                                <td key={h} className="px-3 py-2 text-foreground">{row[h]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {excelRows.length > 5 && (
                        <p className="text-center text-xs text-muted-foreground py-2">… y {excelRows.length - 5} filas más</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={importarExcel}
                        disabled={!colNombre || importando}
                        className="flex items-center gap-2 bg-foreground text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {importando ? 'Importando...' : `✓ Importar ${excelRows.length} filas`}
                      </button>
                      <button
                        onClick={() => { setExcelRows([]); setExcelHeaders([]); if (fileRef.current) fileRef.current.value = '' }}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Lista de casos ────────────────────────────────────────────────── */}
        {modo === 'lista' && (
          <>
            {/* Filtros */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-52">
                <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por cliente o caso..."
                  className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
              <div className="flex gap-1">
                {(['todos', 'activo', 'finalizado'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFiltroEstado(f)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize',
                      filtroEstado === f
                        ? 'bg-foreground text-primary-foreground border-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground bg-background'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty state */}
            {casosFiltrados.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {busqueda ? 'Sin resultados para esa búsqueda' : 'Todavía no hay casos cargados'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {busqueda ? 'Probá con otro nombre o título.' : 'Usá el botón "+ Nuevo caso" o importá desde Excel.'}
                </p>
              </div>
            )}

            {/* Grilla de casos */}
            <div className="space-y-2.5">
              {casosFiltrados.map(caso => {
                const total    = caso.caso_etapas?.length ?? 0
                const completas = caso.caso_etapas?.filter(e => e.completada).length ?? 0
                const pct      = total > 0 ? Math.round((completas / total) * 100) : 0
                const tieneTimeline = total > 0

                return (
                  <div key={caso.id} className="bg-background border border-border rounded-xl overflow-hidden hover:border-foreground/15 transition-colors">
                    <div className="p-4 flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                        {caso.cliente_nombre[0]?.toUpperCase()}
                      </div>

                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{caso.cliente_nombre}</p>
                          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border', tipoBadge(caso.tipo_caso))}>
                            {caso.tipo_caso}
                          </span>
                          {caso.estado === 'finalizado' && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                              Finalizado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{caso.titulo}</p>

                        {/* Barra de progreso */}
                        {tieneTimeline && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-foreground rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              Etapa {caso.etapa_actual}/{total}
                            </span>
                          </div>
                        )}

                        {caso.cliente_whatsapp && (
                          <p className="text-[10px] text-muted-foreground mt-1">{caso.cliente_whatsapp}</p>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          onClick={() => abrirEditor(caso)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                        >
                          {tieneTimeline ? '✏ Timeline' : '+ Timeline'}
                        </button>
                        {tieneTimeline && caso.estado === 'activo' && (
                          <button
                            onClick={() => avanzarEtapa(caso.id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                          >
                            → Avanzar
                          </button>
                        )}
                        <button
                          onClick={() => { obtenerInvitacion(caso.id) }}
                          className={cn(
                            'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                            caso.cliente_id
                              ? 'border-border text-muted-foreground/50 cursor-default'
                              : 'border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/5'
                          )}
                        >
                          {caso.cliente_id ? '✓ En portal' : '📲 Invitar'}
                        </button>
                      </div>
                    </div>

                    {/* Panel de nota rápida */}
                    {notaCasoId === caso.id ? (
                      <div className="px-4 pb-4 border-t border-border pt-3 flex gap-2">
                        <textarea
                          value={notaTexto}
                          onChange={e => setNotaTexto(e.target.value)}
                          rows={2}
                          placeholder="Escribí la actualización en lenguaje jurídico, la IA la traduce para el cliente..."
                          className="flex-1 resize-none text-xs bg-muted/30 border border-border rounded-lg px-2.5 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        />
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => enviarNota(caso.id)}
                            disabled={notaEnv || !notaTexto.trim()}
                            className="text-xs font-medium bg-foreground text-primary-foreground rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {notaEnv ? '...' : 'Enviar'}
                          </button>
                          <button
                            onClick={() => { setNotaCasoId(null); setNotaTexto('') }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setNotaCasoId(caso.id)}
                        className="w-full text-left px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors border-t border-border/50"
                      >
                        + Agregar actualización al cliente
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
