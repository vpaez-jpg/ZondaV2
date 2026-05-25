'use client'

// DiaBriefingModal.tsx
// Modal de "primer ingreso del día": se muestra una sola vez por día al abrir la plataforma.
// El abogado debe hacer clic en "Entendido, empezar mi día" para cerrarlo.
// Al cerrarlo, se llama a /api/partner/mark-day-seen para registrar en Supabase.

import { useState, useEffect, useCallback } from 'react'
import { format, addDays }                  from 'date-fns'
import { es }                               from 'date-fns/locale'
import { leerVencimientos }                 from '@/lib/vencimientos'
import type { BriefingPayload, BriefingItem } from '@/app/api/partner/briefing-ia/route'
import { cn } from '@/lib/utils'

interface Props {
  nombrePartner: string
  meetLink?:     string | null
  onClose:       () => void  // Llamado cuando el abogado hace clic en "Entendido"
}

// ── Semáforo ─────────────────────────────────────────────────────────────────
const URGENCIA_CONFIG = {
  roja:     { dot: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-50 text-red-700 border-red-200',    label: 'Hoy' },
  amarilla: { dot: 'bg-amber-400',  text: 'text-amber-700',  badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Mañana' },
  verde:    { dot: 'bg-emerald-500', text: 'text-foreground', badge: 'bg-muted text-muted-foreground border-border', label: 'Esta semana' },
} as const

const TIPO_ICON: Record<BriefingItem['tipo'], string> = {
  vencimiento:  '⚖️',
  recordatorio: '🔔',
  evento:       '📅',
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function DiaBriefingModal({ nombrePartner, meetLink, onClose }: Props) {
  const [visible,   setVisible]   = useState(false)
  const [cargando,  setCargando]  = useState(true)
  const [cerrando,  setCerrando]  = useState(false)
  const [briefing,  setBriefing]  = useState<BriefingPayload | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  // ── Entrada con fade ──────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  // ── Cargar briefing ───────────────────────────────────────────
  useEffect(() => {
    async function cargar() {
      setCargando(true)
      try {
        const vencimientos = leerVencimientos()
        const res = await fetch('/api/partner/briefing-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vencimientos, para: 'manana' }),
        })
        if (!res.ok) throw new Error('Error del servidor')
        const data: BriefingPayload = await res.json()
        setBriefing(data)
      } catch (e) {
        setError('No se pudo cargar el resumen. Verificá tu conexión.')
        console.error('[DiaBriefingModal] Error cargando briefing:', e)
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [])

  // ── Cerrar modal ──────────────────────────────────────────────
  const handleEntendido = useCallback(async () => {
    setCerrando(true)
    setVisible(false)

    // Registrar en Supabase que ya vio el briefing hoy
    try {
      await fetch('/api/partner/mark-day-seen', { method: 'POST' })
    } catch {
      // Si falla no bloqueamos al abogado — igual cerramos el modal
    }

    // Esperar el fade-out y llamar onClose
    setTimeout(() => onClose(), 300)
  }, [onClose])

  const nombreCorto   = nombrePartner.split(' ')[0]
  const mañana        = addDays(new Date(), 1)
  const fechaMañana   = format(mañana, "EEEE d 'de' MMMM", { locale: es })
  const diaLabel      = briefing?.fecha ?? format(mañana, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })

  const itemsVenc  = briefing?.items.filter(i => i.tipo !== 'evento') ?? []
  const itemsEv    = briefing?.items.filter(i => i.tipo === 'evento') ?? []
  const hayAlertas = briefing?.hayAlertas ?? false

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300',
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent pointer-events-none'
      )}
    >
      <div
        className={cn(
          'relative bg-card w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden transition-all duration-300',
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        )}
      >
        {/* ── Franja superior de urgencia ──────────────────────── */}
        <div className={cn(
          'h-1 w-full',
          hayAlertas ? 'bg-amber-400' : 'bg-foreground/20'
        )} />

        <div className="px-6 pt-5 pb-6">

          {/* ── Encabezado ────────────────────────────────────── */}
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Adelanto de agenda
              </p>
              <h2 className="text-xl font-bold text-foreground leading-tight">
                {nombreCorto}, mañana es{' '}
                <span className="capitalize">{fechaMañana}</span>
              </h2>
            </div>
            {/* Indicador de urgencia global */}
            {hayAlertas ? (
              <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 ml-3 mt-0.5">
                ⚠ Atención requerida
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border ml-3 mt-0.5">
                ✓ Todo en orden
              </span>
            )}
          </div>

          {/* ── Resumen IA ────────────────────────────────────── */}
          <div className="my-4">
            {cargando ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-4/5" />
              </div>
            ) : error ? (
              <p className="text-xs text-muted-foreground italic">{error}</p>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                "{briefing?.resumen}"
              </p>
            )}
          </div>

          {/* ── Items del día ─────────────────────────────────── */}
          {!cargando && !error && (
            <div className="space-y-2 mb-5">

              {/* Sin nada pendiente */}
              {briefing?.items.length === 0 && (
                <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    🌅 Agenda despejada para mañana. Aprovechá para redactar o preparar expedientes.
                  </p>
                </div>
              )}

              {/* Vencimientos y recordatorios */}
              {itemsVenc.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                    Vencimientos procesales
                  </p>
                  {itemsVenc.map(item => (
                    <ItemBriefing key={item.id} item={item} />
                  ))}
                </div>
              )}

              {/* Eventos y reuniones */}
              {itemsEv.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                    Reuniones y audiencias
                  </p>
                  {itemsEv.map(item => (
                    <ItemBriefing key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Skeleton mientras carga */}
          {cargando && (
            <div className="space-y-2 mb-5 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted rounded-xl" />
              ))}
            </div>
          )}

          {/* ── Leyenda semáforo ──────────────────────────────── */}
          {!cargando && briefing && briefing.items.length > 0 && (
            <div className="flex items-center gap-4 mb-5 px-1">
              <span className="text-[10px] text-muted-foreground">Semáforo:</span>
              {(['roja', 'amarilla', 'verde'] as const).map(u => (
                <span key={u} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', URGENCIA_CONFIG[u].dot)} />
                  {URGENCIA_CONFIG[u].label}
                </span>
              ))}
            </div>
          )}

          {/* ── Botón principal ───────────────────────────────── */}
          <button
            onClick={handleEntendido}
            disabled={cerrando}
            className={cn(
              'w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200',
              'bg-foreground text-primary-foreground hover:bg-foreground/90',
              'active:scale-[0.98] disabled:opacity-60'
            )}
          >
            {cerrando ? 'Abriendo dashboard...' : 'Entendido, empezar mi día →'}
          </button>

          <p className="text-center text-[10px] text-muted-foreground/60 mt-2.5">
            Este resumen queda visible en el dashboard todo el día
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponente: item individual del briefing ────────────────────────────────
function ItemBriefing({ item }: { item: BriefingItem }) {
  const cfg = URGENCIA_CONFIG[item.urgencia]

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
      {/* Dot semáforo */}
      <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />

      {/* Icono tipo */}
      <span className="text-sm shrink-0 leading-none">{TIPO_ICON[item.tipo]}</span>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug truncate">
          {item.titulo}
        </p>
        {item.hora && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{item.hora} hs</p>
        )}
      </div>

      {/* Badge urgencia */}
      <span className={cn(
        'shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full border',
        cfg.badge
      )}>
        {cfg.label}
      </span>

      {/* Botón de acción: Unirse / Zoom */}
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-foreground text-primary-foreground hover:bg-foreground/90 transition-colors"
        >
          Unirse →
        </a>
      )}
    </div>
  )
}
