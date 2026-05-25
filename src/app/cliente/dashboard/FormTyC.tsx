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

// ── Indicador de progreso ──────────────────────────────────────
const BLOQUES_LABELS = ['La empresa', 'La plataforma', 'Los usuarios', 'El negocio', 'Lo legal']

function ProgresoTyC({ bloque }: { bloque: Bloque }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {BLOQUES_LABELS.map((label, i) => {
        const n = (i + 1) as Bloque
        const done   = n < bloque
        const active = n === bloque
        return (
          <div key={n} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={cn('flex items-center gap-1.5', active ? 'opacity-100' : done ? 'opacity-70' : 'opacity-25')}>
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                done || active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
              )}>
                {done ? '✓' : n}
              </div>
              <span className={cn('text-xs hidden sm:block whitespace-nowrap', active ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                {label}
              </span>
            </div>
            {i < BLOQUES_LABELS.length - 1 && (
              <div className={cn('flex-1 h-px mx-1 min-w-[4px]', done ? 'bg-foreground' : 'bg-border')} />
            )}
          </div>
        )
      })}
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

function RadioGroup<T extends string>({
  label, options, value, onChange, columns = 2,
}: {
  label: string
  options: { value: T; label: string; sub?: string }[]
  value: T
  onChange: (v: T) => void
  columns?: 2 | 3
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className={cn('grid gap-2 mt-1', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left',
              value === o.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground/30',
            )}
          >
            <span className="font-semibold block">{o.label}</span>
            {o.sub && <span className="block mt-0.5 opacity-75 text-xs">{o.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────
export default function FormTyC({ tramiteId, datosPropuesta, onSubmitOk, onCancel }: Props) {
  const [bloque, setBloque] = useState<Bloque>(1)
  const [error,  setError]  = useState('')
  const [isPending, startTransition] = useTransition()

  // ── BLOQUE 1: La empresa ─────────────────────────────────────
  const [nombreLegal,      setNombreLegal]      = useState('')
  const [tipoPersona,      setTipoPersona]      = useState<'fisica' | 'juridica'>('juridica')
  const [cuit,             setCuit]             = useState('')
  const [nombreComercial,  setNombreComercial]  = useState('')
  const [emailContacto,    setEmailContacto]    = useState('')
  const [telefonoContacto, setTelefonoContacto] = useState('')
  const [domicilio,        setDomicilio]        = useState('')

  // ── BLOQUE 2: La plataforma ──────────────────────────────────
  const [tipoPlatform,    setTipoPlatform]    = useState<'website' | 'app' | 'ambas'>('website')
  const [urlWebsite,      setUrlWebsite]      = useState('')
  const [nombreApp,       setNombreApp]       = useState('')
  const [categoriaNegocio,setCategoriaNegocio]= useState('')
  const [descripcionPlataforma, setDescripcionPlataforma] = useState('')
  const [vendeProdServ,   setVendeProdServ]   = useState(false)
  const [usuariosUE,      setUsuariosUE]      = useState(false)
  const [paisHosting,     setPaisHosting]     = useState('Argentina')

  // ── BLOQUE 3: Los usuarios ───────────────────────────────────
  const [cuentasUsuarios,   setCuentasUsuarios]   = useState(true)
  const [menoresPermitidos, setMenoresPermitidos] = useState(false)
  const [edadMinima,        setEdadMinima]        = useState<'13' | '16' | '18'>('18')
  const [vinculaRRSS,       setVinculaRRSS]       = useState(false)
  const [contenidoUsuarios, setContenidoUsuarios] = useState(false)
  const [resenias,          setResenias]          = useState(false)
  const [tieneMarketplace,  setTieneMarketplace]  = useState(false)
  const [linksExternos,     setLinksExternos]     = useState(false)

  // ── BLOQUE 4: El modelo de negocio ───────────────────────────
  const [tieneSubscripcion, setTieneSubscripcion]   = useState(false)
  const [renovAutomat,      setRenovAutomat]         = useState(false)
  const [frecuenciaRenov,   setFrecuenciaRenov]     = useState<'mensual' | 'anual' | 'usuario'>('mensual')
  const [tieneProeba,       setTienePrueba]          = useState(false)
  const [formaCancelacion,  setFormaCancelacion]     = useState<'cuenta' | 'soporte' | 'ambas'>('cuenta')
  const [publicidadTerceros,setPublicidadTerceros]   = useState(false)
  const [enviaMarketing,    setEnviaMarketing]       = useState(false)
  const [tiposMarketing,    setTiposMarketing]       = useState<Record<string, boolean>>({ email: false, sms: false, push: false })
  const [linkPrivacidad,    setLinkPrivacidad]       = useState('')

  // ── BLOQUE 5: Lo legal ───────────────────────────────────────
  const [resolucionConflictos, setResolucionConflictos] = useState<'mediacion' | 'arbitraje' | 'justicia_ordinaria'>('justicia_ordinaria')
  const [jurisdiccion,         setJurisdiccion]         = useState('Mendoza')
  const [notificaCambios,      setNotificaCambios]      = useState<'email' | 'plataforma' | 'ambas'>('email')
  const [nombreDocumento,      setNombreDocumento]      = useState<'tyc' | 'servicio' | 'uso'>('tyc')
  const [idioma,               setIdioma]               = useState<'es' | 'en' | 'bilingual'>('es')
  const [fechaVigencia,        setFechaVigencia]        = useState('')
  const [plazoSel,             setPlazoSel]             = useState<'24hs' | '3dias' | '5dias'>('3dias')
  const [quiereReunion,        setQuiereReunion]        = useState(false)

  function ars(n: number) { return '$ ' + Math.round(n).toLocaleString('es-AR') }

  // ── Validaciones ─────────────────────────────────────────────
  function validarBloque(): string {
    if (bloque === 1) {
      if (!nombreLegal.trim()) return 'Indicá el nombre legal de la empresa o titular.'
      if (!cuit.trim()) return 'Ingresá el CUIT.'
      if (!emailContacto.trim()) return 'Ingresá el email de contacto.'
      if (!domicilio.trim()) return 'Ingresá el domicilio.'
    }
    if (bloque === 2) {
      if (tipoPlatform !== 'app' && !urlWebsite.trim()) return 'Ingresá la URL del sitio web.'
      if (tipoPlatform !== 'website' && !nombreApp.trim()) return 'Ingresá el nombre de la aplicación.'
      if (!categoriaNegocio) return 'Seleccioná la categoría del negocio.'
      if (!descripcionPlataforma.trim()) return 'Describí brevemente el servicio que ofrece tu plataforma.'
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
      nombre_legal:       nombreLegal,
      tipo_persona:       tipoPersona,
      cuit,
      nombre_comercial:   nombreComercial,
      email_contacto:     emailContacto,
      telefono_contacto:  telefonoContacto,
      domicilio,
      // Bloque 2
      tipo_plataforma:    tipoPlatform,
      url_website:        urlWebsite,
      nombre_app:         nombreApp,
      categoria_negocio:  categoriaNegocio,
      descripcion:        descripcionPlataforma,
      vende_prod_serv:    vendeProdServ,
      usuarios_ue:        usuariosUE,
      pais_hosting:       paisHosting,
      // Bloque 3
      cuentas_usuarios:   cuentasUsuarios,
      menores_permitidos: menoresPermitidos,
      edad_minima:        menoresPermitidos ? edadMinima : '18',
      vincula_rrss:       vinculaRRSS,
      contenido_usuarios: contenidoUsuarios,
      resenias,
      tiene_marketplace:  tieneMarketplace,
      links_externos:     linksExternos,
      // Bloque 4
      tiene_subscripcion: tieneSubscripcion,
      renov_automatica:   tieneSubscripcion ? renovAutomat : false,
      frecuencia_renov:   tieneSubscripcion ? frecuenciaRenov : null,
      tiene_prueba:       tieneSubscripcion ? tieneProeba : false,
      forma_cancelacion:  tieneSubscripcion ? formaCancelacion : null,
      publicidad_terceros: publicidadTerceros,
      envia_marketing:    enviaMarketing,
      tipos_marketing:    enviaMarketing ? Object.entries(tiposMarketing).filter(([,v])=>v).map(([k])=>k) : [],
      link_privacidad:    linkPrivacidad,
      // Bloque 5
      resolucion_conflictos: resolucionConflictos,
      jurisdiccion,
      notifica_cambios:   notificaCambios,
      nombre_documento:   nombreDocumento,
      idioma,
      fecha_vigencia:     fechaVigencia,
      plazo_seleccionado: plazoSel,
      quiere_reunion:     quiereReunion,
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
      <ProgresoTyC bloque={bloque} />

      {/* ── BLOQUE 1: La empresa ─────────────────────────────── */}
      {bloque === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Datos de la empresa o titular</p>
            <p className="text-xs text-muted-foreground mt-1">
              Esta información aparecerá en el encabezado de los Términos y Condiciones como la entidad responsable del servicio.
            </p>
          </div>

          <RadioGroup
            label="¿Quién es el titular del servicio?"
            options={[
              { value: 'juridica', label: 'Empresa o sociedad', sub: 'S.A., S.R.L., SAS, LLC...' },
              { value: 'fisica',   label: 'Persona física', sub: 'Profesional independiente' },
            ]}
            value={tipoPersona}
            onChange={setTipoPersona}
          />

          <div>
            <Label className="text-xs">{tipoPersona === 'juridica' ? 'Razón social (nombre legal)' : 'Nombre y apellido completo'}</Label>
            <Input value={nombreLegal} onChange={e => setNombreLegal(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">CUIT</Label>
              <Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="30-12345678-9" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nombre comercial / marca <span className="text-muted-foreground font-normal">(si es distinto al legal)</span></Label>
              <Input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Domicilio legal</Label>
            <Input value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Av. San Martín 1234, Mendoza, Argentina" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email de contacto</Label>
              <Input type="email" value={emailContacto} onChange={e => setEmailContacto(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Teléfono <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input type="tel" value={telefonoContacto} onChange={e => setTelefonoContacto(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
      )}

      {/* ── BLOQUE 2: La plataforma ──────────────────────────── */}
      {bloque === 2 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Su plataforma o servicio</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cuéntenos sobre el canal o plataforma para la que necesita los Términos y Condiciones.
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
                <button key={o.value} type="button" onClick={() => setTipoPlatform(o.value)}
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
            <Label className="text-xs">¿A qué categoría pertenece el servicio?</Label>
            <select value={categoriaNegocio} onChange={e => setCategoriaNegocio(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              <option value="">Seleccioná una opción</option>
              <option value="ecommerce">E-commerce (venta de productos)</option>
              <option value="marketplace">Marketplace (conecta compradores y vendedores)</option>
              <option value="saas">SaaS (software como servicio)</option>
              <option value="servicios_profesionales">Servicios profesionales</option>
              <option value="contenidos">Plataforma de contenidos / educación</option>
              <option value="comunidad">Red social / comunidad</option>
              <option value="reservas">Reservas / turnos</option>
              <option value="fintech">Fintech / pagos</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">¿Qué hace su plataforma? <span className="text-muted-foreground font-normal">(2-3 líneas para el preámbulo del documento)</span></Label>
            <Textarea
              value={descripcionPlataforma}
              onChange={e => setDescripcionPlataforma(e.target.value)}
              placeholder="Ej: Somos una plataforma que conecta a profesionales de diseño con empresas que buscan servicios creativos. Facilitamos la publicación de proyectos y el contacto directo entre clientes y proveedores..."
              rows={3}
              className="mt-1 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={vendeProdServ}
              onChange={setVendeProdServ}
              label="La plataforma vende productos o servicios directamente"
              sub="Incluyendo productos físicos, digitales, suscripciones o acceso a funcionalidades de pago"
            />
            <Checkbox
              checked={usuariosUE}
              onChange={setUsuariosUE}
              label="Tienen usuarios en la Unión Europea"
              sub="Importante para incluir cláusulas de cumplimiento con el RGPD (Reglamento General de Protección de Datos)"
            />
          </div>

          <div>
            <Label className="text-xs">¿En qué país está alojada (hosteada) la plataforma?</Label>
            <Input value={paisHosting} onChange={e => setPaisHosting(e.target.value)} className="mt-1" />
          </div>
        </div>
      )}

      {/* ── BLOQUE 3: Los usuarios ───────────────────────────── */}
      {bloque === 3 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Sobre los usuarios de la plataforma</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cuéntenos cómo interactúan los usuarios con su plataforma.
            </p>
          </div>

          <Checkbox
            checked={cuentasUsuarios}
            onChange={setCuentasUsuarios}
            label="Los usuarios pueden crear una cuenta en la plataforma"
            sub="Si los usuarios se registran para acceder a funcionalidades, marque esta opción"
          />

          <Checkbox
            checked={vinculaRRSS}
            onChange={setVinculaRRSS}
            label="Los usuarios pueden vincular sus cuentas de redes sociales"
            sub="Por ejemplo: iniciar sesión con Google, Facebook, Apple, etc."
          />

          <div className="space-y-2">
            <Checkbox
              checked={menoresPermitidos}
              onChange={setMenoresPermitidos}
              label="La plataforma permite el acceso a menores de 18 años"
              sub="Si su plataforma está dirigida exclusivamente a adultos, no marque esta opción"
            />
            {menoresPermitidos && (
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

          <Checkbox
            checked={contenidoUsuarios}
            onChange={setContenidoUsuarios}
            label="Los usuarios pueden publicar contenido"
            sub="Comentarios, fotos, videos, publicaciones, opiniones u otro contenido generado por los propios usuarios"
          />

          <Checkbox
            checked={resenias}
            onChange={setResenias}
            label="Los usuarios pueden dejar reseñas o valoraciones"
            sub="De productos, servicios, proveedores u otros usuarios de la plataforma"
          />

          <Checkbox
            checked={tieneMarketplace}
            onChange={setTieneMarketplace}
            label="La plataforma tiene un marketplace entre usuarios"
            sub="Es decir, algunos usuarios pueden vender productos o servicios a otros usuarios dentro de la plataforma"
          />

          <Checkbox
            checked={linksExternos}
            onChange={setLinksExternos}
            label="La plataforma incluye enlaces a sitios web de terceros"
            sub="Links a otras páginas que no son de su propiedad"
          />
        </div>
      )}

      {/* ── BLOQUE 4: El modelo de negocio ───────────────────── */}
      {bloque === 4 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">El modelo de negocio</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cuéntenos cómo funciona el modelo comercial de su plataforma.
            </p>
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={tieneSubscripcion}
              onChange={setTieneSubscripcion}
              label="Ofrecen una suscripción de pago"
              sub="Acceso a funcionalidades o contenidos mediante un pago periódico (mensual, anual, etc.)"
            />

            {tieneSubscripcion && (
              <div className="pl-7 space-y-3">
                <Checkbox
                  checked={renovAutomat}
                  onChange={setRenovAutomat}
                  label="La suscripción se renueva automáticamente"
                  sub="El cobro se realiza de forma automática al vencer el período"
                />

                <div>
                  <Label className="text-xs">¿Con qué frecuencia se renueva?</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {([
                      { value: 'mensual',  label: 'Mensual' },
                      { value: 'anual',    label: 'Anual' },
                      { value: 'usuario',  label: 'El usuario elige' },
                    ] as const).map(o => (
                      <button key={o.value} type="button" onClick={() => setFrecuenciaRenov(o.value)}
                        className={cn('py-1.5 px-2 rounded-lg border text-xs font-medium transition-all',
                          frecuenciaRenov === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                        )}>{o.label}</button>
                    ))}
                  </div>
                </div>

                <Checkbox
                  checked={tieneProeba}
                  onChange={setTienePrueba}
                  label="Ofrecen un período de prueba gratuito"
                  sub="El usuario puede probar la plataforma por un tiempo antes de pagar"
                />

                <div>
                  <Label className="text-xs">¿Cómo pueden cancelar la suscripción?</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {([
                      { value: 'cuenta',  label: 'Desde su cuenta',    sub: 'Autogestión' as string | undefined },
                      { value: 'soporte', label: 'Contactando soporte', sub: 'Via email/chat' as string | undefined },
                      { value: 'ambas',   label: 'Ambas formas',        sub: undefined as string | undefined },
                    ] as const).map(o => (
                      <button key={o.value} type="button" onClick={() => setFormaCancelacion(o.value)}
                        className={cn('py-2 px-2 rounded-lg border text-xs font-medium transition-all text-left',
                          formaCancelacion === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                        )}>
                        <span className="font-semibold block">{o.label}</span>
                        {o.sub && <span className="opacity-75 text-xs">{o.sub}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Checkbox
            checked={publicidadTerceros}
            onChange={setPublicidadTerceros}
            label="Muestran publicidad de terceros en la plataforma"
            sub="Banners, anuncios o cualquier tipo de publicidad de otras empresas"
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
                <Label className="text-xs mb-2 block">¿Por qué canales envían las comunicaciones?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'email', label: 'Email' },
                    { key: 'sms',   label: 'SMS' },
                    { key: 'push',  label: 'Notificaciones push' },
                  ].map(c => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setTiposMarketing(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
                      className={cn('py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                        tiposMarketing[c.key] ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                      )}
                    >{c.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">¿Tienen una Política de Privacidad? <span className="text-muted-foreground font-normal">(URL, opcional)</span></Label>
            <Input
              value={linkPrivacidad}
              onChange={e => setLinkPrivacidad(e.target.value)}
              placeholder="https://miempresa.com/privacidad"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Si no tienen política de privacidad, le recomendamos contratar ese servicio también. La mayoría de las legislaciones la exigen junto con los TyC.
            </p>
          </div>
        </div>
      )}

      {/* ── BLOQUE 5: Lo legal ───────────────────────────────── */}
      {bloque === 5 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Últimos detalles legales</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ya casi terminamos. Solo algunos datos más para completar el documento.
            </p>
          </div>

          <div>
            <Label className="text-xs">Si surge un conflicto con un usuario, ¿cómo prefieren resolverlo?</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { value: 'justicia_ordinaria', label: 'Justicia ordinaria', sub: 'Tribunales civiles' },
                { value: 'mediacion',          label: 'Mediación previa',   sub: 'Luego justicia ordinaria' },
                { value: 'arbitraje',          label: 'Arbitraje privado',  sub: 'Más rápido y privado' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => setResolucionConflictos(o.value)}
                  className={cn('py-2.5 px-2 rounded-lg border text-xs font-medium transition-all text-left',
                    resolucionConflictos === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}>
                  <span className="font-semibold block">{o.label}</span>
                  <span className="opacity-75 text-xs">{o.sub}</span>
                </button>
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
            <Label className="text-xs">¿Cómo notificarán a los usuarios si cambian los Términos?</Label>
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
            <Label className="text-xs">¿Cómo quieren llamar al documento?</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { value: 'tyc',      label: 'Términos y Condiciones' },
                { value: 'servicio', label: 'Términos de Servicio' },
                { value: 'uso',      label: 'Términos de Uso' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => setNombreDocumento(o.value)}
                  className={cn('py-2 px-2 rounded-lg border text-xs font-medium transition-all',
                    nombreDocumento === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Idioma del documento</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { value: 'es',        label: 'Español' },
                { value: 'en',        label: 'Inglés' },
                { value: 'bilingual', label: 'Bilingüe' },
              ] as const).map(o => (
                <button key={o.value} type="button" onClick={() => setIdioma(o.value)}
                  className={cn('py-2 rounded-lg border text-xs font-medium transition-all',
                    idioma === o.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30'
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
              sub="Una reunión virtual en la que el equipo de Zonda le explicará el contenido de sus Términos y Condiciones"
            />
          )}
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
