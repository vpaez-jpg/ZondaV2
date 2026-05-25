'use client'

import { useState } from 'react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn }       from '@/lib/utils'

// ── Corte Zonda fijo (no depende de plazo) ──────────────────────
const CORTE_ZONDA       = 135_000
const PRECIO_SUGERIDO   = 450_000

type TipoAmparo = 'ART9' | 'GANANCIAS'

function ars(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-AR')
}

function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface Props {
  tipo:          TipoAmparo
  nombrePartner: string
  onClose:       () => void
}

export default function EnviarAmparoModal({ tipo, nombrePartner, onClose }: Props) {
  const label      = tipo === 'ART9' ? 'Amparo Art. 9 Ley 24.463' : 'Amparo Ganancias'
  const apiRoute   = tipo === 'ART9' ? '/api/generar-propuesta-art9' : '/api/generar-propuesta-ganancias'
  const anyosLabel = tipo === 'ART9' ? '2 años' : '5 años'

  // Datos del cliente
  const [nombre,   setNombre]   = useState('')
  const [email,    setEmail]    = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState(generarPassword())

  // Precio — el partner ajusta el precio que cobra al cliente
  const [precioCliente, setPrecioCliente] = useState(PRECIO_SUGERIDO)

  // Opción de % sobre lo recuperado
  const [incluyePorcentaje, setIncluyePorcentaje] = useState(true)

  // Estado
  const [cargando,  setCargando]  = useState(false)
  const [error,     setError]     = useState('')
  const [resultado, setResultado] = useState<{ tramiteId: string; emailEnviado: boolean } | null>(null)

  async function handleEnviar() {
    setError('')
    if (!nombre.trim() || !email.trim()) {
      setError('El nombre y el email del cliente son obligatorios.')
      return
    }
    if (!email.includes('@')) {
      setError('El email no parece válido.')
      return
    }
    if (precioCliente <= 0) {
      setError('El precio debe ser mayor a cero.')
      return
    }

    setCargando(true)
    try {
      const res = await fetch(apiRoute, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nombre:              nombre.trim(),
          email:               email.trim(),
          telefono:            telefono.trim(),
          password,
          precio_cliente:      precioCliente,
          incluye_porcentaje:  incluyePorcentaje,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error ?? 'Error al enviar la propuesta.')
        return
      }
      setResultado({ tramiteId: json.tramiteId, emailEnviado: json.emailEnviado })
    } catch (e) {
      setError(String(e))
    } finally {
      setCargando(false)
    }
  }

  // ── VISTA: RESULTADO ───────────────────────────────────────
  if (resultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-md p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground">Propuesta enviada</h2>
          <p className="text-sm text-muted-foreground">
            {resultado.emailEnviado
              ? `El cliente ${nombre} recibió el email con sus credenciales y el detalle de la propuesta de ${label}.`
              : `El trámite fue creado. El email no se pudo enviar (revisá la configuración de Resend).`}
          </p>
          <div className="w-full bg-muted rounded-lg p-3 text-left text-xs text-muted-foreground">
            <p><span className="font-semibold text-foreground">Trámite ID:</span> {resultado.tramiteId.slice(0, 8)}…</p>
            <p><span className="font-semibold text-foreground">Cliente:</span> {nombre} ({email})</p>
            <p><span className="font-semibold text-foreground">Contraseña temporal:</span> {password}</p>
          </div>
          <Button onClick={onClose} className="w-full mt-2">Cerrar</Button>
        </div>
      </div>
    )
  }

  // ── VISTA: FORMULARIO ──────────────────────────────────────
  const gananciaZonda     = precioCliente > CORTE_ZONDA ? precioCliente - CORTE_ZONDA : 0
  const porcentajePartner = precioCliente > 0 ? Math.round(((precioCliente - CORTE_ZONDA) / precioCliente) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">Nueva propuesta — {label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Completá los datos para enviarle la propuesta al cliente</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Datos del cliente */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Datos del cliente</p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="am-nombre" className="text-xs mb-1 block">Nombre completo *</Label>
                <Input id="am-nombre" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="María López" className="h-9 text-sm"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="am-email" className="text-xs mb-1 block">Email *</Label>
                  <Input id="am-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@email.com" className="h-9 text-sm"/>
                </div>
                <div>
                  <Label htmlFor="am-telefono" className="text-xs mb-1 block">Teléfono</Label>
                  <Input id="am-telefono" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="2614XXXXXXX" className="h-9 text-sm"/>
                </div>
              </div>
              <div>
                <Label htmlFor="am-password" className="text-xs mb-1 block">Contraseña temporal para el portal</Label>
                <div className="flex gap-2">
                  <Input id="am-password" value={password} onChange={e => setPassword(e.target.value)} className="h-9 text-sm font-mono"/>
                  <Button type="button" variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={() => setPassword(generarPassword())}>
                    Nueva
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Precio */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Honorarios</p>

            {/* Precio que el partner cobra al cliente */}
            <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
              <div>
                <Label htmlFor="am-precio" className="text-xs mb-1 block">Honorario para el cliente (ARS)</Label>
                <Input
                  id="am-precio"
                  type="number"
                  value={precioCliente}
                  onChange={e => setPrecioCliente(Number(e.target.value))}
                  className="h-9 text-sm font-mono"
                  min={0}
                  step={10000}
                />
                <p className="text-xs text-muted-foreground mt-1">Sugerido: {ars(PRECIO_SUGERIDO)}</p>
              </div>

              {/* Desglose */}
              <div className="border-t border-border pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Corte Zonda Legal (fijo)</span>
                  <span className="font-semibold text-foreground">{ars(CORTE_ZONDA)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tu ganancia neta</span>
                  <span className={cn('font-semibold', gananciaZonda >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {ars(gananciaZonda)} ({porcentajePartner}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Porcentaje sobre recupero */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setIncluyePorcentaje(v => !v)}
                className={cn(
                  'w-full flex items-start gap-3 border rounded-xl p-3 text-left transition-colors',
                  incluyePorcentaje ? 'border-foreground/30 bg-foreground/5' : 'border-border bg-background',
                )}
              >
                <div className={cn('mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0', incluyePorcentaje ? 'bg-foreground border-foreground' : 'border-border')}>
                  {incluyePorcentaje && <svg className="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Incluir 20% sobre lo recuperado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Además del honorario fijo, cobrás el 20% de los fondos que ARCA/ANSES reintegre al cliente. Zonda no cobra comisión sobre este porcentaje.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Info del servicio */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-800 mb-1">¿Qué incluye este servicio?</p>
            <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
              <li>Redacción del escrito de inicio de acción de amparo</li>
              <li>El cliente sube su DNI y bonos de sueldo de los últimos {anyosLabel} (o credenciales de Mi ANSES)</li>
              <li>Generación automática del DOCX listo para presentar en el juzgado federal</li>
            </ul>
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleEnviar}
            disabled={cargando || !nombre.trim() || !email.trim()}
            className="flex-1"
          >
            {cargando ? 'Enviando…' : 'Enviar propuesta'}
          </Button>
        </div>
      </div>
    </div>
  )
}
