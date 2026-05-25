'use client'

import { useState, useEffect } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { cn } from '@/lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface CobroVencido {
  id:                string
  concepto:          string
  monto_total:       number
  monto_cobrado:     number
  fecha_vencimiento: string
  cliente_nombre:    string | null
  cliente_telefono:  string | null   // perfiles.telefono
  cliente_whatsapp:  string | null   // perfiles.whatsapp_link
  tipo:              string
}

interface Props {
  cobros:        CobroVencido[]
  nombrePartner: string
  onClose:       () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ars(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }

function diasVencido(fechaStr: string): number {
  return differenceInCalendarDays(new Date(), new Date(fechaStr + 'T12:00:00'))
}

function buildWhatsAppUrl(telefono: string | null, mensaje: string): string {
  const texto = encodeURIComponent(mensaje)
  if (telefono) {
    const numero = telefono.replace(/\D/g, '')
    return `https://wa.me/${numero}?text=${texto}`
  }
  return `https://wa.me/?text=${texto}`
}

// ── Tarjeta de un cobro vencido ────────────────────────────────────────────────

function CobroCard({
  cobro,
  nombrePartner,
}: {
  cobro:         CobroVencido
  nombrePartner: string
}) {
  const [mensaje,    setMensaje]    = useState('')
  const [generando,  setGenerando]  = useState(true)
  const [copiado,    setCopiado]    = useState(false)

  const pendiente = cobro.monto_total - cobro.monto_cobrado
  const dias      = diasVencido(cobro.fecha_vencimiento)
  const cliente   = cobro.cliente_nombre ?? 'el/la cliente'
  const telefono  = cobro.cliente_whatsapp ?? cobro.cliente_telefono ?? null

  // Generar mensaje al montar
  useEffect(() => {
    async function generar() {
      setGenerando(true)
      try {
        const res = await fetch('/api/partner/mensaje-cobranza', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clienteNombre: cliente,
            concepto:      cobro.concepto,
            monto:         pendiente,
            diasVencido:   dias,
            nombrePartner,
          }),
        })
        const data = await res.json()
        if (data.mensaje) setMensaje(data.mensaje)
        else setMensaje(mensajeFallback())
      } catch {
        setMensaje(mensajeFallback())
      } finally {
        setGenerando(false)
      }
    }

    function mensajeFallback(): string {
      const diasStr = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`
      return `¡Hola ${cliente}! Espero que estés muy bien. Quería comentarte que el pago de "${cobro.concepto}" por ${ars(pendiente)} venció ${diasStr}. Cuando puedas, te agradecería que lo coordines. ¡Muchas gracias!`
    }

    generar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copiar() {
    if (!mensaje) return
    await navigator.clipboard.writeText(mensaje)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      {/* Info del cobro */}
      <div className="px-4 py-3 flex items-start gap-3 border-b border-border bg-muted/30">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{cliente}</p>
          <p className="text-xs text-muted-foreground truncate">{cobro.concepto}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-foreground">{ars(pendiente)}</p>
          <p className="text-[10px] text-muted-foreground">
            {dias === 0 ? 'Vence hoy'
              : dias === 1 ? 'Venció ayer'
              : `Venció hace ${dias} días`}
          </p>
        </div>
      </div>

      {/* Mensaje generado */}
      <div className="px-4 py-3 space-y-3">
        {generando ? (
          <div className="space-y-2">
            <div className="h-3 bg-muted animate-pulse rounded w-full" />
            <div className="h-3 bg-muted animate-pulse rounded w-4/5" />
            <div className="h-3 bg-muted animate-pulse rounded w-3/5" />
          </div>
        ) : (
          <textarea
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            rows={5}
            className="w-full resize-none bg-muted/40 border border-border rounded-lg px-3 py-2.5 text-xs text-foreground leading-relaxed focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        )}

        {/* Botones de acción */}
        <div className="flex gap-2">
          <button
            onClick={copiar}
            disabled={generando || !mensaje}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors',
              copiado
                ? 'bg-foreground text-primary-foreground border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background disabled:opacity-40'
            )}
          >
            {copiado ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Copiado
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                Copiar texto
              </>
            )}
          </button>

          <a
            href={mensaje ? buildWhatsAppUrl(telefono, mensaje) : '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { if (!mensaje || generando) e.preventDefault() }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors',
              !mensaje || generando
                ? 'border-border text-muted-foreground/40 bg-background cursor-not-allowed pointer-events-none'
                : 'border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/5 bg-background'
            )}
          >
            {/* WhatsApp icon */}
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.522 5.855L.057 23.882a.5.5 0 00.61.61l6.028-1.465A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.177-1.431l-.37-.22-3.832.931.95-3.821-.241-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            {telefono ? 'Enviar por WhatsApp' : 'Abrir WhatsApp'}
          </a>
        </div>

        {!telefono && !generando && (
          <p className="text-[10px] text-muted-foreground/70">
            Sin número guardado — WhatsApp abrirá para que elijas el contacto manualmente.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Modal principal ────────────────────────────────────────────────────────────

export default function AlertaCobranzaModal({ cobros, nombrePartner, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [])

  function cerrar() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  const total = cobros.reduce((s, c) => s + (c.monto_total - c.monto_cobrado), 0)

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200',
      visible ? 'opacity-100' : 'opacity-0'
    )}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cerrar} />

      {/* Panel */}
      <div className={cn(
        'relative w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-200 overflow-hidden',
        visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
      )} style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {cobros.length === 1 ? '1 cobro vencido' : `${cobros.length} cobros vencidos`}
              </p>
              <p className="text-xs text-muted-foreground">
                Total pendiente: {ars(total)}
              </p>
            </div>
          </div>
          <button onClick={cerrar} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-xl leading-none shrink-0">
            ×
          </button>
        </div>

        {/* Descripción */}
        <div className="px-5 py-3 bg-muted/30 border-b border-border shrink-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Estos cobros están vencidos y pendientes de pago. Cada uno tiene un mensaje listo para enviar. Podés editarlo antes de copiarlo o enviarlo por WhatsApp.
          </p>
        </div>

        {/* Lista de cobros */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {cobros.map(cobro => (
            <CobroCard
              key={cobro.id}
              cobro={cobro}
              nombrePartner={nombrePartner}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground">
            Podés marcar los cobros como pagados desde el Gestor de Cobros.
          </p>
          <button
            onClick={cerrar}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            Gestionar después →
          </button>
        </div>
      </div>
    </div>
  )
}
