// CalendarioPartner.tsx
// Calendario visual mensual con estética slate/emerald.
// Muestra: feriados (amber), vencimientos Zonda (emerald), eventos Google (blue).
// Los vencimientos se leen desde localStorage (escritos por CalculadoraPlazos).
// Los eventos de Google Calendar se obtienen via /api/google/events.

'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addMonths, subMonths, isToday, isWeekend } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { leerVencimientos, eliminarVencimiento, type Vencimiento } from '@/lib/vencimientos'

// ── Misma lista de feriados que en la calculadora ────────────────────────────
const FERIADOS_2026: Record<string, string> = {
  '2026-01-01': 'Año Nuevo',
  '2026-02-16': 'Carnaval (lunes)',
  '2026-02-17': 'Carnaval (martes)',
  '2026-03-23': 'Puente turístico',
  '2026-03-24': 'Día Nacional de la Memoria',
  '2026-04-02': 'Día del Veterano y los Caídos en Malvinas',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajador',
  '2026-05-25': 'Día de la Revolución de Mayo',
  '2026-06-22': 'Paso a la Inmortalidad — Gral. Belgrano',
  '2026-07-09': 'Día de la Independencia',
  '2026-07-10': 'Puente turístico',
  '2026-08-17': 'Paso a la Inmortalidad — Gral. San Martín',
  '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2026-11-23': 'Día de la Soberanía Nacional',
  '2026-12-07': 'Puente turístico',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface GoogleEvent {
  id?: string
  summary?: string
  start?: { date?: string; dateTime?: string }
  end?:   { date?: string; dateTime?: string }
}

// ── Generar grilla del mes (lunes primero) ────────────────────────────────────
function generarGrilla(anio: number, mes: number): (Date | null)[][] {
  const primerDia = new Date(anio, mes, 1)
  const ultimoDia = new Date(anio, mes + 1, 0)
  const offsetLunes = (primerDia.getDay() + 6) % 7

  const semanas: (Date | null)[][] = []
  let semana: (Date | null)[] = Array(offsetLunes).fill(null)

  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    semana.push(new Date(anio, mes, d))
    if (semana.length === 7) { semanas.push(semana); semana = [] }
  }
  if (semana.length > 0) {
    while (semana.length < 7) semana.push(null)
    semanas.push(semana)
  }
  return semanas
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

// ── Tarjeta de evento unificada ───────────────────────────────────────────────
interface EventoItemCard {
  tipo:   'vencimiento' | 'recordatorio' | 'google'
  titulo: string
  hora?:  string
  nota?:  string
  id?:    string
}

const ITEM_CONFIG: Record<EventoItemCard['tipo'], { emoji: string }> = {
  vencimiento:  { emoji: '⚖️' },
  recordatorio: { emoji: '🔔' },
  google:       { emoji: '📆' },
}

function ItemEventoCard({
  item,
  onClick,
  onEliminar,
}: {
  item:        EventoItemCard
  onClick?:    () => void
  onEliminar?: () => void
}) {
  const cfg = ITEM_CONFIG[item.tipo]
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border border-border bg-card p-2.5',
        onClick && 'cursor-pointer hover:bg-muted/40 transition-colors group'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm shrink-0 leading-tight mt-px">{cfg.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{item.titulo}</p>
          {item.hora  && <p className="text-[10px] text-muted-foreground mt-0.5">{item.hora}</p>}
          {item.nota  && <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{item.nota}</p>}
        </div>
        {onEliminar && (
          <button
            onClick={e => { e.stopPropagation(); onEliminar() }}
            className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function getEventDate(ev: GoogleEvent): string | null {
  return ev.start?.date ?? ev.start?.dateTime?.slice(0, 10) ?? null
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function CalendarioPartner() {
  const hoy = new Date()
  const [mesBase, setMesBase]           = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [vencimientos, setVencimientos] = useState<Vencimiento[]>([])
  const [seleccionado, setSeleccionado] = useState<string | null>(null) // 'YYYY-MM-DD'

  // Google Calendar
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEvents, setGoogleEvents]       = useState<GoogleEvent[]>([])
  const [loadingGoogle, setLoadingGoogle]     = useState(false)

  // Leer vencimientos locales
  const cargarVencimientos = useCallback(() => {
    setVencimientos(leerVencimientos())
  }, [])

  useEffect(() => {
    cargarVencimientos()
    window.addEventListener('zonda_vencimientos_change', cargarVencimientos)
    return () => window.removeEventListener('zonda_vencimientos_change', cargarVencimientos)
  }, [cargarVencimientos])

  // Cargar eventos de Google Calendar cuando cambia el mes
  const cargarEventosGoogle = useCallback(async (mesDate: Date) => {
    setLoadingGoogle(true)
    const anio = mesDate.getFullYear()
    const mes  = mesDate.getMonth()
    const desde = format(new Date(anio, mes, 1), 'yyyy-MM-dd')
    const hasta = format(new Date(anio, mes + 1, 0), 'yyyy-MM-dd')

    try {
      const res = await fetch(`/api/google/events?desde=${desde}&hasta=${hasta}`)
      const data = await res.json()
      setGoogleConnected(data.connected ?? false)
      setGoogleEvents(data.events ?? [])
    } catch {
      setGoogleConnected(false)
      setGoogleEvents([])
    } finally {
      setLoadingGoogle(false)
    }
  }, [])

  useEffect(() => {
    cargarEventosGoogle(mesBase)
  }, [mesBase, cargarEventosGoogle])

  // Recargar cuando el asistente crea un evento
  useEffect(() => {
    const handler = () => cargarEventosGoogle(mesBase)
    window.addEventListener('zonda_calendar_change', handler)
    return () => window.removeEventListener('zonda_calendar_change', handler)
  }, [mesBase, cargarEventosGoogle])

  const anio = mesBase.getFullYear()
  const mes  = mesBase.getMonth()
  const grilla = generarGrilla(anio, mes)

  // Indexar vencimientos y recordatorios por fecha
  const vencByFecha = new Map<string, Vencimiento[]>()
  const recByFecha  = new Map<string, Vencimiento[]>()
  for (const v of vencimientos) {
    vencByFecha.set(v.fecha, [...(vencByFecha.get(v.fecha) ?? []), v])
    recByFecha.set(v.fechaRecordatorio, [...(recByFecha.get(v.fechaRecordatorio) ?? []), v])
  }

  // Indexar eventos de Google por fecha
  const googleByFecha = new Map<string, GoogleEvent[]>()
  for (const ev of googleEvents) {
    const fecha = getEventDate(ev)
    if (fecha) googleByFecha.set(fecha, [...(googleByFecha.get(fecha) ?? []), ev])
  }

  function handleEliminar(id: string) {
    eliminarVencimiento(id)
    cargarVencimientos()
  }

  function cambiarMes(delta: number) {
    setMesBase(m => delta > 0 ? addMonths(m, 1) : subMonths(m, 1))
    setSeleccionado(null)
  }

  const hoyStr = format(new Date(), 'yyyy-MM-dd')

  // Día seleccionado
  const diaSelVenc   = seleccionado ? (vencByFecha.get(seleccionado)  ?? []) : []
  const diaSelRec    = seleccionado ? (recByFecha.get(seleccionado)   ?? []) : []
  const diaSelGoogle = seleccionado ? (googleByFecha.get(seleccionado) ?? []) : []

  // ── Tipo unificado de item ────────────────────────────────────────
  interface EventoItem {
    tipo:    'vencimiento' | 'recordatorio' | 'google'
    titulo:  string
    hora?:   string      // "HH:MM – HH:MM" para Google, undefined para resto
    nota?:   string
    id?:     string      // id del vencimiento para poder eliminarlo
  }

  function googleItemHora(ev: GoogleEvent): string | undefined {
    if (!ev.start?.dateTime) return undefined
    const inicio = format(new Date(ev.start.dateTime), 'HH:mm')
    const fin    = ev.end?.dateTime ? ` – ${format(new Date(ev.end.dateTime), 'HH:mm')}` : ''
    return inicio + fin
  }

  // Items unificados y ordenados para un día concreto
  function buildDayItems(
    vencs:  Vencimiento[],
    recs:   Vencimiento[],
    google: GoogleEvent[],
  ): EventoItem[] {
    const items: EventoItem[] = [
      ...vencs.map(v  => ({ tipo: 'vencimiento'  as const, titulo: v.titulo, id: v.id, nota: v.nota })),
      ...recs.map(v   => ({ tipo: 'recordatorio' as const, titulo: `Recordatorio: ${v.titulo}`, id: v.id })),
      ...google.map(ev => ({ tipo: 'google'       as const, titulo: ev.summary ?? '(sin título)', hora: googleItemHora(ev) })),
    ]
    // Ordenar: con hora primero (cronológico), luego sin hora
    return items.sort((a, b) => {
      if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
      if (a.hora) return -1
      if (b.hora) return 1
      return 0
    })
  }

  // Grupos de próximos eventos (default cuando no hay día seleccionado)
  interface GrupoFecha { fecha: string; items: EventoItem[] }
  function buildProximosGrupos(): GrupoFecha[] {
    const map = new Map<string, EventoItem[]>()

    const push = (fecha: string, item: EventoItem) => {
      if (!map.has(fecha)) map.set(fecha, [])
      map.get(fecha)!.push(item)
    }

    for (const v of vencimientos) {
      if (v.fecha             >= hoyStr) push(v.fecha,             { tipo: 'vencimiento',  titulo: v.titulo, id: v.id, nota: v.nota })
      if (v.fechaRecordatorio >= hoyStr) push(v.fechaRecordatorio, { tipo: 'recordatorio', titulo: `Recordatorio: ${v.titulo}`, id: v.id })
    }
    for (const ev of googleEvents) {
      const fecha = getEventDate(ev)
      if (fecha && fecha >= hoyStr) push(fecha, { tipo: 'google', titulo: ev.summary ?? '(sin título)', hora: googleItemHora(ev) })
    }

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 5)
      .map(([fecha, items]) => ({
        fecha,
        items: items.sort((a, b) => {
          if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
          if (a.hora) return -1
          if (b.hora) return 1
          return 0
        }),
      }))
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
              <CalendarDays className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Mi Calendario</CardTitle>
              <p className="text-xs text-muted-foreground">
                Vencimientos
                {googleConnected && ' · Google Calendar'}
              </p>
            </div>
          </div>

          {/* Estado Google Calendar */}
          {googleConnected ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-foreground border-border bg-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
              Google conectado
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground"
              onClick={() => window.location.href = '/api/google/auth'}
            >
              Conectar Google Cal
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">

          {/* ── Grilla calendario ──────────────────────────── */}
          <div>
            {/* Navegación mes */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="sm" onClick={() => cambiarMes(-1)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {cap(format(mesBase, 'MMMM yyyy', { locale: es }))}
                </h3>
                {loadingGoogle && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
              </div>
              <Button variant="ghost" size="sm" onClick={() => cambiarMes(1)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Días de semana */}
            <div className="grid grid-cols-7 mb-1">
              {DIAS_SEMANA.map((d, i) => (
                <div key={d} className={cn('text-center text-[10px] font-medium pb-1.5', i >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
                  {d}
                </div>
              ))}
            </div>

            {/* Semanas */}
            <div className="space-y-0.5">
              {grilla.map((semana, si) => (
                <div key={si} className="grid grid-cols-7 gap-0.5">
                  {semana.map((dia, di) => {
                    if (!dia) return <div key={di} />

                    const fechaStr   = format(dia, 'yyyy-MM-dd')
                    const esHoy      = isToday(dia)
                    const esFDS      = isWeekend(dia)
                    const esFeriado  = Boolean(FERIADOS_2026[fechaStr])
                    const esVenc     = vencByFecha.has(fechaStr)
                    const esRec      = recByFecha.has(fechaStr)
                    const esGoogle   = googleByFecha.has(fechaStr)
                    const esSel      = seleccionado === fechaStr

                    return (
                      <TooltipProvider key={di} delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setSeleccionado(esSel ? null : fechaStr)}
                              className={cn(
                                'relative flex flex-col items-center justify-start rounded-md py-1 px-0.5 min-h-[36px] text-center transition-colors',
                                esSel      ? 'bg-slate-800 text-white'
                                : esFeriado ? 'bg-muted hover:bg-muted/70'
                                : esFDS     ? 'bg-muted/40 hover:bg-muted/60'
                                : 'hover:bg-muted/50',
                              )}
                            >
                              <span className={cn(
                                'text-xs leading-none',
                                esSel     ? 'text-white font-semibold'     :
                                esHoy     ? 'text-foreground font-bold'   :
                                esFeriado ? 'text-muted-foreground font-medium'   :
                                esFDS     ? 'text-muted-foreground/60'     :
                                'text-foreground'
                              )}>
                                {dia.getDate()}
                              </span>

                              {esHoy && !esSel && (
                                <span className="absolute inset-0 rounded-md ring-1 ring-emerald-400 pointer-events-none" />
                              )}

                              {/* Dots: vencimiento, recordatorio, Google */}
                              <div className="flex gap-0.5 mt-0.5 justify-center flex-wrap">
                                {esVenc && <span className={cn('w-1 h-1 rounded-full', esSel ? 'bg-foreground/40' : 'bg-foreground')} />}
                                {esRec  && <span className={cn('w-1 h-1 rounded-full', esSel ? 'bg-foreground/30' : 'bg-foreground/60')} />}
                                {esGoogle && <span className={cn('w-1 h-1 rounded-full', esSel ? 'bg-foreground/40' : 'bg-foreground/80')} />}
                              </div>
                            </button>
                          </TooltipTrigger>

                          {(esFeriado || esVenc || esRec || esGoogle) && (
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              {esFeriado && <p className="font-medium">📅 {FERIADOS_2026[fechaStr]}</p>}
                              {(vencByFecha.get(fechaStr) ?? []).map(v => (
                                <p key={v.id} className="text-foreground">⚖️ {v.titulo}</p>
                              ))}
                              {(recByFecha.get(fechaStr) ?? []).map(v => (
                                <p key={v.id} className="text-muted-foreground">🔔 Rec: {v.titulo}</p>
                              ))}
                              {(googleByFecha.get(fechaStr) ?? []).map((ev, i) => (
                                <p key={i} className="text-foreground">📆 {ev.summary}</p>
                              ))}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Leyenda */}
            <div className="flex gap-4 mt-4 flex-wrap">
              {[
                { color: 'bg-foreground',        label: 'Vencimiento' },
                { color: 'bg-foreground/60',    label: 'Recordatorio' },
                { color: 'bg-muted border border-border', label: 'Feriado' },
                ...(googleConnected ? [{ color: 'bg-foreground/80', label: 'Google Cal' }] : []),
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className={cn('w-2.5 h-2.5 rounded-sm', l.color)} />
                  <span className="text-[10px] text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Panel lateral — eventos unificados ────────── */}
          <div className="lg:border-l lg:border-border lg:pl-5 flex flex-col gap-3">

            {seleccionado ? (
              /* === DÍA SELECCIONADO === */
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {cap(format(new Date(seleccionado + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es }))}
                  </p>
                  <button
                    onClick={() => setSeleccionado(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Volver
                  </button>
                </div>

                {(() => {
                  const items = buildDayItems(diaSelVenc, diaSelRec, diaSelGoogle)
                  if (items.length === 0) return (
                    <p className="text-[10px] text-muted-foreground/60">Sin eventos para este día.</p>
                  )
                  return (
                    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 320 }}>
                      {items.map((item, i) => (
                        <ItemEventoCard
                          key={i}
                          item={item}
                          onEliminar={item.id ? () => handleEliminar(item.id!) : undefined}
                        />
                      ))}
                    </div>
                  )
                })()}
              </>
            ) : (
              /* === PRÓXIMOS EVENTOS === */
              <>
                {(() => {
                  const proximo = buildProximosGrupos()[0] ?? null
                  return (
                    <>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {proximo
                          ? cap(format(new Date(proximo.fecha + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es }))
                          : 'Próximo día'}
                      </p>
                      {!proximo ? (
                        <p className="text-[10px] text-muted-foreground/60">
                          Sin eventos próximos. Calculá un plazo o revisá tu Google Calendar.
                        </p>
                      ) : (
                        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 320 }}>
                          {proximo.items.map((item, i) => (
                            <ItemEventoCard
                              key={i}
                              item={item}
                              onClick={() => setSeleccionado(proximo.fecha)}
                              onEliminar={item.id ? () => handleEliminar(item.id!) : undefined}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </>
            )}

            {/* Pie del panel */}
            <div className="mt-auto pt-1 space-y-2">
              {googleConnected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-muted-foreground w-full justify-start px-1"
                  onClick={() => window.open('https://calendar.google.com', '_blank')}
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  Abrir Google Calendar
                </Button>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-foreground">Conectar Google Calendar</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Sincronizá tus vencimientos y eventos en un solo lugar.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 mt-1 w-full"
                    onClick={() => window.location.href = '/api/google/auth'}
                  >
                    Conectar →
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
