'use client'

import { useState, useTransition, useRef } from 'react'
import { guardarFormulario } from './actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

interface DatosPropuesta {
  nombre_marca?: string
  descripcion_productos_servicios?: string
  clases_niza?: { numero: number; nombre: string }[]
  num_clases?: number
  honorarios_por_clase?: number
  total_propuesta?: number
}

interface Props {
  tramiteId: string
  datosPropuesta?: DatosPropuesta | null
  onSubmitOk: () => void
  onCancel: () => void
}

interface TitularFisica {
  tipo: 'fisica'
  nombre: string
  dni: string
  cuit: string
  domicilio: string
  email: string
  telefono: string
  porcentaje: number
}

interface TitularJuridica {
  tipo: 'juridica'
  razon_social: string
  cuit: string
  domicilio: string
  email: string
  telefono: string
  representante: string
  dni_representante: string
  porcentaje: number
}

type Titular = TitularFisica | TitularJuridica

function titularVacioFisica(): TitularFisica {
  return { tipo: 'fisica', nombre: '', dni: '', cuit: '', domicilio: '', email: '', telefono: '', porcentaje: 100 }
}

function titularVacioJuridica(): TitularJuridica {
  return { tipo: 'juridica', razon_social: '', cuit: '', domicilio: '', email: '', telefono: '', representante: '', dni_representante: '', porcentaje: 100 }
}

