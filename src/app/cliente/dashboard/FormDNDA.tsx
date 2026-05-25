'use client'

import { useState, useTransition } from 'react'
import { guardarFormulario } from './actions'
import { TIPOS_OBRA_DNDA, type TipoObra } from '@/lib/propuesta-dnda'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

interface DatosPropuestaDNDA {
  nombre_obra?: string
  tipo_obra?: string
  tipo_obra_label?: string
  publicada?: boolean
  nombre_tramite_dnda?: string
  total_propuesta?: number
}

interface Props {
  tramiteId: string
  datosPropuesta?: DatosPropuestaDNDA | null
  onSubmitOk: () => void
  onCancel: () => void
}

interface AutorDNDA {
  nombre: string
  domicilio: string
  cuit: string
  tiene_derechos_economicos: boolean
  porcentaje: number
}

interface TitularNoAutor {
  nombre: string
  domicilio: string
  cuit: string
  porcentaje: number
}

function autorVacio(): AutorDNDA {
  return { nombre: '', domicilio: '', cuit: '', tiene_derechos_economicos: true, porcentaje: 100 }
}

function titularNoAutorVacio(): TitularNoAutor {
  return { nombre: '', domicilio: '', cuit: '', porcentaje: 0 }
}

function ars(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export default function FormDNDA({ tramiteId, datosPropuesta, onSubmitOk, onCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [paso, setPaso] = useState<1 | 2>(1)

  // ── Datos de la obra (paso 1) ──────────────────────────────
  const [nombreObra, setNombreObra]     = useState('')
  const [tipoObra, setTipoObra]         = useState<TipoObra | ''>('')
  const [publicada, setPublicada]       = useState<boolean>(false)
  const [observaciones, setObservaciones] = useState('')

  // ── Autores (paso 2) ───────────────────────────────────────
  const [autores, setAutores] = useState<AutorDNDA[]>([autorVacio()])
  const [hayTitularesNoAutores, setHayTitularesNoAutores] = useState(false)
  const [titularesNoAutores, setTitularesNoAutores] = useState<TitularNoAutor[]>([titularNoAutorVacio()])

  // ── Cálculo de porcentajes de titulares ───────────────────
  const titularesConDerechos = autores.filter(a => a.tiene_derechos_economicos)
  const sumaPctAutores       = titularesConDerechos.reduce((s, a) => s + a.porcentaje, 0)
  const sumaPctNoAutores     = hayTitularesNoAutores
    ? titularesNoAutores.reduce((s, t) => s + t.porcentaje, 0)
    : 0
  const totalPct = sumaPctAutores + sumaPctNoAutores
  const hayAlMenosUnTitular  = titularesConDerechos.length > 0 || (hayTitularesNoAutores && titularesNoAutores.length > 0)

  // ── Handlers autores ──────────────────────────────────────
  function agregarAutor() {
    setAutores(prev => {
      const n = prev.length + 1
      const pct = Math.floor(100 / n)
      const resto = 100 - pct * (n - 1)
      return [
        ...prev.map(a => ({ ...a, porcentaje: a.tiene_derechos_economicos ? pct : a.porcentaje })),
        { ...autorVacio(), porcentaje: resto },
      ]
    })
  }

  function quitarAutor(idx: number) {
    if (autores.length <= 1) return
    setAutores(prev => prev.filter((_, i) => i !== idx))
  }

  function actualizarAutor<K extends keyof AutorDNDA>(idx: number, campo: K, valor: AutorDNDA[K]) {
    setAutores(prev => prev.map((a, i) => i === idx ? { ...a, [campo]: valor } : a))
  }

  // ── Handlers titulares no autores ──────────────────────────
  function agregarTitularNoAutor() {
    setTitularesNoAutores(prev => [...prev, titularNoAutorVacio()])
  }

  function quitarTitularNoAutor(idx: number) {
    setTitularesNoAutores(prev => prev.filter((_, i) => i !== idx))
  }

  function actualizarTitularNoAutor<K extends keyof TitularNoAutor>(idx: number, campo: K, valor: TitularNoAutor[K]) {
    setTitularesNoAutores(prev => prev.map((t, i) => i === idx ? { ...t, [campo]: valor } : t))
  }

  // ── Validar paso 1 ─────────────────────────────────────────
  function validarPaso1(): string | null {
    if (!nombreObra.trim()) return 'El nombre de la obra es obligatorio.'
    if (!tipoObra) return 'Seleccioná el tipo de obra.'
    return null
  }

  // ── Validar paso 2 ─────────────────────────────────────────
  function validarPaso2(): string | null {
    for (let i = 0; i < autores.length; i++) {
      const a = autores[i]
      if (!a.nombre.trim())    return `El nombre del autor ${i + 1} es obligatorio.`
      if (!a.domicilio.trim()) return `El domicilio del autor ${i + 1} es obligatorio.`
      if (!a.cuit.trim())      return `El CUIT del autor ${i + 1} es obligatorio.`
    }
    if (hayTitularesNoAutores) {
      for (let i = 0; i < titularesNoAutores.length; i++) {
        const t = titularesNoAutores[i]
        if (!t.nombre.trim())    return `El nombre del titular ${i + 1} es obligatorio.`
        if (!t.domicilio.trim()) return `El domicilio del titular ${i + 1} es obligatorio.`
        if (!t.cuit.trim())      return `El CUIT del titular ${i + 1} es obligatorio.`
      }
    }
    if (!hayAlMenosUnTitular) {
      return 'Debe haber al menos un titular de derechos económicos (ya sea un autor o una persona que no es autora).'
    }
    if (totalPct !== 100) {
      return `Los porcentajes de titularidad deben sumar 100%. Actualmente suman ${totalPct}%.`
    }
    return null
  }

  function handleSiguiente(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const err = validarPaso1()
    if (err) { setError(err); return }
    setPaso(2)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const err = validarPaso2()
    if (err) { setError(err); return }

    startTransition(async () => {
      const datos = {
        tipo_formulario: 'DNDA',
        nombre_obra: nombreObra,
        tipo_obra: tipoObra,
        publicada,
        autores,
        titulares_no_autores: hayTitularesNoAutores ? titularesNoAutores : [],
        observaciones,
      }
      const result = await guardarFormulario(tramiteId, datos)
      if (result.error) setError(result.error)
      else onSubmitOk()
    })
  }

  // ── PASO 1: Datos de la obra ───────────────────────────────
  if (paso === 1) {
    return (
      <form onSubmit={handleSiguiente} className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">Datos de la obra</h3>
          <p className="text-sm text-muted-foreground">Completá la información sobre la obra que querés registrar.</p>
        </div>

        {/* Presupuesto acordado con el estudio */}
        {datosPropuesta?.total_propuesta !== undefined && (
          <div className="bg-muted border border-border rounded-lg p-4">
            <p className="text-sm font-semibold text-foreground mb-1">Presupuesto acordado con tu estudio</p>
            <p className="text-xl font-bold text-foreground">{ars(datosPropuesta.total_propuesta)}</p>
            <p className="text-xs text-muted-foreground mt-1">Incluye honorarios, arancel DNDA, envío postal y soporte.</p>
          </div>
        )}

        {/* Nombre de la obra */}
        <div>
          <Label className="mb-1.5">Nombre / título de la obra *</Label>
          <Input
            type="text"
            value={nombreObra}
            onChange={e => setNombreObra(e.target.value)}
            placeholder="Ej: Mi Gran Canción, App de Ventas, El Tiempo Libre..."
          />
        </div>

        {/* ¿Publicada? */}
        <div>
          <Label className="mb-2">¿La obra ya fue publicada o divulgada al público? *</Label>
          <div className="space-y-2">
            {[
              { val: false, label: 'No, es INÉDITA', sub: 'Nadie la ha visto o escuchado públicamente todavía' },
              { val: true,  label: 'Sí, ya fue PUBLICADA', sub: 'Está en redes, plataformas, librerías, etc.' },
            ].map(op => (
              <label key={String(op.val)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  publicada === op.val ? 'border-foreground bg-muted' : 'border-border hover:border-input'
                )}>
                <input type="radio" name="publicada" checked={publicada === op.val}
                  onChange={() => setPublicada(op.val)}
                  className="mt-0.5 shrink-0 accent-purple-600" />
                <div>
                  <p className="text-sm font-medium text-foreground">{op.label}</p>
                  <p className="text-xs text-muted-foreground">{op.sub}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Tipo de obra */}
        <div>
          <Label className="mb-2">¿Qué tipo de obra es? *</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIPOS_OBRA_DNDA.map(t => (
              <button key={t.id} type="button" onClick={() => setTipoObra(t.id)}
                className={cn(
                  'p-2.5 text-left rounded-lg border-2 transition-colors',
                  tipoObra === t.id ? 'border-foreground bg-muted' : 'border-border hover:border-input'
                )}>
                <span className="text-lg">{t.emoji}</span>
                <p className="text-xs font-semibold text-foreground mt-1 leading-tight">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.sublabel}</p>
              </button>
            ))}
          </div>
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="flex gap-3">
          <Button type="submit" className="bg-foreground hover:bg-foreground/90 text-primary-foreground">
            Siguiente: autores y titulares →
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </form>
    )
  }

  // ── PASO 2: Autores y titulares ────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <button onClick={() => setPaso(1)} type="button" className="text-xs text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1">← Volver a datos de la obra</button>
        <h3 className="text-base font-semibold text-foreground mb-1">Autores y titulares</h3>
        <p className="text-sm text-muted-foreground">
          Indicá quiénes son los autores de la obra. Si algunos tienen derechos económicos sobre ella, activá la opción correspondiente y definí el porcentaje.
        </p>
      </div>

      {/* Lista de autores */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-medium text-foreground">Autores *</p>
          <button type="button" onClick={agregarAutor}
            className="text-xs text-muted-foreground hover:text-foreground font-medium">
            + Agregar autor
          </button>
        </div>

        <div className="space-y-4">
          {autores.map((autor, idx) => (
            <div key={idx} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-3 flex items-center justify-between border-b border-border">
                <p className="text-sm font-medium text-foreground">
                  {autores.length > 1 ? `Autor ${idx + 1}` : 'Datos del autor'}
                </p>
                {autores.length > 1 && (
                  <button type="button" onClick={() => quitarAutor(idx)}
                    className="text-xs text-destructive hover:text-destructive/80">Quitar</button>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Nombre completo *</label>
                    <Input value={autor.nombre} onChange={e => actualizarAutor(idx, 'nombre', e.target.value)}
                      placeholder="Nombre y apellido completo" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">CUIT *</label>
                    <Input value={autor.cuit} onChange={e => actualizarAutor(idx, 'cuit', e.target.value)}
                      placeholder="Ej: 20-30123456-7" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Domicilio *</label>
                    <Input value={autor.domicilio} onChange={e => actualizarAutor(idx, 'domicilio', e.target.value)}
                      placeholder="Calle, número, ciudad, provincia" />
                  </div>
                </div>

                {/* Derechos económicos */}
                <div className="pt-1">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id={`derechos_${idx}`}
                      checked={autor.tiene_derechos_economicos}
                      onChange={e => actualizarAutor(idx, 'tiene_derechos_economicos', e.target.checked)}
                      className="w-4 h-4 accent-purple-600 cursor-pointer" />
                    <label htmlFor={`derechos_${idx}`} className="text-sm text-foreground cursor-pointer">
                      Este autor tiene <strong>derechos económicos</strong> sobre la obra
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 pl-7">
                    Si no tiene derechos económicos, es solo autor moral (reconocimiento de autoría, sin participación en ingresos).
                  </p>

                  {autor.tiene_derechos_economicos && (
                    <div className="mt-3 pl-7">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">Porcentaje de titularidad sobre los derechos económicos</label>
                        <span className="text-sm font-semibold text-foreground">{autor.porcentaje}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={5}
                        value={autor.porcentaje}
                        onChange={e => actualizarAutor(idx, 'porcentaje', Number(e.target.value))}
                        className="w-full accent-purple-600" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Titulares que no son autores */}
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-2">
          <input type="checkbox" id="hay-titulares-no-autores"
            checked={hayTitularesNoAutores}
            onChange={e => setHayTitularesNoAutores(e.target.checked)}
            className="w-4 h-4 accent-purple-600 cursor-pointer" />
          <label htmlFor="hay-titulares-no-autores" className="text-sm font-medium text-foreground cursor-pointer">
            Hay titulares de derechos económicos que <strong>no son autores</strong> de la obra
          </label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          Por ejemplo: una empresa cesionaria, un productor, o alguien que adquirió los derechos por contrato.
        </p>

        {hayTitularesNoAutores && (
          <div className="mt-4 space-y-3">
            {titularesNoAutores.map((t, idx) => (
              <div key={idx} className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-foreground">Titular no autor {idx + 1}</p>
                  {titularesNoAutores.length > 1 && (
                    <button type="button" onClick={() => quitarTitularNoAutor(idx)}
                      className="text-xs text-destructive hover:text-destructive/80">Quitar</button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Nombre completo *</label>
                    <Input value={t.nombre} onChange={e => actualizarTitularNoAutor(idx, 'nombre', e.target.value)}
                      placeholder="Nombre y apellido / Razón social" className="bg-background" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">CUIT *</label>
                    <Input value={t.cuit} onChange={e => actualizarTitularNoAutor(idx, 'cuit', e.target.value)}
                      placeholder="Ej: 30-12345678-9" className="bg-background" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Domicilio *</label>
                    <Input value={t.domicilio} onChange={e => actualizarTitularNoAutor(idx, 'domicilio', e.target.value)}
                      placeholder="Calle, número, ciudad, provincia" className="bg-background" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">Porcentaje de titularidad</label>
                    <span className="text-sm font-semibold text-foreground">{t.porcentaje}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5}
                    value={t.porcentaje}
                    onChange={e => actualizarTitularNoAutor(idx, 'porcentaje', Number(e.target.value))}
                    className="w-full accent-purple-600" />
                </div>
              </div>
            ))}
            <button type="button" onClick={agregarTitularNoAutor}
              className="text-xs text-muted-foreground hover:text-foreground font-medium">
              + Agregar otro titular no autor
            </button>
          </div>
        )}
      </div>

      {/* Resumen de titularidad */}
      {hayAlMenosUnTitular && (
        <div className={cn(
          'rounded-lg px-4 py-3 border',
          totalPct === 100 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
        )}>
          <p className={cn('text-sm font-medium', totalPct === 100 ? 'text-green-700' : 'text-red-700')}>
            {totalPct === 100
              ? '✓ Los porcentajes de titularidad suman 100%'
              : `⚠ Los porcentajes suman ${totalPct}% — deben sumar exactamente 100%`
            }
          </p>
          {totalPct !== 100 && (
            <p className="text-xs text-red-600 mt-1">
              {totalPct < 100
                ? `Falta asignar ${100 - totalPct}% de titularidad.`
                : `Hay ${totalPct - 100}% de más. Ajustá los porcentajes.`}
            </p>
          )}
        </div>
      )}

      {!hayAlMenosUnTitular && autores.length > 0 && (
        <div className="bg-muted border border-border rounded-lg px-4 py-3">
          <p className="text-sm text-muted-foreground">
            ⚠ Debe haber al menos un titular de derechos económicos. Activá la opción en algún autor, o marcá que hay titulares que no son autores.
          </p>
        </div>
      )}

      {/* Observaciones */}
      <div>
        <Label className="mb-1.5">Observaciones (opcional)</Label>
        <Textarea
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Cualquier detalle adicional que quieras informarle a tu estudio..."
          className="resize-none"
        />
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending} className="bg-foreground hover:bg-foreground/90 text-primary-foreground">
          {isPending ? 'Enviando...' : 'Enviar datos al estudio'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
