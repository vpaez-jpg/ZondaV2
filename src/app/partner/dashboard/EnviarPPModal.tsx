'use client'

import { useState } from 'react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn }       from '@/lib/utils'

// ── Corte Zonda fijo por plazo ──────────────────────────────────
const CORTE_ZONDA_24HS  = 300_000
const CORTE_ZONDA_3DIAS = 210_000
const CORTE_ZONDA_5DIAS = 150_000

// Precio sugerido al cliente (lo que el partner cobra al cliente)
const PRECIO_SUGERIDO_24HS  = 1_000_000
const PRECIO_SUGERIDO_3DIAS =   700_000
const PRECIO_SUGERIDO_5DIAS =   500_000

function ars(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-AR')
}

function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Componente ─────────────────────────────────────────────────
interface Props {
  nombrePartner: string
  onClose: () => void
}

export default function EnviarPPModal({ nombrePartner, onClose }: Props) {
  // Datos del cliente
  const [nombre,   setNombre]   = useState('')
  const [email,    setEmail]    = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState(generarPassword())

  // Precios — partner configura el precio total que cobra al cliente
  const [precio24hs,  setPrecio24hs]  = useState(PRECIO_SUGERIDO_24HS)
  const [precio3dias, setPrecio3dias] = useState(PRECIO_SUGERIDO_3DIAS)
  const [precio5dias, setPrecio5dias] = useState(PRECIO_SUGERIDO_5DIAS)

  // Reunión (expandable info, sin precio)
  const [ofreceReunion,   setOfreceReunion]   = useState(false)
  const [showReunionInfo, setShowReunionInfo] = useState(false)

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
    if (precio24hs <= 0 || precio3dias <= 0 || precio5dias <= 0) {
      setError('Los tres precios deben ser mayores a cero.')
      return
    }
    if (precio3dias > precio24hs) {
      setError('El precio de 3 días no puede ser mayor que el de 24 horas.')
      return
    }
    if (precio5dias > precio3dias) {
      setError('El precio de 5 días no puede ser mayor que el de 3 días.')
      return
    }

    setCargando(true)
    try {
      const res = await fetch('/api/generar-propuesta-pp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         nombre.trim(),
          email:          email.trim(),
          telefono:       telefono.trim(),
          password,
          precio_24hs:    precio24hs,
          precio_3dias:   precio3dias,
          precio_5dias:   precio5dias,
          ofrece_reunion: ofreceReunion,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al generar la propuesta.')
        return
      }
      setResultado({ tramiteId: data.tramiteId, emailEnviado: data.emailEnviado })
    } catch {
      setError('Error de red. Verificá tu conexión e intentá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  function generarWA() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zondalegal.com'
    const dest   = telefono.trim().replace(/\D/g, '')
    const msg    = `Hola ${nombre.split(' ')[0]}, soy ${nombrePartner.split(' ')[0]}.\n\nTe comparto la propuesta para la redacción de las Políticas de Privacidad de tu plataforma.\n\nPara avanzar, ingresá al portal:\n${appUrl}/cliente/dashboard\n\nEmail: ${email.trim()}\nContraseña temporal: ${password}\n\nCuando ingreses vas a poder completar el cuestionario y elegir el plazo de entrega. Cualquier consulta, avisame.`
    const base   = dest ? `https://wa.me/${dest}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── Vista de éxito ─────────────────────────────────────────
  if (resultado) {
    return (
      <div className="space-y-4">
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-foreground rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-background text-xl">✓</span>
          </div>
          <p className="text-sm font-semibold text-foreground">Propuesta de Políticas de Privacidad creada</p>
          <p className="text-xs text-muted-foreground mt-1">
            {resultado.emailEnviado
              ? `El email de bienvenida fue enviado a ${email}.`
              : `El trámite fue creado. Enviá las credenciales por WhatsApp.`}
          </p>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cliente</span>
            <span className="font-medium text-foreground">{nombre}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium text-foreground">{email}</span>
          </div>
          {telefono.trim() && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Teléfono</span>
              <span className="font-medium text-foreground">{telefono}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contraseña temporal</span>
            <span className="font-mono font-medium text-foreground">{password}</span>
          </div>
        </div>

        <Button onClick={generarWA} className="w-full" variant="outline">
          Enviar por WhatsApp
        </Button>
        <Button onClick={onClose} className="w-full">
          Cerrar
        </Button>
      </div>
    )
  }

  // ── Formulario ─────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Datos del cliente */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Datos del cliente</p>
        <div>
          <Label className="text-xs">Nombre completo</Label>
          <Input value={nombre} onChange={e => setNombre(e.target.value)}
            className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Teléfono <span className="text-muted-foreground font-normal">(para enviar por WhatsApp)</span></Label>
          <Input
            type="tel"
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Contraseña temporal (generada automáticamente)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 text-xs"
              onClick={() => setPassword(generarPassword())}
            >
              Nueva
            </Button>
          </div>
        </div>
      </div>

      {/* Precios */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Tus honorarios según el plazo de entrega</p>

        {[
          {
            label:     '24 horas',
            precio:    precio24hs,
            setPrecio: setPrecio24hs,
            sugerido:  PRECIO_SUGERIDO_24HS,
            corte:     CORTE_ZONDA_24HS,
          },
          {
            label:     '3 días hábiles',
            precio:    precio3dias,
            setPrecio: setPrecio3dias,
            sugerido:  PRECIO_SUGERIDO_3DIAS,
            corte:     CORTE_ZONDA_3DIAS,
          },
          {
            label:     '5 días hábiles',
            precio:    precio5dias,
            setPrecio: setPrecio5dias,
            sugerido:  PRECIO_SUGERIDO_5DIAS,
            corte:     CORTE_ZONDA_5DIAS,
          },
        ].map(({ label, precio, setPrecio, sugerido, corte }) => {
          const tusParte = Math.max(0, precio - corte)
          return (
            <div key={label} className="border border-border rounded-xl p-3 space-y-2">
              <span className="text-xs font-medium text-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Precio al cliente:</span>
                <Input
                  type="number"
                  value={precio}
                  onChange={e => setPrecio(Number(e.target.value))}
                  className="h-8 text-xs"
                  min={0}
                  step={1000}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sugerido: <button
                  type="button"
                  className="underline text-foreground"
                  onClick={() => setPrecio(sugerido)}
                >{ars(sugerido)}</button>
                {' · '}Corte Zonda fijo: {ars(corte)}
                {' · '}Sus honorarios: <strong className="text-foreground">{ars(tusParte)}</strong>
              </p>
            </div>
          )
        })}
      </div>

      {/* Reunión — checkbox independiente del panel de info */}
      <div className="space-y-2">
        <div className={cn(
          'flex items-start gap-3 px-3 py-3 rounded-lg border transition-all',
          ofreceReunion ? 'border-foreground bg-foreground/5' : 'border-border',
        )}>
          {/* Checkbox */}
          <button
            type="button"
            onClick={() => setOfreceReunion(v => !v)}
            className="flex items-start gap-3 flex-1 text-left"
          >
            <div className={cn(
              'w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 border transition-all',
              ofreceReunion ? 'bg-foreground border-foreground' : 'border-muted-foreground',
            )}>
              {ofreceReunion && <span className="text-background text-xs font-bold">✓</span>}
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Ofrecer reunión de consulta <span className="text-muted-foreground font-normal">(sin costo)</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">El cliente podrá solicitar una reunión para revisar las Políticas de Privacidad</p>
            </div>
          </button>
          {/* Flecha para ver detalles */}
          <button
            type="button"
            onClick={() => setShowReunionInfo(v => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            title={showReunionInfo ? 'Ocultar detalles' : 'Ver detalles'}
          >
            <svg
              className={cn('w-4 h-4 transition-transform', showReunionInfo ? 'rotate-180' : '')}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showReunionInfo && (
          <div className="border border-border rounded-xl p-4 bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-foreground">¿Qué incluye?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Puede ofrecer al cliente una reunión virtual en la que el equipo de ZONDA explicará el contenido y la forma de utilización de sus Políticas de Privacidad una vez redactadas. Esta reunión es complementaria al servicio y no tiene costo adicional para el cliente ni para usted.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Si marca esta opción, el cliente verá en su propuesta que la reunión de consulta está incluida de forma opcional. Para coordinar fecha y horario, debe usted registrar una reunión con nosotros indicando el nombre del cliente luego de que el cliente le haya informado su disponibilidad.
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Acciones */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onClose} className="flex-1" disabled={cargando}>
          Cancelar
        </Button>
        <Button onClick={handleEnviar} className="flex-1" disabled={cargando}>
          {cargando ? 'Creando...' : 'Crear propuesta →'}
        </Button>
      </div>
    </div>
  )
}
