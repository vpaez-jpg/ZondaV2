// CalculadoraPlazos.tsx
// Trigger: panel izquierdo decorativo (mismo alto que el calendario).
// Al hacer click abre un Dialog centrado con animación shadcn.
// Feriados 2026: inamovibles + trasladables + turísticos (inhábiles).
// Días no laborables (Jueves Santo etc.) = hábiles.
// Turísticos 2026: 23/03, 10/07, 07/12 — confirmados.

'use client'

import { useState, useRef } from 'react'
import { addDays, format, isWeekend } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarIcon, Calculator, Copy, Check,
  ChevronDown, ChevronUp, Bell, Mic, MicOff,
  ExternalLink, Download, CalendarPlus,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { agregarVencimiento } from '@/lib/vencimientos'

// ── Feriados nacionales 2026 ──────────────────────────────────────────────────
const FERIADOS_2026 = [
  { fecha: '2026-01-01', descripcion: 'Año Nuevo' },
  { fecha: '2026-02-16', descripcion: 'Carnaval (lunes)' },
  { fecha: '2026-02-17', descripcion: 'Carnaval (martes)' },
  { fecha: '2026-03-23', descripcion: 'Puente turístico' },
  { fecha: '2026-03-24', descripcion: 'Día Nacional de la Memoria' },
  { fecha: '2026-04-02', descripcion: 'Día del Veterano — Malvinas' },
  { fecha: '2026-04-03', descripcion: 'Viernes Santo' },
  { fecha: '2026-05-01', descripcion: 'Día del Trabajador' },
  { fecha: '2026-05-25', descripcion: 'Revolución de Mayo' },
  { fecha: '2026-06-22', descripcion: 'Paso a la Inmortalidad — Belgrano' },
  { fecha: '2026-07-09', descripcion: 'Día de la Independencia' },
  { fecha: '2026-07-10', descripcion: 'Puente turístico' },
  { fecha: '2026-08-17', descripcion: 'Paso a la Inmortalidad — San Martín' },
  { fecha: '2026-10-12', descripcion: 'Respeto a la Diversidad Cultural' },
  { fecha: '2026-11-23', descripcion: 'Día de la Soberanía Nacional' },
  { fecha: '2026-12-07', descripcion: 'Puente turístico' },
  { fecha: '2026-12-08', descripcion: 'Inmaculada Concepción' },
  { fecha: '2026-12-25', descripcion: 'Navidad' },
]

const feriadosMap = new Map(FERIADOS_2026.map(f => [f.fecha, f.descripcion]))

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface FeriadoExcluido { fecha: Date; descripcion: string }
interface Resultado {
  fechaVencimiento: Date
  feriadosExcluidos: FeriadoExcluido[]
  fdsExcluidos: number
  diasTotalesTranscurridos: number
}

// ── Lógica ────────────────────────────────────────────────────────────────────
function calcularPlazo(fechaActo: Date, dias: number, desdeElSiguiente: boolean): Resultado {
  let current = desdeElSiguiente ? addDays(fechaActo, 1) : new Date(fechaActo)
  const inicio = new Date(current)
  let contados = 0
  const feriadosExcluidos: FeriadoExcluido[] = []
  const vistos = new Set<string>()
  let fdsExcluidos = 0, guard = 0

  while (contados < dias && ++guard < 3650) {
    const fs = format(current, 'yyyy-MM-dd')
    if (isWeekend(current)) {
      fdsExcluidos++; current = addDays(current, 1)
    } else if (feriadosMap.has(fs)) {
      if (!vistos.has(fs)) { vistos.add(fs); feriadosExcluidos.push({ fecha: new Date(current), descripcion: feriadosMap.get(fs)! }) }
      current = addDays(current, 1)
    } else {
      contados++
      if (contados >= dias) break
      current = addDays(current, 1)
    }
  }
  return {
    fechaVencimiento: new Date(current), feriadosExcluidos, fdsExcluidos,
    diasTotalesTranscurridos: Math.round((current.getTime() - inicio.getTime()) / 86400000),
  }
}