function ars(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export default function FormMARCAS({ tramiteId, datosPropuesta, onSubmitOk, onCancel }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [titulares, setTitulares] = useState<Titular[]>([titularVacioFisica()])
  const [observaciones, setObservaciones] = useState('')

  // Logotipo
  const [tieneLogotipo, setTieneLogotipo] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    if (file.type.startsWith('image/')) {
      setLogoPreview(URL.createObjectURL(file))
    } else {
      setLogoPreview(null)
    }
  }

  function toggleTieneLogotipo(checked: boolean) {
    setTieneLogotipo(checked)
    if (!checked) {
      setLogoFile(null)
      setLogoPreview(null)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const nombreMarca = datosPropuesta?.nombre_marca ?? ''
  const descripcion = datosPropuesta?.descripcion_productos_servicios ?? ''
  const clases = datosPropuesta?.clases_niza ?? []
  const tienePropuesta = !!nombreMarca

  function agregarTitular() {
    setTitulares(prev => {
      const nuevaParticipacion = Math.floor(100 / (prev.length + 1))
      const updated = prev.map(t => ({ ...t, porcentaje: nuevaParticipacion }))
      return [...updated, { ...titularVacioFisica(), porcentaje: 100 - nuevaParticipacion * prev.length }]
    })
  }

  function quitarTitular(idx: number) {
    setTitulares(prev => prev.filter((_, i) => i !== idx))
  }

  function cambiarTipoTitular(idx: number, tipo: 'fisica' | 'juridica') {
    setTitulares(prev => prev.map((t, i) => {
      if (i !== idx) return t
      return tipo === 'fisica'
        ? { ...titularVacioFisica(), porcentaje: t.porcentaje }
        : { ...titularVacioJuridica(), porcentaje: t.porcentaje }
    }))
  }

  function actualizarTitular(idx: number, campo: string, valor: string | number) {
    setTitulares(prev => prev.map((t, i) => i === idx ? { ...t, [campo]: valor } as Titular : t))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    for (let i = 0; i < titulares.length; i++) {
      const t = titulares[i]
      if (t.tipo === 'fisica') {
        if (!t.nombre.trim()) { setError(`El nombre del titular ${i + 1} es obligatorio.`); return }
        if (!t.dni.trim()) { setError(`El DNI del titular ${i + 1} es obligatorio.`); return }
        if (!t.domicilio.trim()) { setError(`El domicilio del titular ${i + 1} es obligatorio.`); return }
      } else {
        if (!t.razon_social.trim()) { setError(`La razón social del titular ${i + 1} es obligatoria.`); return }
        if (!t.cuit.trim()) { setError(`El CUIT del titular ${i + 1} es obligatorio.`); return }
        if (!t.representante.trim()) { setError(`El representante legal del titular ${i + 1} es obligatorio.`); return }
        if (!t.dni_representante.trim()) { setError(`El DNI del representante del titular ${i + 1} es obligatorio.`); return }
        if (!t.domicilio.trim()) { setError(`El domicilio del titular ${i + 1} es obligatorio.`); return }
      }
    }

    if (titulares.length > 1) {
      const total = titulares.reduce((s, t) => s + t.porcentaje, 0)
      if (total !== 100) {
        setError(`Los porcentajes de titularidad deben sumar 100% (actualmente suman ${total}%).`)
        return
      }
    }

    // Subir logo si corresponde
    let logoMarcaUrl: string | null = null
    if (tieneLogotipo && logoFile) {
      setSubiendoLogo(true)
      const { data: { user } } = await supabase.auth.getUser()
      const clienteId = user?.id ?? 'unknown'
      const ext = logoFile.name.split('.').pop() ?? 'png'
      const path = `${clienteId}/${tramiteId}/logotipo_marca.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(path, logoFile, { upsert: true })

      setSubiendoLogo(false)

      if (uploadError) {
        setError(`Error al subir el logotipo: ${uploadError.message}`)
        return
      }

      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
      logoMarcaUrl = urlData?.publicUrl ?? null
    }

    startTransition(async () => {
      const datos = {
        tipo_formulario: 'MARCAS',
        nombre_marca: nombreMarca,
        descripcion_productos_servicios: descripcion,
        titulares,
        observaciones,
        ...(logoMarcaUrl ? { logo_marca_url: logoMarcaUrl } : {}),
      }
      const result = await guardarFormulario(tramiteId, datos)
      if (result.error) setError(result.error)
      else onSubmitOk()
    })
  }

  const totalPct = titulares.reduce((s, t) => s + t.porcentaje, 0)
  const hayJuridica = titulares.some(t => t.tipo === 'juridica')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Datos para el registro de marca</h3>
        <p className="text-sm text-muted-foreground">Tu estudio necesita esta información para iniciar el trámite ante el INPI.</p>
      </div>

      {/* Resumen de la propuesta (pre-cargada por el partner) */}
      {tienePropuesta ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">📋 Datos de tu trámite (completados por tu estudio)</p>
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="text-xs text-slate-500 font-medium w-24 shrink-0">Marca:</span>
              <span className="text-sm text-slate-900 font-semibold">{nombreMarca}</span>
            </div>
            {descripcion && (
              <div className="flex gap-2">
                <span className="text-xs text-slate-500 font-medium w-24 shrink-0">Descripción:</span>
                <span className="text-sm text-slate-700">{descripcion}</span>
              </div>
            )}
            {clases.length > 0 && (
              <div className="flex gap-2">
                <span className="text-xs text-slate-500 font-medium w-24 shrink-0">Clases Niza:</span>
                <span className="text-sm text-slate-700">
                  {clases.map(c => `Clase ${c.numero}`).join(', ')}
                </span>
              </div>
            )}
            {datosPropuesta?.total_propuesta && (
              <div className="flex gap-2">
                <span className="text-xs text-slate-500 font-medium w-24 shrink-0">Honorarios:</span>
                <span className="text-sm text-slate-900 font-semibold">{ars(datosPropuesta.total_propuesta)} totales</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5">Nombre de la marca *</Label>
            <Input type="text" disabled value={nombreMarca} placeholder="(Tu estudio completará este dato)" className="bg-muted cursor-not-allowed" />
          </div>
          <div>
            <Label className="mb-1.5">Productos/servicios</Label>
            <Textarea disabled value={descripcion} rows={3} placeholder="(Tu estudio completará este dato)" className="bg-muted cursor-not-allowed resize-none" />
          </div>
        </div>
      )}

      {/* Titulares */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <div>
            <label className="text-sm font-medium text-foreground">¿A nombre de quién se registra la marca? *</label>
            <p className="text-xs text-muted-foreground mt-0.5">Podés agregar más de un titular si la marca será compartida.</p>
          </div>
          <button type="button" onClick={agregarTitular}
            className="text-xs text-muted-foreground hover:text-foreground font-medium shrink-0 ml-4">
            + Agregar titular
          </button>
        </div>

        <div className="space-y-5">
          {titulares.map((titular, idx) => (
            <div key={idx} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-3 flex items-center justify-between border-b border-border">
                <p className="text-sm font-medium text-foreground">
                  {titulares.length > 1 ? `Titular ${idx + 1}` : 'Datos del titular'}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex rounded-lg overflow-hidden border border-border text-xs">
                    {(['fisica', 'juridica'] as const).map(tipo => (
                      <button key={tipo} type="button"
                        onClick={() => cambiarTipoTitular(idx, tipo)}
                        className={cn(
                          'px-3 py-1.5 font-medium transition-colors',
                          titular.tipo === tipo
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:text-foreground'
                        )}>
                        {tipo === 'fisica' ? 'Persona física' : 'Empresa / Sociedad'}
                      </button>
                    ))}
                  </div>
                  {titulares.length > 1 && (
                    <button type="button" onClick={() => quitarTitular(idx)}
                      className="text-xs text-destructive hover:text-destructive/80">Quitar</button>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {titular.tipo === 'fisica' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Nombre y apellido completo *</label>
                      <Input value={titular.nombre} onChange={e => actualizarTitular(idx, 'nombre', e.target.value)}
                        placeholder="Ej: Juan Carlos Pérez" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">DNI *</label>
                      <Input value={titular.dni} onChange={e => actualizarTitular(idx, 'dni', e.target.value)}
                        placeholder="Ej: 30.123.456" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
                      <Input value={titular.cuit} onChange={e => actualizarTitular(idx, 'cuit', e.target.value)}
                        placeholder="Ej: 20-30123456-7" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Domicilio completo *</label>
                      <Input value={titular.domicilio} onChange={e => actualizarTitular(idx, 'domicilio', e.target.value)}
                        placeholder="Calle, número, ciudad, provincia" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Email</label>
                      <Input type="email" value={titular.email} onChange={e => actualizarTitular(idx, 'email', e.target.value)}
                        placeholder="correo@ejemplo.com" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                      <Input value={titular.telefono} onChange={e => actualizarTitular(idx, 'telefono', e.target.value)}
                        placeholder="Ej: +54 261 400-1234" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Razón social *</label>
                        <Input value={titular.razon_social} onChange={e => actualizarTitular(idx, 'razon_social', e.target.value)}
                          placeholder="Ej: Mi Empresa S.A.S." />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">CUIT *</label>
                        <Input value={titular.cuit} onChange={e => actualizarTitular(idx, 'cuit', e.target.value)}
                          placeholder="Ej: 30-12345678-9" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Domicilio legal *</label>
                        <Input value={titular.domicilio} onChange={e => actualizarTitular(idx, 'domicilio', e.target.value)}
                          placeholder="Calle, número, ciudad, provincia" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Email institucional</label>
                        <Input type="email" value={titular.email} onChange={e => actualizarTitular(idx, 'email', e.target.value)}
                          placeholder="contacto@empresa.com" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                        <Input value={titular.telefono} onChange={e => actualizarTitular(idx, 'telefono', e.target.value)}
                          placeholder="Ej: +54 261 400-1234" />
                      </div>
                    </div>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-medium text-foreground mb-1">Representante legal de la sociedad</p>
                      <p className="text-xs text-muted-foreground mb-3">Quien firmará la carta poder en nombre de la empresa. Deberás adjuntar el acta o estatuto que acredita su representación.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Nombre del representante *</label>
                          <Input value={titular.representante} onChange={e => actualizarTitular(idx, 'representante', e.target.value)}
                            placeholder="Nombre y apellido completo" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">DNI del representante *</label>
                          <Input value={titular.dni_representante} onChange={e => actualizarTitular(idx, 'dni_representante', e.target.value)}
                            placeholder="Ej: 28.123.456" />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {titulares.length > 1 && (
                  <div className="pt-2 border-t border-border">
                    <label className="block text-xs text-muted-foreground mb-2">Porcentaje de titularidad</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={100} step={5}
                        value={titular.porcentaje}
                        onChange={e => actualizarTitular(idx, 'porcentaje', Number(e.target.value))}
                        className="flex-1 accent-blue-600" />
                      <span className="text-sm font-semibold text-slate-700 w-12 text-right">{titular.porcentaje}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {titulares.length > 1 && (
          <p className={cn('text-xs mt-2', totalPct === 100 ? 'text-muted-foreground' : 'text-destructive font-medium')}>
            Total: <strong>{totalPct}%</strong>{totalPct !== 100 && ' — debe sumar 100%'}
          </p>
        )}

        <div className="mt-4 bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-medium text-foreground mb-1">📄 Se generará una carta poder automáticamente</p>
          <p className="text-xs text-muted-foreground">
            Una vez que envíes estos datos, recibirás una carta poder pre-completada con tu información.
            Deberás imprimirla, firmarla y enviarnos el escaneo.
            {hayJuridica && ' Como hay una empresa como titular, también deberás adjuntar el acta o estatuto que acredita la representación.'}
          </p>
        </div>
      </div>

      {/* Logotipo (opcional) */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="tiene-logotipo"
            checked={tieneLogotipo}
            onChange={e => toggleTieneLogotipo(e.target.checked)}
            className="w-4 h-4 accent-blue-600 cursor-pointer"
          />
          <label htmlFor="tiene-logotipo" className="text-sm font-medium text-foreground cursor-pointer">
            La marca incluye logotipo
          </label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          Marcá esta opción si querés registrar la marca con un diseño gráfico o isotipo específico. Es opcional.
        </p>

        {tieneLogotipo && (
          <div className="pl-7 space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Archivo del logotipo (PNG, JPG, SVG o PDF)</label>
              <input
                ref={logoInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.pdf"
                onChange={handleLogoChange}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/70 file:cursor-pointer cursor-pointer"
              />
            </div>
            {logoPreview && (
              <div className="inline-block">
                <p className="text-xs text-muted-foreground mb-1.5">Vista previa:</p>
                <img
                  src={logoPreview}
                  alt="Vista previa del logotipo"
                  className="max-h-24 max-w-xs rounded-lg border border-border object-contain bg-muted p-2"
                />
              </div>
            )}
            {logoFile && !logoPreview && (
              <p className="text-xs text-muted-foreground">📄 {logoFile.name}</p>
            )}
          </div>
        )}
      </div>

      {/* Observaciones */}
      <div>
        <Label className="mb-1.5">Observaciones (opcional)</Label>
        <Textarea
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Información adicional para tu abogado..."
          className="resize-none"
        />
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending || subiendoLogo}>
          {subiendoLogo ? 'Subiendo logotipo...' : isPending ? 'Enviando...' : 'Enviar datos al estudio'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
