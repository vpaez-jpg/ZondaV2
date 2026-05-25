'use client'

import { useState, useTransition } from 'react'
import { guardarFormulario } from './actions'
import { Button }            from '@/components/ui/button'
import { Input }             from '@/components/ui/input'
import { Label }             from '@/components/ui/label'
import { Textarea }          from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn }                from '@/lib/utils'

// ── Tipos ──────────────────────────────────────────────────────
interface Props {
  tramiteId: string
  datosPropuesta?: {
    precio_24hs?:    number
    precio_3dias?:   number
    precio_5dias?:   number
    ofrece_reunion?: boolean
  } | null
  onSubmitOk: () => void
  onCancel:   () => void
}

type Bloque = 1 | 2 | 3 | 4 | 5

// ── Barra de progreso ──────────────────────────────────────────
const BLOQUES_LABELS = ['La organización', 'La plataforma', 'Los datos', 'Terceros y uso', 'Derechos y legal']

function ProgresoBar({ bloque }: { bloque: Bloque }) {
  const pct = Math.round(((bloque - 1) / (BLOQUES_LABELS.length - 1)) * 100)
  return (
    <div className="mb-6">
      {/* Etiqueta actual */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">{BLOQUES_LABELS[bloque - 1]}</span>
        <span className="text-xs text-muted-foreground">{bloque} / {BLOQUES_LABELS.length}</span>
      </div>
      {/* Barra */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground rounded-full transition-all duration-300"
          style={{ width: `${bloque === 1 ? 10 : pct}%` }}
        />
      </div>
      {/* Pasos */}
      <div className="flex items-center gap-1 mt-2">
        {BLOQUES_LABELS.map((label, i) => {
          const n = (i + 1) as Bloque
          const done   = n < bloque
          const active = n === bloque
          return (
            <div key={n} className="flex items-center gap-1 flex-1 min-w-0">
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                done   ? 'bg-foreground text-background' :
                active ? 'bg-foreground text-background ring-2 ring-foreground/30' :
                         'bg-muted text-muted-foreground',
              )}>
                {done ? '✓' : n}
              </div>
              {i < BLOQUES_LABELS.length - 1 && (
                <div className={cn('flex-1 h-px mx-0.5 min-w-[2px]', done ? 'bg-foreground' : 'bg-border')} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Helpers UI ─────────────────────────────────────────────────
function Checkbox({ checked, onChange, label, sub }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  sub?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'w-full text-left flex items-start gap-3 px-3 py-3 rounded-lg border transition-all',
        checked ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/30',
      )}
    >
      <div className={cn(
        'w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 border transition-all',
        checked ? 'bg-foreground border-foreground' : 'border-muted-foreground',
      )}>
        {checked && <span className="text-background text-xs font-bold">✓</span>}
      </div>
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </button>
  )
}

function CheckGroup({ label, items, values, onChange }: {
  label: string
  items: { key: string; label: string }[]
  values: Record<string, boolean>
  onChange: (key: string, v: boolean) => void
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-2 gap-2 mt-1">
        {items.map(it => (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key, !values[it.key])}
            className={cn(
              'py-2 px-3 rounded-lg border text-xs font-medium transition-all text-left',
              values[it.key]
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground/30',
            )}
          >{it.label}</button>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────
export default function FormPP({ tramiteId, datosPropuesta, onSubmitOk, onCancel }: Props) {
  const [bloque, setBloque] = useState<Bloque>(1)
  const [error,  setError]  = useState('')
  const [isPending, startTransition] = useTransition()

  // ── BLOQUE 1: La organización ────────────────────────────────
  const [tipoPersona,        setTipoPersona]        = useState<'fisica' | 'juridica'>('juridica')
  const [nombreLegal,        setNombreLegal]        = useState('')
  const [cuit,               setCuit]               = useState('')
  const [nombreComercial,    setNombreComercial]    = useState('')
  const [domicilio,          setDomicilio]          = useState('')
  const [emailContacto,      setEmailContacto]      = useState('')
  const [telefonoContacto,   setTelefonoContacto]   = useState('')
  const [emailPrivacidad,    setEmailPrivacidad]    = useState('')

  // ── BLOQUE 2: La plataforma ──────────────────────────────────
  const [tipoPlatform,         setTipoPlatform]         = useState<'website' | 'app' | 'ambas'>('website')
  const [urlWebsite,           setUrlWebsite]           = useState('')
  const [nombreApp,            setNombreApp]            = useState('')
  const [descripcionServicio,  setDescripcionServicio]  = useState('')
  const [usuariosUE,           setUsuariosUE]           = useState(false)
  const [paisHosting,          setPaisHosting]          = useState('Argentina')
  const [tieneMinores,         setTieneMinores]         = useState(false)
  const [edadMinima,           setEdadMinima]           = useState<'13' | '16' | '18'>('18')
  const [cuentasUsuarios,      setCuentasUsuarios]      = useState(true)
  const [eliminacionCuenta,    setEliminacionCuenta]    = useState<'cuenta' | 'soporte' | 'ambas'>('cuenta')

  // ── BLOQUE 3: Los datos que recopilan ───────────────────────
  // Datos personales directos
  const [datosPersonales, setDatosPersonales] = useState<Record<string, boolean>>({
    nombre: false, email: false, telefono: false, domicilio: false,
    cuit_dni: false, foto_perfil: false, titulo_profesional: false, fecha_nacimiento: false,
  })
  // Datos sensibles
  const [tieneDatosSensibles, setTieneDatosSensibles] = useState(false)
  const [datosSensibles, setDatosSensibles] = useState<Record<string, boolean>>({
    salud: false, biometricos: false, origen_racial: false, orientacion_sexual: false,
    religion: false, opiniones_politicas: false,
  })
  // Datos automáticos
  const [datosAutomaticos, setDatosAutomaticos] = useState<Record<string, boolean>>({
    logs_actividad: false, ip_dispositivo: false, cookies: false,
    ubicacion_precisa: false, datos_uso: false,
  })
  // Pago
  const [recopilaDatosPago, setRecopilaDatosPago]   = useState(false)
  const [procesadorPago,    setProcesadorPago]       = useState('')
  // Login social
  const [loginSocial,       setLoginSocial]          = useState(false)
  const [loginSocialOpts,   setLoginSocialOpts]      = useState<Record<string, boolean>>({
    google: false, facebook: false, apple: false, otro: false,
  })
  // Permisos app móvil
  const [tieneApp,          setTieneApp]             = useState(false)
  const [permisosApp,       setPermisosApp]          = useState<Record<string, boolean>>({
    camara: false, microfono: false, contactos: false,
    ubicacion_primer_plano: false, ubicacion_segundo_plano: false, notificaciones: false,
  })

  // ── BLOQUE 4: Terceros y uso de datos ───────────────────────
  // Finalidades de uso
  const [finalidades, setFinalidades] = useState<Record<string, boolean>>({
    proveer_servicio: true, mejorar_producto: false, comunicaciones_transaccionales: false,
    marketing: false, seguridad_fraude: false, cumplimiento_legal: false,
    investigacion: false,
  })
  // Marketing
  const [enviaMarketing,    setEnviaMarketing]       = useState(false)
  const [canalMarketing,    setCanalMarketing]       = useState<Record<string, boolean>>({
    email: false, sms: false, push: false,
  })
  // Terceros / analytics
  const [analytics,         setAnalytics]            = useState<Record<string, boolean>>({
    google_analytics: false, facebook_pixel: false, hotjar: false, otro: false,
  })
  const [publicidadTerceros,setPublicidadTerceros]  = useState(false)
  const [usaIA,             setUsaIA]               = useState(false)
  const [proveedoresIA,     setProveedoresIA]       = useState('')
  const [transferenciaIntl, setTransferenciaIntl]  = useState(false)
  // Retención
  const [periodoRetencion,  setPeriodoRetencion]    = useState('')

  // ── BLOQUE 5: Derechos y legal ───────────────────────────────
  const [medidasSeguridad,    setMedidasSeguridad]    = useState('')
  const [notificaCambios,     setNotificaCambios]     = useState<'email' | 'plataforma' | 'ambas'>('email')
  const [jurisdiccion,        setJurisdiccion]        = useState('Mendoza')
  const [nombreDocumento,     setNombreDocumento]     = useState<'politica' | 'aviso' | 'declaracion'>('politica')
  const [fechaVigencia,       setFechaVigencia]       = useState('')
  const [plazoSel,            setPlazoSel]            = useState<'24hs' | '3dias' | '5dias'>('3dias')
  const [quiereReunion,       setQuiereReunion]       = useState(false)
  const [infoAdicional,       setInfoAdicional]       = useState('')

  function ars(n: number) { return '$ ' + Math.round(n).toLocaleString('es-AR') }

  // ── Validaciones ─────────────────────────────────────────────
  function validarBloque(): string {
    if (bloque === 1) {
      if (!nombreLegal.trim()) return 'Indicá el nombre legal de la empresa o titular.'
      if (!cuit.trim()) return 'Ingresá el CUIT / CUIL.'
      if (!emailContacto.trim()) return 'Ingresá el email de contacto.'
      if (!domicilio.trim()) return 'Ingresá el domicilio legal.'
    }
    if (bloque === 2) {
      if (tipoPlatform !== 'app' && !urlWebsite.trim()) return 'Ingresá la URL del sitio web.'
      if (tipoPlatform !== 'website' && !nombreApp.trim()) return 'Ingresá el nombre de la aplicación.'
      if (!descripcionServicio.trim()) return 'Describí brevemente el servicio que ofrece tu plataforma.'
    }
    if (bloque === 3) {
      const algunDato = Object.values(datosPersonales).some(Boolean)
      if (!algunDato) return 'Seleccioná al menos un tipo de dato personal que recopilás.'
    }
    if (bloque === 5) {
      if (!jurisdiccion.trim()) return 'Indicá la jurisdicción aplicable.'
    }
    return ''
  }

  function siguiente() {
    const err = validarBloque()
    if (err) { setError(err); return }
    setError('')
    setBloque(b => (b + 1) as Bloque)
  }

  function anterior() {
    setError('')
    setBloque(b => (b - 1) as Bloque)
  }

  function handleSubmit() {
    const err = validarBloque()
    if (err) { setError(err); return }
    setError('')

    const datos = {
      // Bloque 1
      tipo_persona:           tipoPersona,
      nombre_legal:           nombreLegal,
      cuit,
      nombre_comercial:       nombreComercial,
      domicilio,
      email_contacto:         emailContacto,
      telefono_contacto:      telefonoContacto,
      email_privacidad:       emailPrivacidad || emailContacto,
      // Bloque 2
      tipo_plataforma:        tipoPlatform,
      url_website:            urlWebsite,
      nombre_app:             nombreApp,
      descripcion_servicio:   descripcionServicio,
      usuarios_ue:            usuariosUE,
      pais_hosting:           paisHosting,
      tiene_menores:          tieneMinores,
      edad_minima:            tieneMinores ? edadMinima : '18',
      cuentas_usuarios:       cuentasUsuarios,
      eliminacion_cuenta:     cuentasUsuarios ? eliminacionCuenta : null,
      // Bloque 3
      datos_personales:       Object.entries(datosPersonales).filter(([,v])=>v).map(([k])=>k),
      tiene_datos_sensibles:  tieneDatosSensibles,
      datos_sensibles:        tieneDatosSensibles ? Object.entries(datosSensibles).filter(([,v])=>v).map(([k])=>k) : [],
      datos_automaticos:      Object.entries(datosAutomaticos).filter(([,v])=>v).map(([k])=>k),
      recopila_datos_pago:    recopilaDatosPago,
      procesador_pago:        recopilaDatosPago ? procesadorPago : '',
      login_social:           loginSocial,
      login_social_opts:      loginSocial ? Object.entries(loginSocialOpts).filter(([,v])=>v).map(([k])=>k) : [],
      tiene_app:              tieneApp || tipoPlatform !== 'website',
      permisos_app:           (tieneApp || tipoPlatform !== 'website') ? Object.entries(permisosApp).filter(([,v])=>v).map(([k])=>k) : [],
      // Bloque 4
      finalidades:            Object.entries(finalidades).filter(([,v])=>v).map(([k])=>k),
      envia_marketing:        enviaMarketing,
      canal_marketing:        enviaMarketing ? Object.entries(canalMarketing).filter(([,v])=>v).map(([k])=>k) : [],
      analytics:              Object.entries(analytics).filter(([,v])=>v).map(([k])=>k),
      publicidad_terceros:    publicidadTerceros,
      usa_ia:                 usaIA,
      proveedores_ia:         usaIA ? proveedoresIA : '',
      transferencia_intl:     transferenciaIntl,
      periodo_retencion:      periodoRetencion,
      // Bloque 5
      medidas_seguridad:      medidasSeguridad,
      notifica_cambios:       notificaCambios,
      jurisdiccion,
      nombre_documento:       nombreDocumento,
      fecha_vigencia:         fechaVigencia,
      plazo_seleccionado:     plazoSel,
      quiere_reunion:         quiereReunion,
      info_adicional:         infoAdicional,
    }

    startTransition(async () => {
      const result = await guardarFormulario(tramiteId, datos)
      if (result?.error) {
        setError(result.error)
      } else {
        onSubmitOk()
      }
    })
  }

  return (
    <div className="space-y-4">
      <ProgresoBar bloque={bloque} />

      {/* ── BLOQUE 1: La organización ─────────────────────────── */}
      {bloque === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Datos de la organización</p>
            <p className="text-xs text-muted-foreground mt-1">
              Esta información identifica al responsable del tratamiento de datos personales en el documento.
            </p>
          </div>

          <div>
            <Label className="text-xs">¿Quién es el titular?</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {([
                { value: 'juridica', label: 'Empresa o sociedad', sub: 'S.A., S.R.L., SAS, LLC...' },
                { value: 'fisica',   label: 'Persona física',     sub: 'Profesional independiente' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => setTipoPersona(o.value)}
                  className={cn('py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left',
                    tipoPersona === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}>
                  <span className="font-semibold block">{o.label}</span>
                  <span className="block mt-0.5 opacity-75 text-xs">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">{tipoPersona === 'juridica' ? 'Razón social (nombre legal)' : 'Nombre y apellido completo'}</Label>
            <Input value={nombreLegal} onChange={e => setNombreLegal(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">CUIT / CUIL</Label>
              <Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="30-12345678-9" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nombre comercial / marca <span className="text-muted-foreground font-normal">(si difiere del legal)</span></Label>
              <Input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Domicilio legal</Label>
            <Input value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Av. San Martín 1234, Mendoza, Argentina" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email de contacto general</Label>
              <Input type="email" value={emailContacto} onChange={e => setEmailContacto(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Teléfono <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input type="tel" value={telefonoContacto} onChange={e => setTelefonoContacto(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Email de privacidad <span className="text-muted-foreground font-normal">(donde los usuarios ejercen sus derechos — opcional, si es diferente al de contacto)</span></Label>
            <Input type="email" value={emailPrivacidad} onChange={e => setEmailPrivacidad(e.target.value)}
              placeholder="privacidad@miempresa.com" className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Si lo dejás vacío, se usará el email de contacto general.</p>
          </div>
        </div>
      )}

      {/* ── BLOQUE 2: La plataforma ──────────────────────────── */}
      {bloque === 2 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Su plataforma o servicio</p>
            <p className="text-xs text-muted-foreground mt-1">
              Describí el canal digital para el que necesitás las Políticas de Privacidad.
            </p>
          </div>

          <div>
            <Label className="text-xs">¿Cuál es el tipo de plataforma?</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { value: 'website', label: 'Sitio web' },
                { value: 'app',     label: 'App móvil' },
                { value: 'ambas',   label: 'Ambas' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => { setTipoPlatform(o.value); if (o.value !== 'website') setTieneApp(true) }}
                  className={cn('py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                    tipoPlatform === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>

          {tipoPlatform !== 'app' && (
            <div>
              <Label className="text-xs">URL del sitio web</Label>
              <Input value={urlWebsite} onChange={e => setUrlWebsite(e.target.value)} placeholder="https://miempresa.com" className="mt-1" />
            </div>
          )}

          {tipoPlatform !== 'website' && (
            <div>
              <Label className="text-xs">Nombre de la aplicación móvil</Label>
              <Input value={nombreApp} onChange={e => setNombreApp(e.target.value)} className="mt-1" />
            </div>
          )}

          <div>
            <Label className="text-xs">¿Qué hace tu plataforma? <span className="text-muted-foreground font-normal">(2-3 líneas para el preámbulo)</span></Label>
            <Textarea
              value={descripcionServicio}
              onChange={e => setDescripcionServicio(e.target.value)}
              placeholder="Ej: Somos una plataforma que conecta profesionales de diseño con empresas que buscan servicios creativos. Los usuarios se registran, publican proyectos y contactan directamente con proveedores..."
              rows={3}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">¿En qué país está hosteada la plataforma?</Label>
            <Input value={paisHosting} onChange={e => setPaisHosting(e.target.value)} className="mt-1" />
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={usuariosUE}
              onChange={setUsuariosUE}
              label="Tienen usuarios en la Unión Europea"
              sub="Importante para incluir cláusulas de cumplimiento con el RGPD"
            />

            <div className="space-y-2">
              <Checkbox
                checked={cuentasUsuarios}
                onChange={setCuentasUsuarios}
                label="Los usuarios pueden crear una cuenta en la plataforma"
                sub="Si los usuarios se registran para acceder a funcionalidades"
              />
              {cuentasUsuarios && (
                <div className="pl-7">
                  <Label className="text-xs">¿Cómo pueden eliminar su cuenta / datos?</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {([
                      { value: 'cuenta',  label: 'Desde su cuenta' },
                      { value: 'soporte', label: 'Contactando soporte' },
                      { value: 'ambas',   label: 'Ambas' },
                    ] as const).map(o => (
                      <button key={o.value} type="button" onClick={() => setEliminacionCuenta(o.value)}
                        className={cn('py-1.5 px-2 rounded-lg border text-xs font-medium transition-all',
                          eliminacionCuenta === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                        )}>{o.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Checkbox
                checked={tieneMinores}
                onChange={setTieneMinores}
                label="La plataforma permite acceso a menores de 18 años"
                sub="Si está dirigida exclusivamente a adultos, no marques esta opción"
              />
              {tieneMinores && (
                <div className="pl-7">
                  <Label className="text-xs">Edad mínima permitida</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {(['13', '16', '18'] as const).map(e => (
                      <button key={e} type="button" onClick={() => setEdadMinima(e)}
                        className={cn('py-1.5 rounded-lg border text-xs font-medium transition-all',
                          edadMinima === e ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                        )}>{e} años</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BLOQUE 3: Los datos que recopilan ───────────────── */}
      {bloque === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Datos personales que recopilás</p>
            <p className="text-xs text-muted-foreground mt-1">
              Seleccioná todos los tipos de datos personales que tu plataforma recopila o procesa.
            </p>
          </div>

          <CheckGroup
            label="Datos que el usuario proporciona directamente"
            items={[
              { key: 'nombre',             label: 'Nombre y apellido' },
              { key: 'email',              label: 'Correo electrónico' },
              { key: 'telefono',           label: 'Teléfono' },
              { key: 'domicilio',          label: 'Domicilio / dirección' },
              { key: 'cuit_dni',           label: 'CUIT / DNI / CUIL' },
              { key: 'fecha_nacimiento',   label: 'Fecha de nacimiento' },
              { key: 'foto_perfil',        label: 'Foto de perfil' },
              { key: 'titulo_profesional', label: 'Cargo / profesión' },
            ]}
            values={datosPersonales}
            onChange={(key, v) => setDatosPersonales(prev => ({ ...prev, [key]: v }))}
          />

          <CheckGroup
            label="Datos recopilados automáticamente"
            items={[
              { key: 'logs_actividad',  label: 'Logs de actividad' },
              { key: 'ip_dispositivo',  label: 'IP / dispositivo' },
              { key: 'cookies',         label: 'Cookies y similares' },
              { key: 'ubicacion_precisa', label: 'Geolocalización precisa' },
              { key: 'datos_uso',       label: 'Datos de uso / navegación' },
            ]}
            values={datosAutomaticos}
            onChange={(key, v) => setDatosAutomaticos(prev => ({ ...prev, [key]: v }))}
          />

          <div className="space-y-2">
            <Checkbox
              checked={tieneDatosSensibles}
              onChange={setTieneDatosSensibles}
              label="Recopilás datos sensibles o especiales"
              sub="Datos de salud, biométricos, origen racial, orientación sexual, religión u opiniones políticas"
            />
            {tieneDatosSensibles && (
              <div className="pl-7">
                <CheckGroup
                  label="¿Cuáles datos sensibles?"
                  items={[
                    { key: 'salud',              label: 'Datos de salud' },
                    { key: 'biometricos',        label: 'Biométricos' },
                    { key: 'origen_racial',      label: 'Origen racial / étnico' },
                    { key: 'orientacion_sexual', label: 'Orientación sexual' },
                    { key: 'religion',           label: 'Religión / creencias' },
                    { key: 'opiniones_politicas',label: 'Opiniones políticas' },
                  ]}
                  values={datosSensibles}
                  onChange={(key, v) => setDatosSensibles(prev => ({ ...prev, [key]: v }))}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={recopilaDatosPago}
              onChange={setRecopilaDatosPago}
              label="Procesan pagos o recopilan datos financieros"
              sub="Tarjetas, cuentas bancarias, tokens de pago, etc."
            />
            {recopilaDatosPago && (
              <div className="pl-7">
                <Label className="text-xs">¿Qué procesador de pagos utilizan?</Label>
                <Input
                  value={procesadorPago}
                  onChange={e => setProcesadorPago(e.target.value)}
                  placeholder="Ej: Mercado Pago, Stripe, PayPal, Prisma..."
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={loginSocial}
              onChange={setLoginSocial}
              label="Los usuarios pueden iniciar sesión con redes sociales"
              sub="Google, Facebook, Apple ID u otros proveedores de identidad"
            />
            {loginSocial && (
              <div className="pl-7">
                <CheckGroup
                  label="¿Con qué redes sociales?"
                  items={[
                    { key: 'google',   label: 'Google' },
                    { key: 'facebook', label: 'Facebook' },
                    { key: 'apple',    label: 'Apple ID' },
                    { key: 'otro',     label: 'Otro' },
                  ]}
                  values={loginSocialOpts}
                  onChange={(key, v) => setLoginSocialOpts(prev => ({ ...prev, [key]: v }))}
                />
              </div>
            )}
          </div>

          {(tipoPlatform === 'app' || tipoPlatform === 'ambas' || tieneApp) && (
            <div>
              <CheckGroup
                label="Permisos que solicita la aplicación móvil"
                items={[
                  { key: 'camara',                  label: 'Cámara' },
                  { key: 'microfono',               label: 'Micrófono' },
                  { key: 'contactos',               label: 'Contactos' },
                  { key: 'ubicacion_primer_plano',  label: 'Ubicación (activa)' },
                  { key: 'ubicacion_segundo_plano', label: 'Ubicación (fondo)' },
                  { key: 'notificaciones',          label: 'Notificaciones push' },
                ]}
                values={permisosApp}
                onChange={(key, v) => setPermisosApp(prev => ({ ...prev, [key]: v }))}
              />
            </div>
          )}
        </div>
      )}

      {/* ── BLOQUE 4: Terceros y uso de datos ───────────────── */}
      {bloque === 4 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Para qué usás los datos y con quién los compartís</p>
            <p className="text-xs text-muted-foreground mt-1">
              Indicá todas las finalidades del tratamiento de datos y los terceros involucrados.
            </p>
          </div>

          <CheckGroup
            label="¿Para qué utilizan los datos personales?"
            items={[
              { key: 'proveer_servicio',                label: 'Proveer el servicio' },
              { key: 'mejorar_producto',                label: 'Mejorar el producto' },
              { key: 'comunicaciones_transaccionales',  label: 'Comunicaciones del servicio' },
              { key: 'marketing',                       label: 'Marketing y promociones' },
              { key: 'seguridad_fraude',                label: 'Seguridad y antifraude' },
              { key: 'cumplimiento_legal',              label: 'Cumplimiento legal' },
              { key: 'investigacion',                   label: 'Investigación y desarrollo' },
            ]}
            values={finalidades}
            onChange={(key, v) => setFinalidades(prev => ({ ...prev, [key]: v }))}
          />

          <div className="space-y-2">
            <Checkbox
              checked={enviaMarketing}
              onChange={setEnviaMarketing}
              label="Envían comunicaciones de marketing a los usuarios"
              sub="Emails promocionales, SMS, notificaciones push u otros mensajes comerciales"
            />
            {enviaMarketing && (
              <div className="pl-7">
                <CheckGroup
                  label="¿Por qué canales?"
                  items={[
                    { key: 'email', label: 'Email' },
                    { key: 'sms',   label: 'SMS' },
                    { key: 'push',  label: 'Push notifications' },
                  ]}
                  values={canalMarketing}
                  onChange={(key, v) => setCanalMarketing(prev => ({ ...prev, [key]: v }))}
                />
              </div>
            )}
          </div>

          <CheckGroup
            label="¿Qué herramientas de analytics o tracking utilizan?"
            items={[
              { key: 'google_analytics', label: 'Google Analytics' },
              { key: 'facebook_pixel',   label: 'Meta Pixel' },
              { key: 'hotjar',           label: 'Hotjar / similar' },
              { key: 'otro',             label: 'Otra herramienta' },
            ]}
            values={analytics}
            onChange={(key, v) => setAnalytics(prev => ({ ...prev, [key]: v }))}
          />

          <Checkbox
            checked={publicidadTerceros}
            onChange={setPublicidadTerceros}
            label="Muestran publicidad de terceros (banners, anuncios)"
            sub="Redes publicitarias que pueden rastrear a los usuarios"
          />

          <div className="space-y-2">
            <Checkbox
              checked={usaIA}
              onChange={setUsaIA}
              label="Utilizan servicios de inteligencia artificial de terceros"
              sub="APIs de IA, procesamiento de lenguaje, visión por computadora, etc."
            />
            {usaIA && (
              <div className="pl-7">
                <Label className="text-xs">¿Qué proveedores de IA utilizan?</Label>
                <Input
                  value={proveedoresIA}
                  onChange={e => setProveedoresIA(e.target.value)}
                  placeholder="Ej: OpenAI, Google Gemini, Anthropic Claude..."
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <Checkbox
            checked={transferenciaIntl}
            onChange={setTransferenciaIntl}
            label="Transfieren datos a servidores fuera de Argentina"
            sub="Hosting, CDN, servicios cloud en el extranjero (AWS, Google Cloud, Azure, etc.)"
          />

          <div>
            <Label className="text-xs">¿Por cuánto tiempo conservan los datos personales de los usuarios?</Label>
            <Input
              value={periodoRetencion}
              onChange={e => setPeriodoRetencion(e.target.value)}
              placeholder="Ej: mientras la cuenta esté activa + 5 años, 2 años desde la última actividad..."
              className="mt-1"
            />
          </div>
        </div>
      )}

      {/* ── BLOQUE 5: Derechos y legal ───────────────────────── */}
      {bloque === 5 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Seguridad, derechos y datos finales</p>
            <p className="text-xs text-muted-foreground mt-1">
              Últimos detalles para completar las Políticas de Privacidad.
            </p>
          </div>

          <div>
            <Label className="text-xs">¿Qué medidas de seguridad implementan para proteger los datos? <span className="text-muted-foreground font-normal">(opcional pero recomendado)</span></Label>
            <Textarea
              value={medidasSeguridad}
              onChange={e => setMedidasSeguridad(e.target.value)}
              placeholder="Ej: cifrado AES-256 en reposo y TLS en tránsito, acceso restringido por roles, autenticación en dos pasos para el equipo interno, backups cifrados..."
              rows={2}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">¿Cómo notificarán a los usuarios si cambian las Políticas?</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { value: 'email',      label: 'Por email' },
                { value: 'plataforma', label: 'En la plataforma' },
                { value: 'ambas',      label: 'Por ambos canales' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => setNotificaCambios(o.value)}
                  className={cn('py-2 px-2 rounded-lg border text-xs font-medium transition-all',
                    notificaCambios === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">¿Qué jurisdicción (provincia) aplica?</Label>
            <select value={jurisdiccion} onChange={e => setJurisdiccion(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              {[
                'Ciudad Autónoma de Buenos Aires',
                'Buenos Aires',
                'Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa',
                'Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro',
                'Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero',
                'Tierra del Fuego','Tucumán',
              ].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <Label className="text-xs">¿Cómo quieren llamar al documento?</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { value: 'politica',    label: 'Política de Privacidad' },
                { value: 'aviso',       label: 'Aviso de Privacidad' },
                { value: 'declaracion', label: 'Declaración de Privacidad' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => setNombreDocumento(o.value)}
                  className={cn('py-2 px-2 rounded-lg border text-xs font-medium transition-all',
                    nombreDocumento === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Fecha de vigencia <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input type="date" value={fechaVigencia} onChange={e => setFechaVigencia(e.target.value)} className="mt-1" />
          </div>

          {/* Plazo de entrega */}
          {(datosPropuesta?.precio_24hs || datosPropuesta?.precio_3dias || datosPropuesta?.precio_5dias) && (
            <div>
              <Label className="text-xs">Plazo de entrega</Label>
              <div className="space-y-2 mt-1">
                {datosPropuesta.precio_24hs && (
                  <button type="button" onClick={() => setPlazoSel('24hs')}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                      plazoSel === '24hs' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                    )}>
                    <span>24 horas</span>
                    <span className="font-bold">{ars(datosPropuesta.precio_24hs)}</span>
                  </button>
                )}
                {datosPropuesta.precio_3dias && (
                  <button type="button" onClick={() => setPlazoSel('3dias')}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                      plazoSel === '3dias' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                    )}>
                    <span>3 días hábiles</span>
                    <span className="font-bold">{ars(datosPropuesta.precio_3dias)}</span>
                  </button>
                )}
                {datosPropuesta.precio_5dias && (
                  <button type="button" onClick={() => setPlazoSel('5dias')}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                      plazoSel === '5dias' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                    )}>
                    <span>5 días hábiles</span>
                    <span className="font-bold">{ars(datosPropuesta.precio_5dias)}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {datosPropuesta?.ofrece_reunion && (
            <Checkbox
              checked={quiereReunion}
              onChange={setQuiereReunion}
              label="Solicitar reunión de consulta (sin costo adicional)"
              sub="Una reunión virtual en la que el equipo de Zonda le explicará el contenido de sus Políticas de Privacidad"
            />
          )}

          <div>
            <Label className="text-xs">¿Hay algo más que quieras que sepamos para la redacción? <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={infoAdicional}
              onChange={e => setInfoAdicional(e.target.value)}
              placeholder="Cualquier característica particular de tu plataforma, aclaraciones sobre el uso de datos, o requisitos específicos..."
              rows={2}
              className="mt-1 text-sm"
            />
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Navegación ───────────────────────────────────────── */}
      <div className="flex gap-2 pt-2">
        {bloque > 1 ? (
          <Button variant="outline" onClick={anterior} className="flex-1" disabled={isPending}>← Anterior</Button>
        ) : (
          <Button variant="outline" onClick={onCancel} className="flex-1" disabled={isPending}>Cancelar</Button>
        )}
        {bloque < 5 ? (
          <Button onClick={siguiente} className="flex-1" disabled={isPending}>Siguiente →</Button>
        ) : (
          <Button onClick={handleSubmit} className="flex-1" disabled={isPending}>
            {isPending ? 'Enviando...' : 'Enviar cuestionario'}
          </Button>
        )}
      </div>
    </div>
  )
}
