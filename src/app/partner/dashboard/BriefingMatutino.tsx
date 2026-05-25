'use client'

// BriefingMatutino.tsx
// Tarjeta fija del dashboard — siempre visible una vez que el abogado cierra el modal.
// Combina: resumen IA, semáforo de plazos, shortcuts de acción, + estado de trámites.

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader }     from '@/components/ui/card'
import { Badge }                             from '@/components/ui/badge'
import { Button }                            from '@/components/ui/button'
import { Separator }                         from '@/components/ui/separator'
import { cn }                                from '@/lib/utils'
import { leerVencimientos }                  from '@/lib/vencimientos'
import type { BriefingPayload, BriefingItem } from '@/app/api/partner/briefing-ia/route'

// ── Tipos de trámites (para la sección de estado) ──────────────────────────────
interface Tramite {
  id:           string
  tipo:         'MARCAS' | 'DNDA' | 'SAS' | 'NDA' | 'TYC' | 'PP' | 'ART9' | 'GANANCIAS'
  etapa_numero: number
  cliente_id:   string
  updated_at:   string
}
interface Cliente {
  id:     string
  nombre: string
  email:  string | null
}

interface Props {
  nombrePartner: string
  tramites:      Tramite[]
  clientes:      Cliente[]
  meetLink?:     string | null
}

// ── Semáforo ──────────────────────────────────────────────────────────────────
const URGENCIA_CONFIG = {
  roja:     { dot: 'bg-red-500',     text: 'text-red-700',    badge: 'bg-red-50 text-red-700 border-red-200',       label: 'Hoy' },
  amarilla: { dot: 'bg-amber-400',   text: 'text-amber-700',  badge: 'bg-amber-50 text-amber-700 border-amber-200',  label: 'Mañana' },
  verde:    { dot: 'bg-emerald-500', text: 'text-foreground', badge: 'bg-muted text-muted-foreground border-border', label: 'Esta semana' },
} as const

const TIPO_ICON: Record<BriefingItem['tipo'], string> = {
  vencimiento:  '⚖️',
  recordatorio: '🔔',
  evento:       '📅',
}

// ── Estado de trámites ────────────────────────────────────────────────────────
const ETAPA_MAX: Record<string, number>  = { MARCAS: 7, DNDA: 4, SAS: 6 }
const LABEL_TIPO: Record<string, string> = { MARCAS: 'Marca', DNDA: 'DNDA', SAS: 'SAS' }
const DIAS_ESTANCADO = 7
const DIAS_URGENTE   = 3

