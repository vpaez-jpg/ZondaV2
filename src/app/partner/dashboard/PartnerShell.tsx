'use client'

import { useState, useTransition, useEffect, useRef, useCallback, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { crearCliente } from './actions'
import BriefingMatutino   from './BriefingMatutino'
import CalculadoraPlazos  from './CalculadoraPlazos'
import CalendarioPartner  from './CalendarioPartner'
import NotificacionesBell from './NotificacionesBell'
import DiaBriefingModal   from './DiaBriefingModal'
import AsistenteChat      from './AsistenteChat'
import AlertaCobranzaModal, { type CobroVencido } from './AlertaCobranzaModal'
import IntakeDrawer      from './IntakeDrawer'
import SolicitarPagoModal from './SolicitarPagoModal'
import EnviarNDAModal     from './EnviarNDAModal'
import EnviarTyCModal     from './EnviarTyCModal'
import EnviarPPModal      from './EnviarPPModal'
import EnviarAmparoModal  from './EnviarAmparoModal'
import {
  ARANCEL_DNDA, ENVIO_POSTAL_DNDA, SOPORTE_DNDA, GASTOS_FIJOS_DNDA,
  HONORARIOS_RECOMENDADOS_DNDA, CORTE_ZONDA_DNDA,
  type DatosPropuestaDNDA,
} from '@/lib/propuesta-dnda'
import {
  GASTOS_CONSTITUCION_SAS, GASTOS_RUBRICA_SAS,
  HONORARIOS_RECOMENDADOS_SAS, CORTE_ZONDA_SAS,
  type DatosPropuestaSAS,
} from '@/lib/propuesta-sas-constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// ── Tipos ──────────────────────────────────────────────────────
interface Perfil {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  whatsapp_link: string | null
  meet_link: string | null
  logo_url: string | null
}

interface Cliente {
  id: string
  nombre: string
  email: string | null
  created_at: string
}

interface Tramite {
  id: string
  tipo: 'MARCAS' | 'DNDA' | 'SAS' | 'NDA' | 'TYC' | 'PP' | 'ART9' | 'GANANCIAS'
  etapa_numero: number
  cliente_id: string
  created_at: string
  updated_at: string
}

interface Etapa {
  tipo: string
  numero: number
  descripcion: string
}

interface ClaseNiza {
  numero: number
  nombre: string
  motivo?: string
  descripcion_cliente?: string
}

interface Props {
  perfil: Perfil
  clientes: Cliente[]
  tramites: Tramite[]
  etapas: Etapa[]
  googleEmail:         string | null
  googleJustConnected: boolean
  googleError:         string | null
  yaVioBriefingHoy:    boolean
  cobrosVencidos:      CobroVencido[]
}

// ── Constantes ─────────────────────────────────────────────────
const ARANCEL_INPI_POR_CLASE = 37224
const HONORARIOS_RECOMENDADOS = 250000
const CORTE_ZONDA_POR_CLASE = 75000

function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const ETAPA_MAX: Record<string, number> = { MARCAS: 7, DNDA: 4, SAS: 6, NDA: 4, TYC: 4, PP: 4, ART9: 4, GANANCIAS: 4 }

const BADGE_TIPO: Record<string, { label: string; className: string }> = {
  MARCAS:    { label: 'Registro de Marca',            className: 'bg-muted text-muted-foreground border-border' },
  DNDA:      { label: 'Registro de Obra (DNDA)',      className: 'bg-muted text-muted-foreground border-border' },
  SAS:       { label: 'Constitución SAS',              className: 'bg-muted text-muted-foreground border-border' },
  NDA:       { label: 'Acuerdo de Confidencialidad',  className: 'bg-muted text-muted-foreground border-border' },
  TYC:       { label: 'Términos y Condiciones',        className: 'bg-muted text-muted-foreground border-border' },
  PP:        { label: 'Políticas de Privacidad',       className: 'bg-muted text-muted-foreground border-border' },
  ART9:      { label: 'Amparo Art. 9 Ley 24.463',     className: 'bg-muted text-muted-foreground border-border' },
  GANANCIAS: { label: 'Amparo Impuesto a Ganancias',  className: 'bg-muted text-muted-foreground border-border' },
}

// ── Dashboard layout — bloques reordenables ───────────────────
type BloqueId = 'asistente' | 'briefing' | 'herramientas' | 'gestion' | 'clientes'
const BLOQUES_DEFAULT: BloqueId[] = ['asistente', 'briefing', 'herramientas', 'gestion', 'clientes']

function cargarOrden(partnerId: string): BloqueId[] {
  try {
    const raw = localStorage.getItem(`zonda_layout_${partnerId}`)
    if (!raw) return [...BLOQUES_DEFAULT]
    const parsed = JSON.parse(raw) as string[]
    const validos = parsed.filter((b): b is BloqueId => BLOQUES_DEFAULT.includes(b as BloqueId))
    const faltantes = BLOQUES_DEFAULT.filter(b => !validos.includes(b))
    return [...validos, ...faltantes]
  } catch { return [...BLOQUES_DEFAULT] }
}

function guardarOrden(partnerId: string, orden: BloqueId[]) {
  localStorage.setItem(`zonda_layout_${partnerId}`, JSON.stringify(orden))
}

// ── Componente principal ───────────────────────────────────────
export default function PartnerShell({ perfil, clientes, tramites, etapas, googleEmail, googleJustConnected, googleError, yaVioBriefingHoy, cobrosVencidos }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [mostrarForm,      setMostrarForm]      = useState(false)
  const [tipoFormInicial,  setTipoFormInicial]  = useState<'MARCAS' | 'DNDA' | 'SAS'>('MARCAS')
  const [mostrarNDA,       setMostrarNDA]       = useState(false)
  const [mostrarTYC,       setMostrarTYC]       = useState(false)
  const [mostrarPP,        setMostrarPP]        = useState(false)
  const [mostrarART9,      setMostrarART9]      = useState(false)
  const [mostrarGANANCIAS, setMostrarGANANCIAS] = useState(false)
  const [mostrarModal,     setMostrarModal]     = useState(!yaVioBriefingHoy)
  const [mostrarAlertaCobros, setMostrarAlertaCobros] = useState(false)

  // Mostrar alerta de cobros vencidos una vez por sesión (después de montar)
  useEffect(() => {
    if (cobrosVencidos.length === 0) return
    if (sessionStorage.getItem('zonda_alerta_cobros_shown')) return
    // Pequeño delay para que no compita con el briefing modal
    const t = setTimeout(() => setMostrarAlertaCobros(true), 500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Layout personalizable ──────────────────────────────────
  const [editMode,   setEditMode]   = useState(false)
  // Inicializar siempre con el orden default para que server y cliente rendericen igual.
  // El orden guardado en localStorage se aplica en useEffect, después de la hidratación.
  const [blockOrder, setBlockOrder] = useState<BloqueId[]>([...BLOQUES_DEFAULT])

  useEffect(() => {
    setBlockOrder(cargarOrden(perfil.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [dragOver, setDragOver] = useState<BloqueId | null>(null)
  const dragItem = useRef<BloqueId | null>(null)

  function onDragStart(id: BloqueId) { dragItem.current = id }
  function onDragOver(e: React.DragEvent, id: BloqueId) {
    e.preventDefault()
    if (dragItem.current && dragItem.current !== id) setDragOver(id)
  }
  function onDrop(e: React.DragEvent, targetId: BloqueId) {
    e.preventDefault()
    const from = dragItem.current
    if (!from || from === targetId) { setDragOver(null); return }
    const next = [...blockOrder]
    const fi = next.indexOf(from), ti = next.indexOf(targetId)
    next.splice(fi, 1); next.splice(ti, 0, from)
    setBlockOrder(next)
    guardarOrden(perfil.id, next)
    dragItem.current = null; setDragOver(null)
  }
  function onDragEnd() { dragItem.current = null; setDragOver(null) }

  function iniciarNuevoCliente(tipo: 'MARCAS' | 'DNDA' | 'SAS' = 'MARCAS') {
    setTipoFormInicial(tipo)
    setMostrarForm(true)
  }
  const [googleBanner, setGoogleBanner] = useState<'success' | 'error' | null>(
    googleJustConnected ? 'success' : googleError ? 'error' : null
  )

  // Limpiar el query param del banner después de mostrarlo
  useEffect(() => {
    if (googleJustConnected || googleError) {
      const url = new URL(window.location.href)
      url.searchParams.delete('google_connected')
      url.searchParams.delete('google_error')
      window.history.replaceState({}, '', url.pathname)
      const timer = setTimeout(() => setGoogleBanner(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [googleJustConnected, googleError])
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null)

  const tramitePorCliente = Object.fromEntries(tramites.map(t => [t.cliente_id, t]))

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const totalActivos    = tramites.filter(t => t.etapa_numero < ETAPA_MAX[t.tipo]).length
  const totalFinalizados = tramites.filter(t => t.etapa_numero === ETAPA_MAX[t.tipo]).length

  return (
    <div className="min-h-screen bg-muted/30">

      {/* ── Modal primer ingreso del día ─────────────────────── */}
      {mostrarModal && (
        <DiaBriefingModal
          nombrePartner={perfil.nombre}
          meetLink={perfil.meet_link}
          onClose={() => setMostrarModal(false)}
        />
      )}

      {/* ── Alerta cobros vencidos (una vez por sesión) ──────── */}
      {mostrarAlertaCobros && cobrosVencidos.length > 0 && (
        <AlertaCobranzaModal
          cobros={cobrosVencidos}
          nombrePartner={perfil.nombre}
          onClose={() => {
            sessionStorage.setItem('zonda_alerta_cobros_shown', '1')
            setMostrarAlertaCobros(false)
          }}
        />
      )}

      {/* ── Modal NDA ────────────────────────────────────── */}
      {mostrarNDA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-base font-semibold text-foreground">Nuevo NDA</p>
                <p className="text-xs text-muted-foreground">Acuerdo de Confidencialidad</p>
              </div>
              <button onClick={() => setMostrarNDA(false)} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">✕</button>
            </div>
            <EnviarNDAModal nombrePartner={perfil.nombre} onClose={() => setMostrarNDA(false)} />
          </div>
        </div>
      )}

      {/* ── Modal PP ─────────────────────────────────────── */}
      {mostrarPP && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setMostrarPP(false) }}
        >
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-semibold text-foreground">Nueva propuesta — PP</p>
              <button onClick={() => setMostrarPP(false)} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">✕</button>
            </div>
            <EnviarPPModal nombrePartner={perfil.nombre} onClose={() => setMostrarPP(false)} />
          </div>
        </div>
      )}

      {/* ── Modal TYC ────────────────────────────────────── */}
      {mostrarTYC && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-base font-semibold text-foreground">Nuevos Términos y Condiciones</p>
                <p className="text-xs text-muted-foreground">Redacción a medida · Derecho argentino</p>
              </div>
              <button onClick={() => setMostrarTYC(false)} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">✕</button>
            </div>
            <EnviarTyCModal nombrePartner={perfil.nombre} onClose={() => setMostrarTYC(false)} />
          </div>
        </div>
      )}

      {/* ── Modal Amparo ART9 ─────────────────────────── */}
      {mostrarART9 && (
        <EnviarAmparoModal tipo="ART9" nombrePartner={perfil.nombre} onClose={() => setMostrarART9(false)} />
      )}

      {/* ── Modal Amparo GANANCIAS ────────────────────── */}
      {mostrarGANANCIAS && (
        <EnviarAmparoModal tipo="GANANCIAS" nombrePartner={perfil.nombre} onClose={() => setMostrarGANANCIAS(false)} />
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-background border-b border-border px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          {perfil.logo_url ? (
            <img src={perfil.logo_url} alt={perfil.nombre} className="h-7 object-contain" />
          ) : (
            <div>
              <p className="text-sm font-semibold text-foreground">{perfil.nombre}</p>
              <p className="text-xs text-muted-foreground">Portal de Gestión</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <IntakeDrawer />
            <SolicitarPagoModal nombrePartner={perfil.nombre} />
            <NotificacionesBell googleConnected={!!googleEmail} />
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                editMode
                  ? 'bg-foreground text-primary-foreground border-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background'
              )}
            >
              {editMode ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Guardar
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                  Personalizar
                </>
              )}
            </button>
            <PerfilDropdown perfil={perfil} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Banner Google Calendar (fijo, no reordenable) ───── */}
        {googleBanner === 'success' && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border text-foreground text-sm shadow-sm">
            <span className="text-base">📆</span>
            <div className="flex-1">
              <span className="font-semibold">Google Calendar conectado</span>
              {googleEmail && <span className="ml-1.5 text-muted-foreground text-xs">{googleEmail}</span>}
            </div>
            <button onClick={() => setGoogleBanner(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
        )}
        {googleBanner === 'error' && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
            <span className="text-base">⚠️</span>
            <span className="flex-1">No se pudo conectar Google Calendar. Intentá de nuevo.</span>
            <button onClick={() => setGoogleBanner(null)} className="text-red-400 hover:text-red-700 text-xs">✕</button>
          </div>
        )}

        {/* ── Banner modo edición ────────────────────────────── */}
        {editMode && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg bg-foreground text-primary-foreground text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
            </svg>
            <span className="flex-1 text-xs">Arrastrá cada sección para reordenar el dashboard. El orden se guarda automáticamente.</span>
            <button onClick={() => setEditMode(false)} className="text-xs opacity-70 hover:opacity-100 font-medium">
              Listo ✓
            </button>
          </div>
        )}

        {/* ── Bloques reordenables ───────────────────────────── */}
        <div className="space-y-0">
          {blockOrder.map(bloqueId => {
            const dndProps = {
              id: bloqueId as BloqueId,
              editMode,
              isDragOver: dragOver === bloqueId,
              isDragging: dragItem.current === bloqueId,
              onDragStart,
              onDragOver,
              onDrop,
              onDragEnd,
            }

            if (bloqueId === 'asistente') return (
              <DraggableBlock key="asistente" {...dndProps}>
                <div className="mb-8">
                  <AsistenteChat nombrePartner={perfil.nombre} />
                </div>
              </DraggableBlock>
            )

            if (bloqueId === 'briefing') return (
              <DraggableBlock key="briefing" {...dndProps}>
                <div className="mb-8">
                  <BriefingMatutino
                    nombrePartner={perfil.nombre}
                    tramites={tramites}
                    clientes={clientes}
                    meetLink={perfil.meet_link}
                  />
                </div>
              </DraggableBlock>
            )

            if (bloqueId === 'herramientas') return (
              <DraggableBlock key="herramientas" {...dndProps}>
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-foreground mb-3">Herramientas</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-stretch">
                    <CalculadoraPlazos />
                    <CalendarioPartner />
                  </div>
                </div>
              </DraggableBlock>
            )

            if (bloqueId === 'gestion') return (
              <DraggableBlock key="gestion" {...dndProps}>
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-foreground mb-3">Gestión</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
                    <Link href="/partner/casos" className="block h-full">
                      <Card className="group border-border hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer select-none h-full">
                        <CardContent className="p-5 h-full flex flex-col">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-11 h-11 rounded-xl bg-muted group-hover:bg-muted/60 transition-colors flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">Mis Casos</p>
                              <p className="text-xs text-muted-foreground">Portales y seguimiento de casos</p>
                            </div>
                          </div>
                          <div className="space-y-1.5 flex-1">
                            {[
                              { label: 'Casos activos',       sub: 'Casos con portal del cliente abierto' },
                              { label: 'Timeline con IA',     sub: 'Generá etapas con inteligencia artificial' },
                              { label: 'Invitación al portal', sub: 'Enviá el link de acceso al cliente' },
                            ].map(item => (
                              <div
                                key={item.label}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border group-hover:border-foreground/10 group-hover:bg-muted/30 transition-all text-left"
                              >
                                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground leading-snug">{item.label}</p>
                                  <p className="text-xs text-muted-foreground leading-snug">{item.sub}</p>
                                </div>
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">→</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                    <Link href="/partner/cobros" className="block h-full">
                      <Card className="group border-border hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer select-none h-full">
                        <CardContent className="p-5 h-full flex flex-col">
                          {/* Header igual al MarketplaceServiciosCard */}
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-11 h-11 rounded-xl bg-muted group-hover:bg-muted/60 transition-colors flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">Gestor de Cobros</p>
                              <p className="text-xs text-muted-foreground">Honorarios, cuotas y litigios</p>
                            </div>
                          </div>

                          {/* Items de navegación — espejo visual del Marketplace */}
                          <div className="space-y-1.5 flex-1">
                            {[
                              { label: 'Cobros pendientes',  sub: 'Honorarios y cuotas por cobrar' },
                              { label: 'Cobros parciales',   sub: 'Pagos incompletos en seguimiento' },
                              { label: 'Historial completo', sub: 'Todos los movimientos registrados' },
                            ].map(item => (
                              <div
                                key={item.label}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border group-hover:border-foreground/10 group-hover:bg-muted/30 transition-all text-left"
                              >
                                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground leading-snug">{item.label}</p>
                                  <p className="text-xs text-muted-foreground leading-snug">{item.sub}</p>
                                </div>
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">→</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                    <MarketplaceServiciosCard onIniciarTramite={iniciarNuevoCliente} onIniciarNDA={() => setMostrarNDA(true)} onIniciarTYC={() => setMostrarTYC(true)} onIniciarPP={() => setMostrarPP(true)} onIniciarART9={() => setMostrarART9(true)} onIniciarGANANCIAS={() => setMostrarGANANCIAS(true)} />
                  </div>
                </div>
              </DraggableBlock>
            )

            if (bloqueId === 'clientes') return (
              <DraggableBlock key="clientes" {...dndProps}>
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-semibold text-foreground">
                      Mis Clientes{clientes.length > 0 && <span className="text-muted-foreground font-normal ml-1.5">({clientes.length})</span>}
                    </h2>
                    <Button onClick={() => iniciarNuevoCliente()} size="sm">
                      + Nuevo cliente
                    </Button>
                  </div>

                  {mostrarForm && (
                    <NuevoClienteForm
                      partnerId={perfil.id}
                      initialTipo={tipoFormInicial}
                      onClose={() => setMostrarForm(false)}
                    />
                  )}

                  {clientes.length === 0 && !mostrarForm ? (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <p className="text-muted-foreground text-sm">No tenés clientes registrados todavía.</p>
                        <button onClick={() => setMostrarForm(true)} className="mt-3 text-sm text-foreground hover:underline font-medium">
                          Crear el primero →
                        </button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2.5">
                      {clientes.map(cliente => {
                        const tramite = tramitePorCliente[cliente.id]
                        const expandido = clienteExpandido === cliente.id
                        return (
                          <Card key={cliente.id} className="overflow-hidden">
                            <div className="p-5 flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm">{cliente.nombre}</p>
                                <p className="text-xs text-muted-foreground">{cliente.email}</p>
                              </div>
                              {tramite ? (
                                <div className="flex items-center gap-3">
                                  <span className={cn('text-xs font-medium px-2.5 py-1 rounded-md border', BADGE_TIPO[tramite.tipo].className)}>
                                    {BADGE_TIPO[tramite.tipo].label}
                                  </span>
                                  <EtapaIndicador tramite={tramite} />
                                  <Button variant="ghost" size="sm" onClick={() => setClienteExpandido(expandido ? null : cliente.id)} className="text-xs">
                                    {expandido ? 'Ocultar' : 'Ver timeline'}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sin trámite</span>
                              )}
                            </div>
                            {expandido && tramite && (
                              <>
                                <Separator />
                                <div className="px-5 py-4 bg-muted/30">
                                  <Timeline tramite={tramite} etapas={etapas} />
                                </div>
                              </>
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              </DraggableBlock>
            )

            return null
          })}
        </div>
      </main>
    </div>
  )
}

// ── Indicador de etapa ────────────────────────────────────────
function EtapaIndicador({ tramite }: { tramite: Tramite }) {
  const max = ETAPA_MAX[tramite.tipo]
  const pct = Math.round((tramite.etapa_numero / max) * 100)
  const finalizado = tramite.etapa_numero === max

  return (
    <div className="hidden sm:flex flex-col items-end gap-1.5 w-28">
      <p className="text-xs text-muted-foreground">Etapa {tramite.etapa_numero}/{max}</p>
      <Progress value={pct} className={finalizado ? '[&>div]:bg-foreground' : '[&>div]:bg-foreground/40'} />
    </div>
  )
}

// ── Timeline ───────────────────────────────────────────────────
function Timeline({ tramite, etapas }: { tramite: Tramite; etapas: Etapa[] }) {
  const etapasTipo = etapas.filter(e => e.tipo === tramite.tipo)

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado del trámite</p>
      <div className="relative">
        <div className="absolute left-2.5 top-3 bottom-3 w-px bg-border" />
        <div className="space-y-3.5">
          {etapasTipo.map(etapa => {
            const hecha    = etapa.numero < tramite.etapa_numero
            const activa   = etapa.numero === tramite.etapa_numero
            const pendiente = etapa.numero > tramite.etapa_numero

            return (
              <div key={etapa.numero} className="flex items-start gap-4 relative">
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 bg-background z-10',
                  hecha  ? 'border-foreground bg-foreground' :
                  activa ? 'border-foreground bg-foreground' :
                  'border-border'
                )}>
                  {hecha && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {activa && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                </div>
                <div className={cn('pb-1', pendiente && 'opacity-40')}>
                  <p className={cn(
                    'text-sm font-medium',
                    activa ? 'text-foreground' : hecha ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {etapa.numero}. {etapa.descripcion}
                  </p>
                  {activa && <span className="text-xs text-muted-foreground font-medium">← Etapa actual</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Formulario nuevo cliente ───────────────────────────────────
function NuevoClienteForm({ partnerId, initialTipo = 'MARCAS', onClose }: { partnerId: string; initialTipo?: 'MARCAS' | 'DNDA' | 'SAS'; onClose: () => void }) {
  const router = useRouter()
  const [paso, setPaso] = useState<'datos' | 'marcas' | 'dnda' | 'sas'>('datos')
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: generarPassword(),
    tipo: initialTipo as 'MARCAS' | 'DNDA' | 'SAS',
  })

  const [nombreMarca, setNombreMarca] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [clasesNiza, setClasesNiza] = useState<ClaseNiza[]>([])
  const [clasesPersonalizadas, setClasesPersonalizadas] = useState<ClaseNiza[]>([])
  const [honorariosPorClase, setHonorariosPorClase] = useState(HONORARIOS_RECOMENDADOS)
  const [clasificando, setClasificando] = useState(false)
  const [yaClasifique, setYaClasifique] = useState(false)
  const [claseErrorMsg, setClaseErrorMsg] = useState('')
  const [inputClaseNum, setInputClaseNum] = useState('')
  const [mostrarInputClase, setMostrarInputClase] = useState(false)

  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const [honorariosDNDA, setHonorariosDNDA] = useState(HONORARIOS_RECOMENDADOS_DNDA)
  const [honorariosSAS, setHonorariosSAS] = useState(HONORARIOS_RECOMENDADOS_SAS)

  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{
    email: string; password: string; emailEnviado: boolean; tramiteId: string; emailError?: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  const todasLasClases = [...clasesNiza, ...clasesPersonalizadas]
  const numClases = todasLasClases.length
  const totalHonorarios = honorariosPorClase * numClases
  const totalArancel = ARANCEL_INPI_POR_CLASE * numClases
  const totalPropuesta = totalHonorarios + totalArancel

  function ars(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    if (e.target.name === 'tipo') setPaso('datos')
  }

  function handleSiguiente(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.nombre || !form.email) { setError('Nombre y email son obligatorios.'); return }
    if (form.tipo === 'MARCAS') setPaso('marcas')
    else if (form.tipo === 'DNDA') setPaso('dnda')
    else if (form.tipo === 'SAS') setPaso('sas')
    else handleSubmitFinal()
  }

  const clasificar = useCallback(async (texto: string) => {
    if (texto.trim().length < 10) return
    setClasificando(true); setYaClasifique(false); setClaseErrorMsg('')
    try {
      const res = await fetch('/api/clasificar-niza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion: texto }),
      })
      const data = await res.json()
      if (data.clases?.length > 0) { setClasesNiza(data.clases); setClaseErrorMsg('') }
      else if (data.sinApiKey) { setClaseErrorMsg('Clasificación automática no disponible. Agregá las clases manualmente.'); setMostrarInputClase(true) }
      else { setClaseErrorMsg('No se encontraron clases sugeridas. Podés agregarlas manualmente.'); setMostrarInputClase(true) }
    } catch { setClaseErrorMsg('Error al clasificar. Podés agregar las clases manualmente.'); setMostrarInputClase(true) }
    finally { setClasificando(false); setYaClasifique(true) }
  }, [])

  useEffect(() => {
    if (descripcion.trim().length < 15 || paso !== 'marcas') return
    const timer = setTimeout(() => clasificar(descripcion), 1500)
    return () => clearTimeout(timer)
  }, [descripcion, clasificar, paso])

  function toggleGrabacion() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Tu navegador no soporta reconocimiento de voz. Usá Chrome.'); return
    }
    if (grabando) { recognitionRef.current?.stop(); setGrabando(false); return }
    const SpeechRecognitionAPI =
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
      || window.SpeechRecognition
    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onstart = () => { setGrabando(true); setTranscribiendo(true) }
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let texto = ''
      for (let i = 0; i < event.results.length; i++) texto += event.results[i][0].transcript
      setDescripcion(texto)
    }
    recognition.onend = () => { setGrabando(false); setTranscribiendo(false) }
    recognition.onerror = () => { setGrabando(false); setTranscribiendo(false) }
    recognitionRef.current = recognition
    recognition.start()
  }

  function quitarClaseSugerida(numero: number) { setClasesNiza(prev => prev.filter(c => c.numero !== numero)) }
  function quitarClasePersonalizada(numero: number) { setClasesPersonalizadas(prev => prev.filter(c => c.numero !== numero)) }

  function handleAgregarClaseManual(e: React.FormEvent) {
    e.preventDefault()
    const num = parseInt(inputClaseNum)
    if (isNaN(num) || num < 1 || num > 45) { setClaseErrorMsg('El número de clase debe ser entre 1 y 45.'); return }
    if (todasLasClases.some(c => c.numero === num)) { setClaseErrorMsg(`La clase ${num} ya está agregada.`); return }
    setClasesPersonalizadas(prev => [...prev, { numero: num, nombre: `Clase ${num}` }])
    setInputClaseNum(''); setClaseErrorMsg('')
  }

  function handleSubmitFinal() {
    setError('')
    if (form.tipo === 'MARCAS') {
      if (!nombreMarca.trim()) { setError('El nombre de la marca es obligatorio.'); return }
      if (!descripcion.trim()) { setError('La descripción de productos/servicios es obligatoria.'); return }
      if (numClases === 0) { setError('Agregá al menos una clase de Niza antes de continuar.'); return }
    }
    startTransition(async () => {
      const datosPropuesta = form.tipo === 'MARCAS' ? {
        nombre_marca: nombreMarca, descripcion_productos_servicios: descripcion,
        clases_niza: todasLasClases, num_clases: numClases,
        honorarios_por_clase: honorariosPorClase, arancel_inpi_por_clase: ARANCEL_INPI_POR_CLASE,
        total_honorarios: totalHonorarios, total_arancel: totalArancel, total_propuesta: totalPropuesta,
      } : undefined

      const datosPropuestaDNDA: DatosPropuestaDNDA | undefined = form.tipo === 'DNDA' ? {
        honorarios: honorariosDNDA, corte_zonda: CORTE_ZONDA_DNDA, arancel_dnda: ARANCEL_DNDA,
        envio_postal: ENVIO_POSTAL_DNDA, soporte: SOPORTE_DNDA,
        total_propuesta: honorariosDNDA + GASTOS_FIJOS_DNDA,
      } : undefined

      const datosPropuestaSAS: DatosPropuestaSAS | undefined = form.tipo === 'SAS' ? {
        honorarios: honorariosSAS, corte_zonda: CORTE_ZONDA_SAS,
        gastos_constitucion: GASTOS_CONSTITUCION_SAS, gastos_rubrica: GASTOS_RUBRICA_SAS,
        total_propuesta: honorariosSAS + GASTOS_CONSTITUCION_SAS,
      } : undefined

      const result = await crearCliente({ ...form, partnerId, datosPropuesta, datosPropuestaDNDA, datosPropuestaSAS })
      if (result.error) { setError(result.error) }
      else {
        setResultado({ email: form.email, password: form.password,
          emailEnviado: result.emailEnviado ?? false, tramiteId: result.tramiteId ?? '', emailError: result.emailError })
        router.refresh()
      }
    })
  }

  // ── Vista de éxito ─────────────────────────────────────────
  if (resultado) {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const esDNDA   = form.tipo === 'DNDA'
    const esMARCAS = form.tipo === 'MARCAS'
    const esSAS    = form.tipo === 'SAS'

    const propuestaUrl = resultado.tramiteId
      ? esDNDA   ? `${appUrl}/api/generar-propuesta-dnda?tramiteId=${resultado.tramiteId}`
      : esMARCAS ? `${appUrl}/api/generar-propuesta?tramiteId=${resultado.tramiteId}`
      : esSAS    ? `${appUrl}/api/generar-propuesta-sas?tramiteId=${resultado.tramiteId}`
      : null : null

    const mensajeWA = esDNDA
      ? `Hola ${form.nombre}! Te compartimos la propuesta para el registro de derechos de autor (DNDA).\n\n${propuestaUrl ? `Podés descargarla desde:\n${propuestaUrl}\n\n` : ''}Para avanzar, ingresá al portal:\nEmail: ${resultado.email}\nContraseña: ${resultado.password}\n\nEsta contraseña es temporal.`
      : esSAS
      ? `Hola ${form.nombre}! Te compartimos la propuesta para la constitución de tu SAS.\n\n${propuestaUrl ? `Podés descargarla desde:\n${propuestaUrl}\n\n` : ''}Para avanzar, ingresá al portal:\nEmail: ${resultado.email}\nContraseña: ${resultado.password}\n\nEsta contraseña es temporal.`
      : `Hola ${form.nombre}! Te compartimos la propuesta para el registro de la marca "${nombreMarca}".\n\n${propuestaUrl ? `Podés descargarla desde:\n${propuestaUrl}\n\n` : ''}Para avanzar, ingresá al portal:\nEmail: ${resultado.email}\nContraseña: ${resultado.password}\n\nEsta contraseña es temporal.`

    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(mensajeWA)}`

    return (
      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-sm font-semibold text-foreground">✓ Cliente creado con éxito</p>
              <p className="text-xs text-muted-foreground mt-0.5">{form.nombre} · {form.email}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>

          {/* Propuesta */}
          {(esMARCAS || esDNDA || esSAS) && (
            <div className="bg-muted/50 rounded-lg p-4 mb-4 border border-border">
              <p className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">Propuesta generada</p>
              <div className="flex flex-wrap gap-2">
                {propuestaUrl && (
                  <a href={propuestaUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" asChild>
                      <span>↓ Descargar PDF</span>
                    </Button>
                  </a>
                )}
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.522 5.855L.057 23.882a.5.5 0 00.61.61l6.028-1.465A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.177-1.431l-.37-.22-3.832.931.95-3.821-.241-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    Enviar por WhatsApp
                  </Button>
                </a>
              </div>
              {resultado.emailEnviado ? (
                <p className="text-xs text-muted-foreground mt-2.5">✓ Propuesta enviada al email del cliente</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2.5">
                  ⚠ Email no enviado.{resultado.emailError ? ` ${resultado.emailError}` : ' Usá WhatsApp para compartir.'}
                </p>
              )}
            </div>
          )}

          {/* Credenciales */}
          <div className="bg-muted rounded-lg p-4 mb-4">
            <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Credenciales de acceso al portal</p>
            <div className="space-y-1">
              <p className="text-sm text-foreground">Email: <span className="font-medium">{resultado.email}</span></p>
              <p className="text-sm text-foreground">Contraseña temporal: <span className="font-medium">{resultado.password}</span></p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Al ingresar por primera vez, el cliente podrá elegir su propia contraseña.</p>
          <Button onClick={onClose} size="sm">Listo, cerrar</Button>
        </CardContent>
      </Card>
    )
  }

  // ── Paso 1: Datos básicos del cliente ──────────────────────
  if (paso === 'datos') {
    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">Nuevo cliente</CardTitle>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSiguiente} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nombre">Nombre del cliente <span className="text-destructive">*</span></Label>
                <Input id="nombre" name="nombre" type="text" value={form.nombre} onChange={handleChange}
                  placeholder="Ej: Juan Pérez / Heladería El Pibe SRL" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email del cliente <span className="text-destructive">*</span></Label>
                <Input id="email" name="email" type="email" value={form.email} onChange={handleChange}
                  placeholder="cliente@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipo">Servicio contratado <span className="text-destructive">*</span></Label>
                <Select id="tipo" name="tipo" value={form.tipo} onChange={handleChange}>
                  <option value="MARCAS">Registro de Marca</option>
                  <option value="DNDA">Registro de Obra (DNDA)</option>
                  <option value="SAS">Constitución de Sociedad (SAS)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña temporal</Label>
                <div className="flex gap-2">
                  <Input id="password" name="password" type="text" value={form.password} onChange={handleChange} />
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setForm(p => ({ ...p, password: generarPassword() }))}>
                    Generar
                  </Button>
                </div>
              </div>
            </div>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="flex gap-3 pt-1">
              <Button type="submit">
                {form.tipo === 'MARCAS' ? 'Siguiente: datos de la marca →' : 'Siguiente: honorarios →'}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  // ── Paso 2b: Honorarios DNDA ──────────────────────────────
  if (paso === 'dnda') {
    const totalDNDA = honorariosDNDA + GASTOS_FIJOS_DNDA
    const tuParte   = honorariosDNDA - CORTE_ZONDA_DNDA

    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <button onClick={() => setPaso('datos')} className="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1">← Volver</button>
              <CardTitle className="text-base">Honorarios DNDA — {form.nombre}</CardTitle>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-5">Los datos específicos de la obra los completará el cliente en el portal.</p>
          <div className="space-y-5">
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-medium text-foreground">Honorarios profesionales</p>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Monto que paga el cliente</span>
                  <span className="text-base font-bold text-foreground">{ars(honorariosDNDA)}</span>
                </div>
                <input type="range" min={100000} max={1500000} step={10000}
                  value={honorariosDNDA} onChange={e => setHonorariosDNDA(Number(e.target.value))}
                  className="w-full accent-foreground" />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>$100k</span>
                  <span className="font-medium">Sugerido: {ars(HONORARIOS_RECOMENDADOS_DNDA)}</span>
                  <span>$1.5M</span>
                </div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-border">
                  <span>Concepto</span><span>Monto</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tu parte (honorarios netos)</span><span className="font-semibold text-foreground font-bold">{ars(tuParte)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Corte Zonda Legal</span><span>{ars(CORTE_ZONDA_DNDA)}</span></div>
                <Separator />
                <div className="flex justify-between text-muted-foreground"><span>Arancel oficial DNDA</span><span>{ars(ARANCEL_DNDA)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Envío postal</span><span>{ars(ENVIO_POSTAL_DNDA)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Soporte para el envío</span><span>{ars(SOPORTE_DNDA)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-foreground text-base">
                  <span>Total para el cliente</span><span>{ars(totalDNDA)}</span>
                </div>
              </div>
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex gap-3 pt-1">
              <Button disabled={isPending} onClick={handleSubmitFinal}>
                {isPending ? 'Creando y enviando...' : '✓ Crear cliente y enviar propuesta'}
              </Button>
              <Button variant="outline" onClick={() => setPaso('datos')}>Atrás</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Paso 2c: Honorarios SAS ───────────────────────────────
  if (paso === 'sas') {
    const totalSAS   = honorariosSAS + GASTOS_CONSTITUCION_SAS
    const tuParteSAS = honorariosSAS - CORTE_ZONDA_SAS
    const TASA_CONST = 330_000; const TASA_RES = 27_000; const CAJA_FOR = 31_000

    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <button onClick={() => setPaso('datos')} className="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1">← Volver</button>
              <CardTitle className="text-base">Honorarios SAS — {form.nombre}</CardTitle>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-5">El cliente completará todos los datos de la sociedad en el portal.</p>
          <div className="space-y-5">
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-medium text-foreground">Honorarios profesionales</p>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Monto que paga el cliente</span>
                  <span className="text-base font-bold text-foreground">{ars(honorariosSAS)}</span>
                </div>
                <input type="range" min={200000} max={3000000} step={50000}
                  value={honorariosSAS} onChange={e => setHonorariosSAS(Number(e.target.value))}
                  className="w-full accent-foreground" />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>$200k</span>
                  <span className="font-medium">Sugerido: {ars(HONORARIOS_RECOMENDADOS_SAS)}</span>
                  <span>$3M</span>
                </div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-border">
                  <span>Concepto</span><span>Monto</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tu parte (honorarios netos)</span><span className="font-semibold text-foreground">{ars(tuParteSAS)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Corte Zonda Legal</span><span>{ars(CORTE_ZONDA_SAS)}</span></div>
                <Separator />
                <p className="text-xs font-medium text-foreground">Gastos de constitución (a cargo del cliente)</p>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Tasa constitución SAS (cód. 840)</span><span>{ars(TASA_CONST)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Tasa reserva denominación (cód. 833)</span><span>{ars(TASA_RES)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Aporte Caja Forense</span><span>{ars(CAJA_FOR)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-foreground text-base">
                  <span>Total Etapa 1 (adelanto)</span><span>{ars(totalSAS)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Rúbrica de libros (~{ars(GASTOS_RUBRICA_SAS)}) se abona al finalizar.</p>
              </div>
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex gap-3 pt-1">
              <Button disabled={isPending} onClick={handleSubmitFinal}>
                {isPending ? 'Creando y enviando...' : '✓ Crear cliente y enviar propuesta'}
              </Button>
              <Button variant="outline" onClick={() => setPaso('datos')}>Atrás</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Paso 2: Datos de la marca (MARCAS) ────────────────────
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <button onClick={() => setPaso('datos')} className="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1">← Volver</button>
            <CardTitle className="text-base">Datos de la marca — {form.nombre}</CardTitle>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-5">Esta información generará la propuesta y se enviará al cliente.</p>
        <div className="space-y-5">

          {/* Nombre marca */}
          <div className="space-y-1.5">
            <Label>Nombre de la marca <span className="text-destructive">*</span></Label>
            <Input type="text" value={nombreMarca} onChange={e => setNombreMarca(e.target.value)}
              placeholder="Ej: Heladería El Pibe, TechSoluciones..." />
          </div>

          {/* Descripción + audio */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>¿Qué hace el cliente con esta marca? <span className="text-destructive">*</span></Label>
              <button type="button" onClick={toggleGrabacion}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors border',
                  grabando
                    ? 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse'
                    : 'bg-background border-input hover:bg-accent text-muted-foreground'
                )}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                {grabando ? 'Detener' : 'Grabar audio'}
              </button>
            </div>
            {transcribiendo && <p className="text-xs text-muted-foreground flex items-center gap-1"><span className="inline-block w-2 h-2 bg-destructive rounded-full animate-ping" />Transcribiendo...</p>}
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
              placeholder="Ej: Heladería artesanal, venta de helados y productos de confitería..."
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" />
            <p className="text-xs text-muted-foreground">
              {clasificando ? '🔍 Clasificando...' : descripcion.length > 14 && !yaClasifique && !clasificando ? 'Clasificación automática en curso...' : ''}
            </p>
          </div>

          {/* Clases Niza */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>
                Clases de Niza
                {numClases > 0 && <Badge variant="secondary" className="ml-2">{numClases} clase{numClases !== 1 ? 's' : ''}</Badge>}
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarInputClase(v => !v)}>
                + Agregar manual
              </Button>
            </div>

            {clasificando && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Clasificando automáticamente...
              </div>
            )}

            {claseErrorMsg && (
              <Alert className="mb-2"><AlertDescription>{claseErrorMsg}</AlertDescription></Alert>
            )}

            {!clasificando && todasLasClases.length === 0 && descripcion.length > 14 && !yaClasifique && (
              <div className="flex items-center gap-2 mb-2">
                <Button type="button" variant="outline" size="sm" onClick={() => clasificar(descripcion)}>
                  🔍 Clasificar ahora
                </Button>
                <span className="text-xs text-muted-foreground">o agregá clases manualmente</span>
              </div>
            )}

            {todasLasClases.length > 0 && (
              <div className="space-y-2 mb-2">
                {clasesNiza.map(c => (
                  <div key={c.numero} className="flex items-start gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Clase {c.numero}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.nombre}</p>
                      {c.motivo && <p className="text-xs text-muted-foreground italic">{c.motivo}</p>}
                    </div>
                    <button type="button" onClick={() => quitarClaseSugerida(c.numero)}
                      className="text-muted-foreground hover:text-destructive text-lg leading-none shrink-0">×</button>
                  </div>
                ))}
                {clasesPersonalizadas.map(c => (
                  <div key={c.numero} className="flex items-start gap-2 bg-muted border border-border rounded-lg px-3 py-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Clase {c.numero}</p>
                      <p className="text-xs text-muted-foreground">Agregada manualmente</p>
                    </div>
                    <button type="button" onClick={() => quitarClasePersonalizada(c.numero)}
                      className="text-muted-foreground hover:text-destructive text-lg leading-none shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}

            {mostrarInputClase && (
              <form onSubmit={handleAgregarClaseManual} className="flex gap-2 mt-2 p-3 bg-muted border border-border rounded-lg">
                <div className="flex-1">
                  <Label className="text-xs mb-1 block">Número de clase (1–45)</Label>
                  <Input type="number" min={1} max={45} value={inputClaseNum}
                    onChange={e => setInputClaseNum(e.target.value)} placeholder="Ej: 35" />
                </div>
                <div className="flex flex-col justify-end">
                  <Button type="submit" size="sm">Agregar</Button>
                </div>
              </form>
            )}
          </div>

          {/* Honorarios MARCAS */}
          {numClases > 0 && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Honorarios</p>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Honorarios por clase</span>
                  <span className="text-sm font-semibold text-foreground">{ars(honorariosPorClase)}</span>
                </div>
                <input type="range" min={50000} max={600000} step={10000}
                  value={honorariosPorClase} onChange={e => setHonorariosPorClase(Number(e.target.value))}
                  className="w-full accent-foreground" />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>$50k</span>
                  <span className="font-medium">Recomendado: {ars(HONORARIOS_RECOMENDADOS)}</span>
                  <span>$600k</span>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Honorarios ({numClases} clase{numClases !== 1 ? 's' : ''})</span>
                  <span className="font-medium text-foreground">{ars(totalHonorarios)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Arancel INPI ({numClases} × {ars(ARANCEL_INPI_POR_CLASE)})</span>
                  <span className="font-medium text-foreground">{ars(totalArancel)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Total propuesta</span><span>{ars(totalPropuesta)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Corte Zonda: {ars(CORTE_ZONDA_POR_CLASE * numClases)} · Neto partner: {ars(totalHonorarios - CORTE_ZONDA_POR_CLASE * numClases)}</p>
              </div>
            </div>
          )}

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="flex gap-3 pt-1">
            <Button disabled={isPending} onClick={handleSubmitFinal}>
              {isPending ? 'Creando y enviando...' : '✓ Crear cliente y enviar propuesta'}
            </Button>
            <Button variant="outline" onClick={() => setPaso('datos')}>Atrás</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── DraggableBlock ─────────────────────────────────────────────────────────────
function DraggableBlock({
  id,
  editMode,
  isDragOver,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: {
  id:          BloqueId
  editMode:    boolean
  isDragOver:  boolean
  isDragging:  boolean
  onDragStart: (id: BloqueId) => void
  onDragOver:  (e: DragEvent, id: BloqueId) => void
  onDrop:      (e: DragEvent, id: BloqueId) => void
  onDragEnd:   () => void
  children:    React.ReactNode
}) {
  const BLOQUE_LABEL: Record<BloqueId, string> = {
    asistente:    'Asistente IA',
    briefing:     'Agenda del día',
    herramientas: 'Herramientas',
    gestion:      'Gestión',
    clientes:     'Mis Clientes',
  }

  return (
    <div
      draggable={editMode}
      onDragStart={() => onDragStart(id)}
      onDragOver={(e) => onDragOver(e, id)}
      onDrop={(e) => onDrop(e, id)}
      onDragEnd={onDragEnd}
      className={cn(
        'relative transition-all duration-200 rounded-xl',
        editMode    && 'cursor-grab active:cursor-grabbing',
        isDragging  && 'opacity-30 scale-[0.99]',
        isDragOver  && 'ring-2 ring-foreground/25 ring-offset-2 bg-muted/20',
      )}
    >
      {/* Handle visible solo en modo edición */}
      {editMode && (
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-foreground text-primary-foreground rounded-full px-3 py-1 shadow-md select-none pointer-events-none">
          {/* Drag dots icon */}
          <svg className="w-3 h-3 opacity-70" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9"  cy="5"  r="1.5"/>
            <circle cx="15" cy="5"  r="1.5"/>
            <circle cx="9"  cy="12" r="1.5"/>
            <circle cx="15" cy="12" r="1.5"/>
            <circle cx="9"  cy="19" r="1.5"/>
            <circle cx="15" cy="19" r="1.5"/>
          </svg>
          <span className="text-[10px] font-medium tracking-wide">{BLOQUE_LABEL[id]}</span>
        </div>
      )}

      {/* Indent top para que el handle no tape el contenido */}
      <div className={editMode ? 'pt-5' : ''}>
        {children}
      </div>
    </div>
  )
}

// ── MarketplaceServiciosCard ───────────────────────────────────────────────────
const SERVICIOS_ZONDA = [
  {
    tipo:  'MARCAS' as const,
    label: 'Registro de Marca',
    sub:   'INPI · Protección nacional e internacional',
    icon: (
      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
      </svg>
    ),
  },
  {
    tipo:  'SAS' as const,
    label: 'Constitución de SAS',
    sub:   'IGJ · Sociedad por Acciones Simplificada',
    icon: (
      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  {
    tipo:  'DNDA' as const,
    label: 'Derechos de Autor',
    sub:   'DNDA · Registro de obras intelectuales',
    icon: (
      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
]

const NDA_ICONO = (
  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
)

const TYC_ICONO = (
  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
)

const PP_ICONO = (
  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
  </svg>
)

function ServicioBtn({
  icon, label, sub, onClick,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-foreground/20 hover:bg-muted/50 transition-all text-left group"
    >
      <div className="w-7 h-7 rounded-md bg-muted group-hover:bg-background transition-colors flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug">{label}</p>
        <p className="text-xs text-muted-foreground leading-snug">{sub}</p>
      </div>
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">→</span>
    </button>
  )
}

function MarketplaceServiciosCard({
  onIniciarTramite,
  onIniciarNDA,
  onIniciarTYC,
  onIniciarPP,
  onIniciarART9,
  onIniciarGANANCIAS,
}: {
  onIniciarTramite: (tipo: 'MARCAS' | 'DNDA' | 'SAS') => void
  onIniciarNDA: () => void
  onIniciarTYC: () => void
  onIniciarPP: () => void
  onIniciarART9: () => void
  onIniciarGANANCIAS: () => void
}) {
  const [showTodos, setShowTodos] = useState(false)

  // Solo los primeros 2 en la tarjeta
  const serviciosVisibles = SERVICIOS_ZONDA.slice(0, 2)

  return (
    <>
      <Card>
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016 2.993 2.993 0 0 0 2.25-1.016 3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Servicios Zonda Legal</p>
              <p className="text-xs text-muted-foreground">Iniciá un trámite para un cliente</p>
            </div>
          </div>

          {/* Los 2 primeros servicios + botón Ver todos */}
          <div className="space-y-1.5">
            {serviciosVisibles.map(s => (
              <ServicioBtn
                key={s.tipo}
                icon={s.icon}
                label={s.label}
                sub={s.sub}
                onClick={() => onIniciarTramite(s.tipo)}
              />
            ))}

            {/* Ver todos */}
            <button
              onClick={() => setShowTodos(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-foreground/30 hover:bg-muted/30 transition-all text-left group"
            >
              <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5M3.75 18h16.5" />
              </svg>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                Ver todos los servicios
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Modal — todos los servicios */}
      {showTodos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowTodos(false) }}
        >
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-base font-semibold text-foreground">Todos los servicios</p>
                <p className="text-xs text-muted-foreground">Seleccioná el trámite a iniciar</p>
              </div>
              <button
                onClick={() => setShowTodos(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
              >✕</button>
            </div>

            <div className="space-y-1.5">
              {SERVICIOS_ZONDA.map(s => (
                <ServicioBtn
                  key={s.tipo}
                  icon={s.icon}
                  label={s.label}
                  sub={s.sub}
                  onClick={() => { setShowTodos(false); onIniciarTramite(s.tipo) }}
                />
              ))}
              <ServicioBtn
                icon={NDA_ICONO}
                label="Acuerdo de Confidencialidad"
                sub="NDA · Redacción a medida · 24hs / 3 días / 5 días"
                onClick={() => { setShowTodos(false); onIniciarNDA() }}
              />
              <ServicioBtn
                icon={TYC_ICONO}
                label="Términos y Condiciones"
                sub="TyC · Redacción a medida · 24hs / 3 días / 5 días"
                onClick={() => { setShowTodos(false); onIniciarTYC() }}
              />
              <ServicioBtn
                icon={PP_ICONO}
                label="Políticas de Privacidad"
                sub="PP · Redacción a medida · 24hs / 3 días / 5 días"
                onClick={() => { setShowTodos(false); onIniciarPP() }}
              />
              <ServicioBtn
                icon="⚖️"
                label="Amparo Art. 9 Ley 24.463"
                sub="Para jubilados docentes · Descuento ilegal ANSES"
                onClick={() => { setShowTodos(false); onIniciarART9() }}
              />
              <ServicioBtn
                icon="🏛️"
                label="Amparo Impuesto a las Ganancias"
                sub="Inconstitucionalidad art. 82 inc c) · ARCA"
                onClick={() => { setShowTodos(false); onIniciarGANANCIAS() }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── PerfilDropdown (header) ────────────────────────────────────────────────────
function PerfilDropdown({ perfil: initialPerfil, onSignOut }: { perfil: Perfil; onSignOut: () => void }) {
  const [open,      setOpen]      = useState(false)
  const [editando,  setEditando]  = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [savedOk,   setSavedOk]   = useState(false)
  const [error,     setError]     = useState('')
  const [form, setForm] = useState({
    whatsapp:  initialPerfil.whatsapp_link ?? '',
    telefono:  initialPerfil.telefono      ?? '',
    meet_link: initialPerfil.meet_link     ?? '',
  })
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setEditando(false)
        setError('')
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSavedOk(false); setGuardando(true)
    try {
      const res = await fetch('/api/partner/update-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
      setSavedOk(true)
      setEditando(false)
      setTimeout(() => setSavedOk(false), 3000)
    } catch {
      setError('Error de red. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  // Iniciales para el avatar
  const iniciales = initialPerfil.nombre
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div ref={dropdownRef} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => { setOpen(o => !o); setEditando(false); setError('') }}
        className={cn(
          'w-8 h-8 rounded-full border flex items-center justify-center text-xs font-semibold transition-colors select-none',
          open
            ? 'bg-foreground text-primary-foreground border-foreground'
            : 'bg-muted text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
        )}
        title={initialPerfil.nombre}
      >
        {iniciales || (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 w-72 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">

          {/* User info */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground truncate">{initialPerfil.nombre}</p>
            <p className="text-xs text-muted-foreground truncate">{initialPerfil.email}</p>
          </div>

          {/* Perfil section */}
          <div className="px-4 py-3 border-b border-border">
            {!editando ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground mb-0.5">Mi perfil</p>
                  <p className="text-xs text-muted-foreground">
                    {form.whatsapp ? `WhatsApp: ${form.whatsapp}` : 'Sin WhatsApp configurado'}
                  </p>
                </div>
                <button
                  onClick={() => setEditando(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {savedOk ? '✓ Guardado' : 'Editar →'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleGuardar} className="space-y-2.5">
                <p className="text-xs font-medium text-foreground mb-1">Editar perfil</p>

                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    WhatsApp <span className="normal-case">(sin + ni espacios)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="5491123456789"
                    value={form.whatsapp}
                    onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                    className="mt-1 w-full text-xs rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Teléfono</label>
                  <input
                    type="tel"
                    placeholder="+54 11 2345-6789"
                    value={form.telefono}
                    onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                    className="mt-1 w-full text-xs rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Link de reunión</label>
                  <input
                    type="url"
                    placeholder="https://meet.google.com/..."
                    value={form.meet_link}
                    onChange={e => setForm(p => ({ ...p, meet_link: e.target.value }))}
                    className="mt-1 w-full text-xs rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>

                {error && <p className="text-[10px] text-destructive">{error}</p>}

                <div className="flex gap-2 pt-0.5">
                  <button
                    type="submit"
                    disabled={guardando}
                    className="flex-1 text-xs font-medium bg-foreground text-primary-foreground rounded-md py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {guardando ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditando(false); setError('') }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Sign out */}
          <div className="px-4 py-2.5">
            <button
              onClick={onSignOut}
              className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PerfilPartner ──────────────────────────────────────────────────────────────
function PerfilPartner({ perfil: initialPerfil }: { perfil: Perfil }) {
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [form, setForm] = useState({
    whatsapp:  initialPerfil.whatsapp_link ?? '',
    telefono:  initialPerfil.telefono      ?? '',
    meet_link: initialPerfil.meet_link     ?? '',
  })

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSavedOk(false); setGuardando(true)
    try {
      const res = await fetch('/api/partner/update-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
      setSavedOk(true)
      setEditando(false)
      setTimeout(() => setSavedOk(false), 3000)
    } catch {
      setError('Error de red. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>

          {/* Collapsed view */}
          {!editando ? (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Mi Perfil</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.whatsapp
                    ? `WhatsApp: +${form.whatsapp.replace(/^\+/, '')}`
                    : 'Sin WhatsApp configurado'}
                </p>
                {!form.whatsapp && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Necesario para recibir el resumen de agenda
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditando(true)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {savedOk ? '✓ Guardado' : 'Editar →'}
              </button>
            </>
          ) : (
            /* Expanded edit form */
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold text-foreground">Mi Perfil</p>
                <button
                  onClick={() => { setEditando(false); setError('') }}
                  className="text-muted-foreground hover:text-foreground text-xl leading-none"
                >×</button>
              </div>
              <form onSubmit={handleGuardar} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp <span className="text-muted-foreground font-normal">(para notificaciones de agenda)</span></Label>
                  <Input
                    type="tel"
                    placeholder="5491123456789"
                    value={form.whatsapp}
                    onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Número completo con código de país, sin espacios ni +. Ej: 5491123456789</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Teléfono</Label>
                  <Input
                    type="tel"
                    placeholder="+54 11 2345-6789"
                    value={form.telefono}
                    onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Link de reunión (Meet / Zoom)</Label>
                  <Input
                    type="url"
                    placeholder="https://meet.google.com/abc-defg-hij"
                    value={form.meet_link}
                    onChange={e => setForm(p => ({ ...p, meet_link: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Se incluye en el resumen de agenda para unirse con un clic</p>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => { setEditando(false); setError('') }}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── GoogleCalendarCard ─────────────────────────────────────────────────────────
function GoogleCalendarCard({ googleEmail }: { googleEmail: string | null }) {
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Google Calendar?')) return
    setDisconnecting(true)
    await fetch('/api/google/disconnect', { method: 'POST' })
    window.location.reload()
  }

  if (googleEmail) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Google Calendar</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{googleEmail}</p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
          >
            {disconnecting ? '...' : 'Desconectar'}
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className="group border-border hover:border-foreground/20 hover:shadow-sm transition-all duration-150 cursor-pointer select-none"
      onClick={() => window.location.href = '/api/google/auth'}
    >
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-muted group-hover:bg-muted/60 transition-colors flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Google Calendar</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sincronizá vencimientos y eventos</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
          Conectar →
        </span>
      </CardContent>
    </Card>
  )
}
