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

interface Parte {
  tipo:          'fisica' | 'juridica'
  nombre:        string
  dni_cuit:      string
  domicilio:     string
  email:         string
  telefono:      string
  rep_legal:     string   // if juridica
  dni_cargo_rep: string   // if juridica
}

function parteVacia(): Parte {
  return { tipo: 'fisica', nombre: '', dni_cuit: '', domicilio: '', email: '', telefono: '', rep_legal: '', dni_cargo_rep: '' }
}

// ── Indicador de progreso ──────────────────────────────────────
const BLOQUES_LABELS = ['Las partes', 'El proyecto', 'Plazos', 'Cláusulas', 'Penalidades']

function ProgresoNDA({ bloque }: { bloque: Bloque }) {
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

// ── Sub-form para datos de una parte ──────────────────────────
function FormParte({
  titulo,
  parte,
  onChange,
}: {
  titulo:   string
  parte:    Parte
  onChange: (p: Parte) => void
}) {
  const set = (k: keyof Parte, v: string) => onChange({ ...parte, [k]: v })

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">{titulo}</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...parte, tipo: 'fisica' })}
          className={cn(
            'py-2 px-3 rounded-lg border text-xs font-medium transition-all',
            parte.tipo === 'fisica'
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:border-foreground/30',
          )}
        >
          Persona física
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...parte, tipo: 'juridica' })}
          className={cn(
            'py-2 px-3 rounded-lg border text-xs font-medium transition-all',
            parte.tipo === 'juridica'
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:border-foreground/30',
          )}
        >
          Persona jurídica (empresa)
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">
            {parte.tipo === 'fisica' ? 'Nombre completo' : 'Razón social'}
          </Label>
          <Input value={parte.nombre} onChange={e => set('nombre', e.target.value)}
            placeholder={parte.tipo === 'fisica' ? 'Juan García' : 'Mi Empresa S.A.'} />
        </div>
        <div>
          <Label className="text-xs">
            {parte.tipo === 'fisica' ? 'DNI' : 'CUIT'}
          </Label>
          <Input value={parte.dni_cuit} onChange={e => set('dni_cuit', e.target.value)}
            placeholder={parte.tipo === 'fisica' ? '25.123.456' : '30-12345678-9'} />
        </div>
        <div>
          <Label className="text-xs">Domicilio completo</Label>
          <Input value={parte.domicilio} onChange={e => set('domicilio', e.target.value)}
            placeholder="Av. San Martín 1234, Mendoza" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={parte.email} onChange={e => set('email', e.target.value)}
            placeholder="email@ejemplo.com" />
        </div>
        <div>
          <Label className="text-xs">Teléfono (opcional)</Label>
          <Input value={parte.telefono} onChange={e => set('telefono', e.target.value)}
            placeholder="+54 9 261 123-4567" />
        </div>
        {parte.tipo === 'juridica' && (
          <>
            <div>
              <Label className="text-xs">Representante legal — nombre y DNI</Label>
              <Input value={parte.rep_legal} onChange={e => set('rep_legal', e.target.value)}
                placeholder="María López, DNI 28.000.000" />
            </div>
            <div>
              <Label className="text-xs">Cargo del representante</Label>
              <Input value={parte.dni_cargo_rep} onChange={e => set('dni_cargo_rep', e.target.value)}
                placeholder="Presidenta / Apoderada" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────
export default function FormNDA({ tramiteId, datosPropuesta, onSubmitOk, onCancel }: Props) {
  const [bloque, setBloque] = useState<Bloque>(1)
  const [error,  setError]  = useState('')
  const [isPending, startTransition] = useTransition()

  // Bloque 1 — Las partes
  const [divulgadora, setDivulgadora] = useState<Parte>(parteVacia())
  const [receptora,   setReceptora]   = useState<Parte>(parteVacia())

  // Bloque 2 — El proyecto
  const [sector,              setSector]              = useState('')
  const [tipoAcuerdo,         setTipoAcuerdo]         = useState<'unilateral' | 'bilateral'>('unilateral')
  const [incluirDescripcion,  setIncluirDescripcion]  = useState(false)
  const [descripcionProyecto, setDescripcionProyecto] = useState('')
  const [propositoPermitido,  setPropositoPermitido]  = useState('')

  // Bloque 3 — Plazos
  const [duracionConf,       setDuracionConf]       = useState<'1' | '2' | '5' | 'indefinido'>('5')
  const [proteccionPerpetua, setProteccionPerpetua] = useState(true)
  const [retroactividad,     setRetroactividad]     = useState(false)
  const [ciudadFirma,        setCiudadFirma]        = useState('Mendoza')
  const [fechaFirma,         setFechaFirma]         = useState('')

  // Bloque 4 — Cláusulas adicionales
  const [noCompete,          setNoCompete]          = useState(false)
  const [duracionNoCompete,  setDuracionNoCompete]  = useState<'1' | '2' | '3' | '5' | '7'>('2')
  const [nonSolicitation,    setNonSolicitation]    = useState(true)
  const [cesionPI,           setCesionPI]           = useState(false)
  const [noResiduales,       setNoResiduales]       = useState(false)
  const [noPublicidad,       setNoPublicidad]       = useState(false)

  // Bloque 5 — Penalidades y cierre
  const [montoPeralidad,     setMontoPenalidad]     = useState<'10000' | '20000' | '30000'>('20000')
  const [foro,               setForo]               = useState<'ordinario_mendoza' | 'arbitraje_bcm'>('ordinario_mendoza')
  const [mediacionPrevia,    setMediacionPrevia]    = useState(false)
  const [idioma,             setIdioma]             = useState<'es' | 'en' | 'bilingual'>('es')
  const [plazoSel,           setPlazoSel]           = useState<'24hs' | '3dias' | '5dias'>('3dias')
  const [quiereReunion,      setQuiereReunion]      = useState(false)

  function ars(n: number) {
    return '$ ' + Math.round(n).toLocaleString('es-AR')
  }

  // ── Validaciones por bloque ──────────────────────────────────
  function validarBloque(): string {
    if (bloque === 1) {
      if (!divulgadora.nombre.trim())  return 'Completá el nombre de la Parte Divulgadora.'
      if (!divulgadora.dni_cuit.trim()) return 'Completá el DNI/CUIT de la Parte Divulgadora.'
      if (!divulgadora.domicilio.trim()) return 'Completá el domicilio de la Parte Divulgadora.'
      if (!receptora.nombre.trim())    return 'Completá el nombre de la Parte Receptora.'
      if (!receptora.dni_cuit.trim())  return 'Completá el DNI/CUIT de la Parte Receptora.'
      if (!receptora.domicilio.trim()) return 'Completá el domicilio de la Parte Receptora.'
    }
    if (bloque === 2) {
      if (!sector) return 'Seleccioná el sector del proyecto.'
      if (!propositoPermitido.trim()) return 'Describí brevemente el propósito del acuerdo.'
      if (incluirDescripcion && !descripcionProyecto.trim())
        return 'Escribí la descripción del proyecto o desactivá esa opción.'
    }
    if (bloque === 3) {
      if (!ciudadFirma.trim()) return 'Indicá la ciudad de firma.'
    }
    return ''
  }

  function siguiente() {
    const err = validarBloque()
    if (err) { setError(err); return }
    setError('')
    setBloque((b => (b + 1) as Bloque)(bloque))
  }

  function anterior() {
    setError('')
    setBloque((b => (b - 1) as Bloque)(bloque))
  }

  function handleSubmit() {
    const err = validarBloque()
    if (err) { setError(err); return }
    setError('')

    const datos = {
      // Bloque 1
      divulgadora,
      receptora,
      // Bloque 2
      sector,
      tipo_acuerdo:          tipoAcuerdo,
      incluir_descripcion:   incluirDescripcion,
      descripcion_proyecto:  descripcionProyecto,
      proposito_permitido:   propositoPermitido,
      // Bloque 3
      duracion_confidencialidad:    duracionConf,
      proteccion_perpetua_secretos: proteccionPerpetua,
      retroactividad,
      ciudad_firma:   ciudadFirma,
      fecha_firma:    fechaFirma,
      // Bloque 4
      incluir_no_compete:      noCompete,
      duracion_no_compete:     noCompete ? duracionNoCompete : null,
      incluir_non_solicitation: nonSolicitation,
      incluir_cesion_pi:       cesionPI,
      incluir_no_residuales:   noResiduales,
      incluir_no_publicidad:   noPublicidad,
      // Bloque 5
      monto_penal:             Number(montoPeralidad),
      foro_resolucion:         foro,
      incluir_mediacion_previa: foro === 'arbitraje_bcm' ? mediacionPrevia : false,
      idioma,
      plazo_seleccionado:      plazoSel,
      quiere_reunion:          quiereReunion,
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

  // ── Checkbox helper ──────────────────────────────────────────
  function Checkbox({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
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

  return (
    <div className="space-y-4">
      <ProgresoNDA bloque={bloque} />

      {/* ── BLOQUE 1: Las partes ─────────────────────────────── */}
      {bloque === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">¿Quiénes participan en el acuerdo?</p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete los datos de ambas partes. La <strong>Parte Divulgadora</strong> es quien comparte la información.
              La <strong>Parte Receptora</strong> es quien la recibe y se compromete a mantenerla en reserva.
            </p>
          </div>
          <FormParte titulo="Parte Divulgadora — quien comparte la información" parte={divulgadora} onChange={setDivulgadora} />
          <FormParte titulo="Parte Receptora — quien recibe la información" parte={receptora} onChange={setReceptora} />
        </div>
      )}

      {/* ── BLOQUE 2: El proyecto ────────────────────────────── */}
      {bloque === 2 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">El proyecto o negocio</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cuéntenos brevemente de qué se trata lo que se va a proteger con este acuerdo.
            </p>
          </div>

          <div>
            <Label className="text-xs">¿A qué sector o industria pertenece el proyecto?</Label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              <option value="">Seleccioná una opción</option>
              <option value="tecnologia">Tecnología / Software</option>
              <option value="arquitectura">Arquitectura / Diseño</option>
              <option value="salud">Salud / Medtech</option>
              <option value="comercio">Comercio / Retail</option>
              <option value="gastronomia">Gastronomía / Alimentos</option>
              <option value="servicios_profesionales">Servicios profesionales</option>
              <option value="manufactura">Manufactura / Industria</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">¿Solo una parte comparte información, o las dos?</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['unilateral', 'bilateral'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoAcuerdo(t)}
                  className={cn(
                    'py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left',
                    tipoAcuerdo === t
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  <span className="font-semibold capitalize">{t}</span>
                  <span className="block text-xs mt-0.5 opacity-75">
                    {t === 'unilateral' ? 'Solo una parte comparte información' : 'Ambas partes comparten información'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">¿Para qué se va a compartir la información?</Label>
            <Input
              value={propositoPermitido}
              onChange={e => setPropositoPermitido(e.target.value)}
              placeholder="Ej: evaluar una posible inversión, desarrollar un software en conjunto..."
              className="mt-1"
            />
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={incluirDescripcion}
              onChange={setIncluirDescripcion}
              label="Incluir una descripción del proyecto en el documento"
              sub="Recomendado si desea que el acuerdo mencione explícitamente de qué se trata el negocio o proyecto"
            />
            {incluirDescripcion && (
              <div>
                <Label className="text-xs">Descripción del proyecto</Label>
                <Textarea
                  value={descripcionProyecto}
                  onChange={e => setDescripcionProyecto(e.target.value)}
                  placeholder="Describí brevemente el proyecto, en qué etapa está, qué tipo de información se va a compartir..."
                  rows={4}
                  className="mt-1 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BLOQUE 3: Plazos ─────────────────────────────────── */}
      {bloque === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Duración del acuerdo</p>
            <p className="text-xs text-muted-foreground mt-1">
              ¿Por cuánto tiempo debe mantenerse la confidencialidad una vez que termine la relación entre las partes?
            </p>
          </div>

          <div>
            <Label className="text-xs">¿Por cuánto tiempo se mantiene la confidencialidad?</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {([['1', '1 año'], ['2', '2 años'], ['5', '5 años (recomendado)'], ['indefinido', 'Indefinido']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDuracionConf(val)}
                  className={cn(
                    'py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                    duracionConf === val
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={proteccionPerpetua}
              onChange={setProteccionPerpetua}
              label="Proteger la información más sensible sin límite de tiempo"
              sub="Los datos estratégicos, la información técnica clave y los secretos comerciales quedan protegidos de forma permanente (recomendado)"
            />
            <Checkbox
              checked={retroactividad}
              onChange={setRetroactividad}
              label="La protección cubre también la información ya compartida"
              sub="Recomendado si ya comenzaron a compartir información antes de firmar el acuerdo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ciudad de firma</Label>
              <Input
                value={ciudadFirma}
                onChange={e => setCiudadFirma(e.target.value)}
                placeholder="Mendoza"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Fecha estimada de firma (opcional)</Label>
              <Input
                type="date"
                value={fechaFirma}
                onChange={e => setFechaFirma(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── BLOQUE 4: Cláusulas opcionales ───────────────────── */}
      {bloque === 4 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Protecciones adicionales</p>
            <p className="text-xs text-muted-foreground mt-1">
              Todas son opcionales. Puede seleccionar las que considere necesarias.
            </p>
          </div>

          <Checkbox
            checked={noCompete}
            onChange={v => { setNoCompete(v); if (v) setNonSolicitation(true) }}
            label="Restricción de competencia"
            sub="Quien recibe la información no puede usar lo aprendido para competir con quien la compartió, durante el período que se indique"
          />

          {noCompete && (
            <div className="pl-7">
              <Label className="text-xs">Duración de la no competencia (post-terminación)</Label>
              <div className="grid grid-cols-5 gap-1 mt-1">
                {(['1', '2', '3', '5', '7'] as const).map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setDuracionNoCompete(y)}
                    className={cn(
                      'py-1.5 rounded-lg border text-xs font-medium transition-all',
                      duracionNoCompete === y
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    {y} {y === '1' ? 'año' : 'años'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Checkbox
            checked={nonSolicitation}
            onChange={setNonSolicitation}
            label="Protección de empleados, clientes y proveedores"
            sub="Quien recibe la información no puede contratar a los empleados del otro ni acercarse a sus clientes o proveedores"
          />

          <Checkbox
            checked={cesionPI}
            onChange={setCesionPI}
            label="Los materiales creados pertenecen a quien compartió la información"
            sub="Si quien recibe la información crea algo basado en ella, ese trabajo pertenece a la otra parte. Recomendado para proveedores y colaboradores externos"
          />

          <Checkbox
            checked={noResiduales}
            onChange={setNoResiduales}
            label="Restricción de uso de conocimiento retenido"
            sub="Se limita el uso de conceptos aprendidos que se recuerden sin necesidad de documentos. Habitual en acuerdos del sector tecnológico"
          />

          <Checkbox
            checked={noPublicidad}
            onChange={setNoPublicidad}
            label="Reserva sobre la existencia de la relación"
            sub="Ninguna de las partes puede mencionar públicamente que existe este acuerdo ni que están trabajando juntas"
          />
        </div>
      )}

      {/* ── BLOQUE 5: Penalidades y cierre ───────────────────── */}
      {bloque === 5 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Últimos detalles</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ya casi terminamos. Solo algunos detalles más para completar el acuerdo.
            </p>
          </div>

          <div>
            <Label className="text-xs">¿Qué monto debería pagar quien incumpla el acuerdo?</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([['10000', 'USD 10.000'], ['20000', 'USD 20.000 (recomendado)'], ['30000', 'USD 30.000']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMontoPenalidad(val)}
                  className={cn(
                    'py-2 px-2 rounded-lg border text-xs font-medium transition-all',
                    montoPeralidad === val
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Si surge un conflicto, ¿cómo prefieren resolverlo?</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setForo('ordinario_mendoza')}
                className={cn(
                  'py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left',
                  foro === 'ordinario_mendoza'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
                )}
              >
                <span className="font-semibold block">Justicia ordinaria</span>
                <span className="opacity-75">Tribunales de Mendoza</span>
              </button>
              <button
                type="button"
                onClick={() => setForo('arbitraje_bcm')}
                className={cn(
                  'py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left',
                  foro === 'arbitraje_bcm'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
                )}
              >
                <span className="font-semibold block">Arbitraje privado</span>
                <span className="opacity-75">Bolsa de Comercio de Mendoza</span>
              </button>
            </div>
            {foro === 'arbitraje_bcm' && (
              <div className="mt-2">
                <Checkbox
                  checked={mediacionPrevia}
                  onChange={setMediacionPrevia}
                  label="Intentar mediación antes del arbitraje"
                  sub="Las partes deben pasar por una instancia de mediación antes de ir al arbitraje"
                />
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Idioma del documento</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([['es', 'Español'], ['en', 'Inglés'], ['bilingual', 'Bilingüe']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setIdioma(val)}
                  className={cn(
                    'py-2 rounded-lg border text-xs font-medium transition-all',
                    idioma === val
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Plazo seleccionado */}
          {(datosPropuesta?.precio_24hs || datosPropuesta?.precio_3dias || datosPropuesta?.precio_5dias) && (
            <div>
              <Label className="text-xs">Plazo de entrega</Label>
              <div className="space-y-2 mt-1">
                {datosPropuesta.precio_24hs && (
                  <button
                    type="button"
                    onClick={() => setPlazoSel('24hs')}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                      plazoSel === '24hs'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    <span>24 horas</span>
                    <span className="font-bold">{ars(datosPropuesta.precio_24hs)}</span>
                  </button>
                )}
                {datosPropuesta.precio_3dias && (
                  <button
                    type="button"
                    onClick={() => setPlazoSel('3dias')}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                      plazoSel === '3dias'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    <span>3 días hábiles</span>
                    <span className="font-bold">{ars(datosPropuesta.precio_3dias)}</span>
                  </button>
                )}
                {datosPropuesta.precio_5dias && (
                  <button
                    type="button"
                    onClick={() => setPlazoSel('5dias')}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                      plazoSel === '5dias'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    <span>5 días hábiles</span>
                    <span className="font-bold">{ars(datosPropuesta.precio_5dias)}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Reunión opcional */}
          {datosPropuesta?.ofrece_reunion && (
            <Checkbox
              checked={quiereReunion}
              onChange={setQuiereReunion}
              label="Solicitar reunión de consulta (sin costo adicional)"
              sub="Una reunión virtual en la que el equipo de Zonda le explicará el contenido y la utilización de su acuerdo"
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
          <Button variant="outline" onClick={anterior} className="flex-1" disabled={isPending}>
            ← Anterior
          </Button>
        ) : (
          <Button variant="outline" onClick={onCancel} className="flex-1" disabled={isPending}>
            Cancelar
          </Button>
        )}
        {bloque < 5 ? (
          <Button onClick={siguiente} className="flex-1" disabled={isPending}>
            Siguiente →
          </Button>
        ) : (
          <Button onClick={handleSubmit} className="flex-1" disabled={isPending}>
            {isPending ? 'Enviando...' : 'Enviar cuestionario'}
          </Button>
        )}
      </div>
    </div>
  )
}
