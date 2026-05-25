'use client'

// NotificacionesBell.tsx
// Campana de notificaciones en el header del partner.
// Muestra vencimientos de hoy y mañana (locales + Google Calendar).
// Al hacer click abre un panel desplegable con el detalle.

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, X, CalendarDays, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { leerVencimientos, type Vencimiento } from '@/lib/vencimientos'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface GoogleEvent {
  id?: string
  summary?: string
  start?: { date?: string; dateTime?: string }
}

interface Alerta {
  id:      string
  tipo:    'vencimiento' | 'recordatorio' | 'google'
  titulo:  string
  cuando:  'hoy' | 'mañana'
  hora?:   string  // solo para eventos Google con hora
}

function getEventDate(ev: GoogleEvent): string | null {
  return ev.start?.date ?? ev.start?.dateTime?.slice(0, 10) ?? null
}

function getEventHour(ev: GoogleEvent): string | null {
  if (!ev.start?.dateTime) return null
  return format(new Date(ev.start.dateTime), 'HH:mm')
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function NotificacionesBell({ googleConnected }: { googleConnected: boolean }) {
  const [open, setOpen]               = useState(false)
  const [alertas, setAlertas]         = useState<Alerta[]>([])
  const [visto, setVisto]             = useState(false)
  const panelRef                      = useRef<HTMLDivElement>(null)

  const calcularAlertas = useCallback(async () => {
    const hoyStr    = format(new Date(), 'yyyy-MM-dd')
    const mañanaStr = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
    const lista: Alerta[] = []

    // Vencimientos locales (fecha de vencimiento y de recordatorio)
    const vencimientos = leerVencimientos()
    for (const v of vencimientos) {
      if (v.fecha === hoyStr || v.fecha === mañanaStr) {
        lista.push({
          id:     `venc-${v.id}`,
          tipo:   'vencimiento',
          titulo: v.titulo,
          cuando: v.fecha === hoyStr ? 'hoy' : 'mañana',
        })
      }
      if (v.fechaRecordatorio === hoyStr || v.fechaRecordatorio === mañanaStr) {
        lista.push({
          id:     `rec-${v.id}`,
          tipo:   'recordatorio',
          titulo: `Recordatorio: ${v.titulo}`,
          cuando: v.fechaRecordatorio === hoyStr ? 'hoy' : 'mañana',
        })
      }
    }

    // Eventos de Google Calendar
    if (googleConnected) {
      try {
        const res = await fetch(`/api/google/events?desde=${hoyStr}&hasta=${mañanaStr}`)
        const data = await res.json()
        if (data.events) {
          for (const ev of data.events as GoogleEvent[]) {
            const fecha = getEventDate(ev)
            if (!fecha) continue
            if (fecha === hoyStr || fecha === mañanaStr) {
              lista.push({
                id:     `google-${ev.id ?? Math.random()}`,
                tipo:   'google',
                titulo: ev.summary ?? '(sin título)',
                cuando: fecha === hoyStr ? 'hoy' : 'mañana',
                hora:   getEventHour(ev) ?? undefined,
              })
            }
          }
        }
      } catch {
        // Silenciar error de red
      }
    }

    setAlertas(lista)
  }, [googleConnected])

  useEffect(() => {
    calcularAlertas()
    // Recalcular cuando cambian vencimientos locales
    window.addEventListener('zonda_vencimientos_change', calcularAlertas)
    return () => window.removeEventListener('zonda_vencimientos_change', calcularAlertas)
  }, [calcularAlertas])

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const sinLeer = alertas.length > 0 && !visto

  function handleOpen() {
    setOpen(v => !v)
    setVisto(true)
  }

  const hoy    = alertas.filter(a => a.cuando === 'hoy')
  const manana = alertas.filter(a => a.cuando === 'mañana')

  const TIPO_ICON: Record<Alerta['tipo'], string> = {
    vencimiento:  '⚖️',
    recordatorio: '🔔',
    google:       '📆',
  }

  const TIPO_COLOR: Record<Alerta['tipo'], string> = {
    vencimiento:  'bg-muted border-border text-foreground',
    recordatorio: 'bg-muted border-border text-muted-foreground',
    google:       'bg-muted border-border text-foreground',
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Botón campana */}
      <button
        onClick={handleOpen}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-full transition-colors',
          open ? 'bg-muted' : 'hover:bg-muted/60'
        )}
        aria-label="Notificaciones"
      >
        <Bell className={cn('w-4 h-4', sinLeer ? 'text-foreground' : 'text-muted-foreground')} />
        {sinLeer && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
        )}
      </button>

      {/* Panel desplegable */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Alertas</p>
              {alertas.length > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {alertas.length}
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <CalendarDays className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin alertas para hoy ni mañana</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Los vencimientos y eventos aparecerán acá</p>
              </div>
            ) : (
              <div className="p-3 space-y-4">
                {hoy.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-red-500" />
                      <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Hoy</p>
                    </div>
                    {hoy.map(a => (
                      <div key={a.id} className={cn('flex items-start gap-2.5 p-2.5 rounded-lg border text-xs', TIPO_COLOR[a.tipo])}>
                        <span className="shrink-0 text-sm leading-none mt-0.5">{TIPO_ICON[a.tipo]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-snug">{a.titulo}</p>
                          {a.hora && <p className="text-[10px] opacity-70 mt-0.5">{a.hora} hs</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {manana.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-3 h-3 text-muted-foreground" />
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mañana</p>
                    </div>
                    {manana.map(a => (
                      <div key={a.id} className={cn('flex items-start gap-2.5 p-2.5 rounded-lg border text-xs', TIPO_COLOR[a.tipo])}>
                        <span className="shrink-0 text-sm leading-none mt-0.5">{TIPO_ICON[a.tipo]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-snug">{a.titulo}</p>
                          {a.hora && <p className="text-[10px] opacity-70 mt-0.5">{a.hora} hs</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {!googleConnected && (
            <div className="border-t border-border px-4 py-2.5 bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                <a href="/api/google/auth" className="font-medium text-foreground hover:underline">
                  Conectá Google Calendar
                </a>
                {' '}para ver tus reuniones y audiencias también.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