function diasDesde(fecha: string): number {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24))
}
function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function BriefingMatutino({ nombrePartner, tramites, clientes, meetLink }: Props) {
  const [expandido,  setExpandido]  = useState(true)
  const [briefing,   setBriefing]   = useState<BriefingPayload | null>(null)
  const [cargandoIA, setCargandoIA] = useState(true)
  const [seccion,    setSeccion]    = useState<'agenda' | 'tramites'>('agenda')

  const nombreCorto   = nombrePartner.split(' ')[0]
  const clientePorId  = Object.fromEntries(clientes.map(c => [c.id, c]))

  // ── Estado de trámites ─────────────────────────────────────────
  const activos           = tramites.filter(t => t.etapa_numero < ETAPA_MAX[t.tipo])
  const esperandoDatos    = activos.filter(t => t.etapa_numero === 1)
  const estancados        = activos.filter(t => t.etapa_numero > 1 && diasDesde(t.updated_at) >= DIAS_ESTANCADO)
  const avanzandoBien     = activos.filter(t => t.etapa_numero > 1 && diasDesde(t.updated_at) < DIAS_ESTANCADO)
  const finalizados       = tramites.filter(t => t.etapa_numero === ETAPA_MAX[t.tipo])

  const hayAlertasTramites = esperandoDatos.length > 0 || estancados.length > 0

  // ── Cargar briefing IA ─────────────────────────────────────────
  const cargarBriefing = useCallback(async () => {
    setCargandoIA(true)
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
    } catch {
      // Continuar sin briefing IA — la sección de trámites siempre está disponible
    } finally {
      setCargandoIA(false)
    }
  }, [])

  useEffect(() => {
    cargarBriefing()
    // Recargar si cambian vencimientos locales
    window.addEventListener('zonda_vencimientos_change', cargarBriefing)
    return () => window.removeEventListener('zonda_vencimientos_change', cargarBriefing)
  }, [cargarBriefing])

  const hayAlertasAgenda = briefing?.hayAlertas ?? false
  const hayAlertas       = hayAlertasAgenda || hayAlertasTramites

  const itemsVenc = briefing?.items.filter(i => i.tipo !== 'evento') ?? []
  const itemsEv   = briefing?.items.filter(i => i.tipo === 'evento') ?? []

  return (
    <Card className="mb-6 border border-border bg-card">

      {/* ── Franja top de urgencia ──────────────────────────── */}
      <div className={cn('h-0.5 w-full rounded-t-xl', hayAlertas ? 'bg-amber-400' : 'bg-foreground/10')} />

      <CardHeader className="pb-0 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {saludo()}, {nombreCorto}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hayAlertas
                ? 'Hay asuntos que requieren atención hoy'
                : 'Todo al día — buen ritmo de trabajo'
              }
            </p>
          </div>

          {/* Tabs agenda / trámites */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setSeccion('agenda')}
              className={cn(
                'text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors',
                seccion === 'agenda'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Agenda mañana
            </button>
            <button
              onClick={() => setSeccion('tramites')}
              className={cn(
                'text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors relative',
                seccion === 'tramites'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Trámites
              {hayAlertasTramites && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          </div>

          <Button
            variant="ghost" size="sm"
            onClick={() => setExpandido(v => !v)}
            className="text-xs h-7 px-2.5 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expandido ? '▲' : '▼'}
          </Button>
        </div>
      </CardHeader>

      {expandido && (
        <CardContent className="px-5 pt-3 pb-5 space-y-4">
          <Separator className="bg-border" />

          {/* ── Sección: Agenda de mañana ──────────────────────── */}
          {seccion === 'agenda' && (
            <div className="space-y-3">

              {/* Resumen IA */}
              {cargandoIA ? (
                <div className="space-y-1.5 animate-pulse">
                  <div className="h-2.5 bg-muted rounded w-full" />
                  <div className="h-2.5 bg-muted rounded w-4/5" />
                </div>
              ) : briefing?.resumen ? (
                <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-border pl-3">
                  "{briefing.resumen}"
                </p>
              ) : null}

              {/* Vencimientos procesales */}
              {itemsVenc.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Vencimientos procesales
                  </p>
                  {itemsVenc.map(item => (
                    <ItemAgenda key={item.id} item={item} />
                  ))}
                </div>
              )}

              {/* Reuniones y eventos */}
              {itemsEv.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Reuniones y audiencias
                  </p>
                  {itemsEv.map(item => (
                    <ItemAgenda key={item.id} item={item} />
                  ))}
                </div>
              )}

              {/* Sin nada */}
              {!cargandoIA && briefing?.items.length === 0 && (
                <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground text-center">
                    🌅 Agenda despejada para mañana
                  </p>
                </div>
              )}

              {/* Leyenda semáforo */}
              {!cargandoIA && (briefing?.items.length ?? 0) > 0 && (
                <div className="flex items-center gap-4 pt-1">
                  <span className="text-[10px] text-muted-foreground">Semáforo:</span>
                  {(['roja', 'amarilla', 'verde'] as const).map(u => (
                    <span key={u} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={cn('w-2 h-2 rounded-full', URGENCIA_CONFIG[u].dot)} />
                      {URGENCIA_CONFIG[u].label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Sección: Estado de trámites ───────────────────── */}
          {seccion === 'tramites' && (
            <div className="space-y-3">

              {/* 🔴 Clientes sin completar */}
              {esperandoDatos.map(t => {
                const dias    = diasDesde(t.updated_at)
                const urgente = dias >= DIAS_URGENTE
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-sm shrink-0">👤</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {clientePorId[t.cliente_id]?.nombre ?? 'Cliente'} — Sin datos ({LABEL_TIPO[t.tipo]})
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Hace {dias} día{dias !== 1 ? 's' : ''} sin completar el formulario
                      </p>
                    </div>
                    {urgente && (
                      <Badge className="text-[9px] h-4 bg-red-100 text-red-700 hover:bg-red-100 border-red-200 shrink-0">
                        urgente
                      </Badge>
                    )}
                  </div>
                )
              })}

              {/* 🟡 Estancados */}
              {estancados.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-sm shrink-0">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {clientePorId[t.cliente_id]?.nombre ?? 'Cliente'} — {LABEL_TIPO[t.tipo]}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Etapa {t.etapa_numero}/{ETAPA_MAX[t.tipo]} · sin avance hace {diasDesde(t.updated_at)} días
                    </p>
                  </div>
                </div>
              ))}

              {/* ✅ Avanzando bien */}
              {avanzandoBien.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {avanzandoBien.length} trámite{avanzandoBien.length !== 1 ? 's' : ''} avanzando normalmente
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {avanzandoBien.map(t => clientePorId[t.cliente_id]?.nombre ?? 'Cliente').join(' · ')}
                    </p>
                  </div>
                </div>
              )}

              {!hayAlertasTramites && avanzandoBien.length === 0 && (
                <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">Sin trámites activos.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Pie: métricas rápidas ──────────────────────────── */}
          <Separator className="bg-border" />
          <div className="flex gap-6 flex-wrap pt-0.5">
            {[
              { valor: activos.length,    label: 'En curso' },
              { valor: finalizados.length, label: 'Finalizados' },
              { valor: clientes.length,   label: 'Clientes' },
            ].map(item => (
              <div key={item.label} className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-foreground">{item.valor}</span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Subcomponente: item de agenda ─────────────────────────────────────────────
function ItemAgenda({ item }: { item: BriefingItem }) {
  const cfg = URGENCIA_CONFIG[item.urgencia]

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
      <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
      <span className="text-sm shrink-0 leading-none">{TIPO_ICON[item.tipo]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug truncate">{item.titulo}</p>
        {item.hora && <p className="text-[10px] text-muted-foreground mt-0.5">{item.hora} hs</p>}
      </div>
      <span className={cn(
        'shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full border',
        cfg.badge
      )}>
        {cfg.label}
      </span>
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-foreground text-primary-foreground hover:bg-foreground/90 transition-colors whitespace-nowrap"
        >
          Unirse →
        </a>
      )}
    </div>
  )
}