function calcularRecordatorio(vencimiento: Date, diasAntes: number): Date {
  let current = addDays(vencimiento, -1)
  let contados = 0, guard = 0
  while (contados < diasAntes && ++guard < 1000) {
    if (!isWeekend(current) && !feriadosMap.has(format(current, 'yyyy-MM-dd'))) {
      contados++; if (contados >= diasAntes) break
    }
    current = addDays(current, -1)
  }
  return new Date(current)
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function googleCalUrl(titulo: string, fecha: Date, descripcion: string) {
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: titulo,
    dates: `${format(fecha, 'yyyyMMdd')}/${format(addDays(fecha, 1), 'yyyyMMdd')}`,
    details: descripcion,
  })
  return `https://calendar.google.com/calendar/render?${p}`
}

function descargarIcs(titulo: string, fecha: Date, descripcion: string, recordatorio: Date) {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zonda Legal//ES',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${format(fecha, 'yyyyMMdd')}`,
    `DTEND;VALUE=DATE:${format(addDays(fecha, 1), 'yyyyMMdd')}`,
    `SUMMARY:${titulo}`,
    `DESCRIPTION:${descripcion.replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM', `TRIGGER;VALUE=DATE-TIME:${format(recordatorio, 'yyyyMMdd')}T090000Z`,
    'ACTION:DISPLAY', `DESCRIPTION:Recordatorio - ${titulo}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href: url, download: 'vencimiento.ics' }).click()
  URL.revokeObjectURL(url)
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function CalculadoraPlazos() {
  const [open, setOpen]                         = useState(false)

  // — Form
  const [fechaActo, setFechaActo]               = useState<Date | undefined>()
  const [diasInput, setDiasInput]               = useState('5')
  const [desdeElSiguiente, setDesdeElSiguiente] = useState(true)
  const [resultado, setResultado]               = useState<Resultado | null>(null)
  const [detalleAbierto, setDetalleAbierto]     = useState(false)
  const [copiado, setCopiado]                   = useState(false)
  const [error, setError]                       = useState('')

  // — Sección calendario
  const [calAbierto, setCalAbierto]             = useState(false)
  const [eventoTitulo, setEventoTitulo]         = useState('')
  const [eventoNota, setEventoNota]             = useState('')
  const [diasRecordatorio, setDiasRecordatorio] = useState('3')
  const [guardado, setGuardado]                 = useState(false)
  const [sincGoogleOk, setSincGoogleOk]         = useState<boolean | null>(null) // null=no intentado
  const [sincGooglePending, setSincGooglePending] = useState(false)

  // — Voz
  const [grabando, setGrabando]                 = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef                          = useRef<any>(null)

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      setFechaActo(undefined); setResultado(null); setError('')
      setCalAbierto(false); setEventoNota(''); setGuardado(false); setDetalleAbierto(false)
    }
  }

  function handleCalcular() {
    setError(''); setResultado(null); setCalAbierto(false); setGuardado(false)
    if (!fechaActo) { setError('Seleccioná la fecha del acto.'); return }
    const dias = parseInt(diasInput)
    if (isNaN(dias) || dias < 1 || dias > 500) { setError('Días hábiles: entre 1 y 500.'); return }
    const res = calcularPlazo(fechaActo, dias, desdeElSiguiente)
    setResultado(res)
    setEventoTitulo(`Vencimiento — ${dias} días hábiles`)
  }

  async function copiar() {
    if (!resultado) return
    await navigator.clipboard.writeText(cap(format(resultado.fechaVencimiento, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })))
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  function handleGuardarLocal() {
    if (!resultado) return
    const dias = parseInt(diasRecordatorio) || 3
    const fechaRec = calcularRecordatorio(resultado.fechaVencimiento, dias)
    agregarVencimiento({
      id: crypto.randomUUID(),
      titulo: eventoTitulo || 'Vencimiento procesal',
      fecha: format(resultado.fechaVencimiento, 'yyyy-MM-dd'),
      nota: eventoNota,
      fechaRecordatorio: format(fechaRec, 'yyyy-MM-dd'),
      diasHabiles: parseInt(diasInput) || 0,
      createdAt: new Date().toISOString(),
    })
    setGuardado(true)
  }

  async function handleSincGoogle() {
    if (!resultado || !fechaRecordatorio) return
    setSincGooglePending(true)
    const titulo = eventoTitulo || 'Vencimiento procesal'
    const fechaVenc = format(resultado.fechaVencimiento, 'yyyy-MM-dd')
    const fechaRec  = format(fechaRecordatorio, 'yyyy-MM-dd')

    // Crear evento principal (vencimiento)
    const res = await fetch('/api/google/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento: {
          summary:     `⚖️ ${titulo}`,
          description: eventoNota || 'Vencimiento procesal — Zonda Legal',
          start: { date: fechaVenc },
          end:   { date: fechaVenc },
          colorId: '11',
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 24 * 60 }] },
        },
      }),
    })
    const data = await res.json()

    if (!data.connected) {
      // No está conectado → abrir Google Calendar en nueva pestaña como fallback
      window.open(googleCalUrl(titulo, resultado.fechaVencimiento, eventoNota), '_blank')
      setSincGoogleOk(null)
    } else if (data.success) {
      // Crear también el recordatorio
      await fetch('/api/google/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: {
            summary:     `🔔 Recordatorio: ${titulo}`,
            description: `Recordatorio de vencimiento el ${fechaVenc}`,
            start: { date: fechaRec },
            end:   { date: fechaRec },
            colorId: '5',
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
          },
        }),
      })
      setSincGoogleOk(true)
      handleGuardarLocal()
    } else {
      setSincGoogleOk(false)
    }
    setSincGooglePending(false)
  }

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
    rec.onresult = (e: any) => {
      let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setEventoNota(t)
    }
    rec.onend = () => setGrabando(false)
    recognitionRef.current = rec; rec.start()
  }

  const diasHabilesNum = parseInt(diasInput) || 0
  const fechaRecordatorio = resultado
    ? calcularRecordatorio(resultado.fechaVencimiento, parseInt(diasRecordatorio) || 3)
    : null

  return (
    <>
      {/* ── Panel trigger (ocupa h-full del grid) ─────────────────── */}
      <Card
        onClick={() => setOpen(true)}
        className="h-full flex flex-col items-center justify-center gap-5 p-6 cursor-pointer group border-border hover:border-slate-300 hover:shadow-sm transition-all duration-150 select-none"
      >
        {/* Ícono grande */}
        <div className="w-14 h-14 rounded-2xl bg-slate-100 group-hover:bg-slate-200 transition-colors flex items-center justify-center">
          <Calculator className="w-7 h-7 text-slate-500 group-hover:text-slate-700 transition-colors" />
        </div>

        {/* Texto central */}
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">Calculadora de Plazos</p>
          <p className="text-xs text-muted-foreground">Días hábiles procesales</p>
        </div>

        {/* CTA sutil */}
        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors mt-1">
          Hacer cálculo →
        </span>
      </Card>

      {/* ── Dialog emergente ─────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calculator className="w-4 h-4 text-slate-500" />
              Calculadora de Plazos Procesales
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">

            {/* Fecha del acto */}
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha del acto / notificación</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal h-9 text-sm', !fechaActo && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                    {fechaActo ? cap(format(fechaActo, "d 'de' MMMM yyyy", { locale: es })) : 'Elegí una fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fechaActo}
                    onSelect={d => { setFechaActo(d); setResultado(null) }}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Días hábiles */}
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="calc-dias">Días hábiles a contar</Label>
              <Input
                id="calc-dias"
                type="number" min={1} max={500}
                value={diasInput}
                onChange={e => { setDiasInput(e.target.value); setResultado(null) }}
                className="h-9 text-sm"
              />
            </div>

            {/* Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={desdeElSiguiente}
                onChange={e => { setDesdeElSiguiente(e.target.checked); setResultado(null) }}
                className="mt-0.5 w-3.5 h-3.5 rounded accent-foreground shrink-0"
              />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
                El plazo comienza a correr desde el día siguiente al acto
              </span>
            </label>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button onClick={handleCalcular} className="w-full" size="sm">
              <Calculator className="w-3.5 h-3.5 mr-1.5" />
              Calcular vencimiento
            </Button>

            {/* ── Resultado ──────────────────────────────────── */}
            {resultado && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Vencimiento</p>
                    <p className="text-lg font-bold text-foreground leading-tight">
                      {cap(format(resultado.fechaVencimiento, 'EEEE', { locale: es }))}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {cap(format(resultado.fechaVencimiento, "d 'de' MMMM 'de' yyyy", { locale: es }))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {diasHabilesNum} día{diasHabilesNum !== 1 ? 's' : ''} hábil{diasHabilesNum !== 1 ? 'es' : ''} · {resultado.diasTotalesTranscurridos} corridos
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={copiar} className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted shrink-0">
                    {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>

                {/* Desglose */}
                <div className="flex gap-2 flex-wrap">
                  {resultado.fdsExcluidos > 0 && (
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground bg-transparent">
                      {resultado.fdsExcluidos} fin{resultado.fdsExcluidos !== 1 ? 'es' : ''} de semana
                    </Badge>
                  )}
                  {resultado.feriadosExcluidos.length > 0 && (
                    <button
                      onClick={() => setDetalleAbierto(v => !v)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-full px-2 py-0.5 transition-colors"
                    >
                      {resultado.feriadosExcluidos.length} feriado{resultado.feriadosExcluidos.length !== 1 ? 's' : ''}
                      {detalleAbierto ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                    </button>
                  )}
                </div>

                {detalleAbierto && resultado.feriadosExcluidos.length > 0 && (
                  <div className="space-y-1">
                    {resultado.feriadosExcluidos.map(f => (
                      <div key={format(f.fecha, 'yyyy-MM-dd')} className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-muted-foreground w-10 shrink-0">{format(f.fecha, 'd/MM')}</span>
                        <span className="text-[10px] text-foreground">{f.descripcion}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Separator className="bg-border" />

                {/* Agregar al calendario */}
                {!calAbierto ? (
                  <button
                    onClick={() => setCalAbierto(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Agregar al calendario
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Título del evento</Label>
                      <Input
                        value={eventoTitulo}
                        onChange={e => setEventoTitulo(e.target.value)}
                        className="h-8 text-xs border-border focus-visible:ring-ring"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">Nota</Label>
                        <button
                          onClick={toggleGrabacion}
                          className={cn(
                            'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                            grabando ? 'border-red-300 text-red-600 bg-red-50 animate-pulse' : 'border-border text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {grabando ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                          {grabando ? 'Detener' : 'Grabar'}
                        </button>
                      </div>
                      <textarea
                        value={eventoNota}
                        onChange={e => setEventoNota(e.target.value)}
                        rows={2}
                        placeholder="¿Qué vence en esta fecha?..."
                        className="w-full text-xs rounded-md border border-border bg-transparent px-2.5 py-1.5 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Bell className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground">Recordatorio</span>
                      <Input
                        type="number" min={1} max={30}
                        value={diasRecordatorio}
                        onChange={e => setDiasRecordatorio(e.target.value)}
                        className="h-6 w-12 text-xs border-border text-center px-1"
                      />
                      <span className="text-[10px] text-muted-foreground">días hábiles antes</span>
                    </div>
                    {fechaRecordatorio && (
                      <p className="text-[10px] text-muted-foreground">
                        → {cap(format(fechaRecordatorio, "d 'de' MMMM", { locale: es }))}
                      </p>
                    )}

                    <div className="flex gap-2 flex-wrap pt-0.5">
                      <button
                        onClick={handleSincGoogle}
                        disabled={sincGooglePending}
                        className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-md bg-foreground text-primary-foreground hover:bg-foreground/90 disabled:opacity-60 transition-colors"
                      >
                        {sincGooglePending ? (
                          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <ExternalLink className="w-3 h-3" />
                        )}
                        {sincGooglePending ? 'Guardando...' : 'Google Calendar'}
                      </button>
                      <button
                        onClick={() => {
                          if (!resultado || !fechaRecordatorio) return
                          descargarIcs(eventoTitulo || 'Vencimiento procesal', resultado.fechaVencimiento, eventoNota, fechaRecordatorio)
                          handleGuardarLocal()
                        }}
                        className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-muted transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        .ics
                      </button>
                      {(guardado || sincGoogleOk === true) && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Check className="w-3 h-3" />
                          {sincGoogleOk === true ? 'Sincronizado en Google ✓' : 'Guardado'}
                        </span>
                      )}
                      {sincGoogleOk === false && (
                        <span className="text-[10px] text-red-500">Error al sincronizar</span>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground pt-0.5 border-t border-border">
                  ⚠ No incluye ferias judiciales (enero/julio).
                </p>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/50 pb-1">
              Feriados 2026 según decreto del PEN. Cálculo orientativo.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
