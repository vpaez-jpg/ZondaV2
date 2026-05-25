'use client'

import { useState, useTransition } from 'react'
import { guardarFormulario } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

interface Props {
  tramiteId: string
  datosPropuesta?: { total_propuesta?: number; honorarios?: number } | null
  onSubmitOk: () => void
  onCancel: () => void
}

// ── Interfaces ────────────────────────────────────────────────
interface Socio {
  nombre: string
  dni: string
  cuit: string
  fecha_nacimiento: string
  nacionalidad: string
  estado_civil: string
  profesion: string
  domicilio: string
  telefono: string
  email: string
  cantidad_acciones: string
}

interface Administrador {
  nombre: string
  dni: string
  cuit: string
  fecha_nacimiento: string
  nacionalidad: string
  profesion: string
  estado_civil: string
  domicilio: string
  email: string
  domicilio_constituido: string
}

type TipoAdmin = 'socio' | 'externo' | ''

const ESTADO_CIVIL_OPCIONES = ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Separado/a', 'Unión convivencial']

function ars(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function socioVacio(): Socio {
  return {
    nombre: '', dni: '', cuit: '',
    fecha_nacimiento: '', nacionalidad: 'Argentina',
    estado_civil: '', profesion: '', domicilio: '',
    telefono: '', email: '', cantidad_acciones: '',
  }
}

function adminVacio(): Administrador {
  return {
    nombre: '', dni: '', cuit: '', fecha_nacimiento: '',
    nacionalidad: 'Argentina', profesion: '', estado_civil: '',
    domicilio: '', email: '', domicilio_constituido: '',
  }
}

// ── Indicador de pasos ────────────────────────────────────────
function PasoIndicador({ paso }: { paso: number }) {
  const labels = ['Denominación', 'Objeto y capital', 'Socios', 'Administradores']
  return (
    <div className="flex items-center gap-1">
      {labels.map((label, i) => {
        const n = i + 1
        const hecho = n < paso
        const activo = n === paso
        return (
          <div key={n} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={cn('flex items-center gap-1.5', activo ? 'opacity-100' : hecho ? 'opacity-70' : 'opacity-30')}>
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                hecho ? 'bg-foreground text-primary-foreground' : activo ? 'bg-foreground text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {hecho ? '✓' : n}
              </div>
              <span className={cn('text-xs hidden sm:block whitespace-nowrap', activo ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={cn('flex-1 h-px mx-1 min-w-[4px]', hecho ? 'bg-foreground' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Paso 1: Denominaciones + Sede ─────────────────────────────
function Paso1({
  den1, setDen1, den2, setDen2, den3, setDen3,
  calle, setCalle, numero, setNumero, piso, setPiso,
  depto, setDepto, ciudad, setCiudad, provincia, setProvincia,
  onNext, onCancel,
}: {
  den1: string; setDen1: (v: string) => void
  den2: string; setDen2: (v: string) => void
  den3: string; setDen3: (v: string) => void
  calle: string; setCalle: (v: string) => void
  numero: string; setNumero: (v: string) => void
  piso: string; setPiso: (v: string) => void
  depto: string; setDepto: (v: string) => void
  ciudad: string; setCiudad: (v: string) => void
  provincia: string; setProvincia: (v: string) => void
  onNext: () => void; onCancel: () => void
}) {
  const [err, setErr] = useState('')

  function handleNext() {
    if (!den1.trim()) { setErr('La primera opción de denominación es obligatoria.'); return }
    if (!calle.trim() || !numero.trim() || !ciudad.trim() || !provincia.trim()) {
      setErr('La dirección completa (calle, número, ciudad y provincia) es obligatoria.')
      return
    }
    setErr(''); onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Paso 1 de 4 — Denominación y sede social</h3>
        <p className="text-sm text-muted-foreground">Indicá hasta tres opciones para el nombre de tu empresa en orden de preferencia.</p>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="mb-1.5">Opción 1 (preferida) <span className="text-destructive">*</span></Label>
          <div className="flex items-center gap-2">
            <Input value={den1} onChange={e => setDen1(e.target.value)} placeholder="Ej: TechSoluciones" className="flex-1" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">S.A.S.</span>
          </div>
        </div>
        <div>
          <Label className="mb-1.5">Opción 2</Label>
          <div className="flex items-center gap-2">
            <Input value={den2} onChange={e => setDen2(e.target.value)} placeholder="Segunda opción (opcional)" className="flex-1" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">S.A.S.</span>
          </div>
        </div>
        <div>
          <Label className="mb-1.5">Opción 3</Label>
          <div className="flex items-center gap-2">
            <Input value={den3} onChange={e => setDen3(e.target.value)} placeholder="Tercera opción (opcional)" className="flex-1" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">S.A.S.</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">No hace falta incluir "SAS" al final, lo agrega el sistema automáticamente.</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground mb-3">Sede social (domicilio legal y fiscal)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">Calle <span className="text-destructive">*</span></label>
            <Input value={calle} onChange={e => setCalle(e.target.value)} placeholder="Av. San Martín" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Número <span className="text-destructive">*</span></label>
            <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="1234" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Piso</label>
            <Input value={piso} onChange={e => setPiso(e.target.value)} placeholder="2" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Depto.</label>
            <Input value={depto} onChange={e => setDepto(e.target.value)} placeholder="A" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Ciudad <span className="text-destructive">*</span></label>
            <Input value={ciudad} onChange={e => setCiudad(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">Provincia <span className="text-destructive">*</span></label>
            <Input value={provincia} onChange={e => setProvincia(e.target.value)} />
          </div>
        </div>
      </div>

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      <div className="flex gap-3">
        <Button type="button" onClick={handleNext}>Siguiente →</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

// ── Paso 2: Objeto social + Capital ───────────────────────────
function Paso2({
  objeto, setObjeto, capital, setCapital, onNext, onBack,
}: {
  objeto: string; setObjeto: (v: string) => void
  capital: string; setCapital: (v: string) => void
  onNext: () => void; onBack: () => void
}) {
  const [err, setErr] = useState('')
  const capitalNum = parseInt(capital.replace(/\D/g, ''), 10)

  function handleNext() {
    if (!objeto.trim()) { setErr('El objeto social es obligatorio.'); return }
    if (!capital.trim() || isNaN(capitalNum) || capitalNum < 1) {
      setErr('El capital social es obligatorio y debe ser un número válido.')
      return
    }
    if (capitalNum < 700_000) {
      setErr('El capital social mínimo para una SAS es de $700.000.')
      return
    }
    setErr(''); onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Paso 2 de 4 — Objeto social y capital</h3>
        <p className="text-sm text-muted-foreground">Describí la actividad principal de la empresa y el monto de capital inicial.</p>
      </div>

      <div>
        <Label className="mb-1.5">
          Objeto social — actividad principal <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={objeto}
          onChange={e => setObjeto(e.target.value)}
          rows={5}
          placeholder="Describí brevemente a qué se va a dedicar la empresa. Ej: Desarrollo y comercialización de software, consultoría tecnológica y servicios de capacitación en tecnología de la información y comunicación."
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1">Tu abogado redactará el objeto formal a partir de esta descripción.</p>
      </div>

      <div>
        <Label className="mb-1.5">
          Capital social <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">$</span>
          <Input
            type="text"
            value={capital}
            onChange={e => setCapital(e.target.value)}
            placeholder="700000"
            className="flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Monto en pesos argentinos. Mínimo legal: $700.000. Cada acción vale $100.
          {!isNaN(capitalNum) && capitalNum > 0 && (
            <span className="text-green-600 font-medium"> → {(capitalNum / 100).toLocaleString('es-AR')} acciones de $100 c/u.</span>
          )}
        </p>
      </div>

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      <div className="flex gap-3">
        <Button type="button" onClick={handleNext}>Siguiente →</Button>
        <Button type="button" variant="outline" onClick={onBack}>Atrás</Button>
      </div>
    </div>
  )
}

// ── Paso 3: Socios ────────────────────────────────────────────
function Paso3({
  socios, setSocios, capitalTotal, onNext, onBack,
}: {
  socios: Socio[]
  setSocios: React.Dispatch<React.SetStateAction<Socio[]>>
  capitalTotal: number
  onNext: () => void
  onBack: () => void
}) {
  const [err, setErr] = useState('')
  const accionesTotalesEsperadas = capitalTotal > 0 ? capitalTotal / 100 : 0
  const totalAcciones = socios.reduce((sum, s) => sum + (parseInt(s.cantidad_acciones) || 0), 0)

  function agregar() { setSocios(prev => [...prev, socioVacio()]) }
  function actualizar(idx: number, campo: keyof Socio, valor: string) {
    setSocios(prev => prev.map((s, i) => i === idx ? { ...s, [campo]: valor } : s))
  }
  function quitar(idx: number) { setSocios(prev => prev.filter((_, i) => i !== idx)) }

  function handleNext() {
    if (socios.length === 0) { setErr('Agregá al menos un socio.'); return }
    for (let i = 0; i < socios.length; i++) {
      const s = socios[i]
      if (!s.nombre.trim()) { setErr(`Nombre del Socio ${i + 1} obligatorio.`); return }
      if (!s.dni.trim()) { setErr(`DNI del Socio ${i + 1} obligatorio.`); return }
      if (!s.cuit.trim()) { setErr(`CUIT/CUIL del Socio ${i + 1} obligatorio.`); return }
      if (!s.fecha_nacimiento) { setErr(`Fecha de nacimiento del Socio ${i + 1} obligatoria.`); return }
      if (!s.nacionalidad.trim()) { setErr(`Nacionalidad del Socio ${i + 1} obligatoria.`); return }
      if (!s.estado_civil) { setErr(`Estado civil del Socio ${i + 1} obligatorio.`); return }
      if (!s.profesion.trim()) { setErr(`Profesión del Socio ${i + 1} obligatoria.`); return }
      if (!s.domicilio.trim()) { setErr(`Domicilio del Socio ${i + 1} obligatorio.`); return }
      if (!s.email.trim()) { setErr(`Email del Socio ${i + 1} obligatorio.`); return }
      const acc = parseInt(s.cantidad_acciones)
      if (!s.cantidad_acciones || isNaN(acc) || acc <= 0) { setErr(`Cantidad de acciones del Socio ${i + 1} debe ser mayor a 0.`); return }
    }
    if (accionesTotalesEsperadas > 0 && totalAcciones !== accionesTotalesEsperadas) {
      setErr(`La suma de acciones (${totalAcciones.toLocaleString('es-AR')}) debe ser igual al total del capital: ${accionesTotalesEsperadas.toLocaleString('es-AR')} acciones.`)
      return
    }
    setErr(''); onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Paso 3 de 4 — Socios</h3>
        <p className="text-sm text-muted-foreground">Completá los datos de cada socio. Si alguno va a ser administrador, sus datos se usarán directamente en el paso siguiente.</p>
        {accionesTotalesEsperadas > 0 && (
          <div className={cn(
            'mt-2 text-xs font-medium px-3 py-1.5 rounded-lg inline-block',
            totalAcciones === accionesTotalesEsperadas ? 'bg-muted text-foreground' :
            totalAcciones > accionesTotalesEsperadas ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
          )}>
            Acciones asignadas: {totalAcciones.toLocaleString('es-AR')} / {accionesTotalesEsperadas.toLocaleString('es-AR')}
            {totalAcciones === accionesTotalesEsperadas ? ' ✓' : ''}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {socios.map((socio, idx) => {
          const acciones = parseInt(socio.cantidad_acciones) || 0
          const pct = accionesTotalesEsperadas > 0 && acciones > 0
            ? ((acciones / accionesTotalesEsperadas) * 100).toFixed(2) + '%'
            : null
          return (
            <div key={idx} className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-foreground">
                  Socio {idx + 1}
                  {pct && <span className="ml-2 text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded-full">{pct}</span>}
                </p>
                {socios.length > 1 && (
                  <button type="button" onClick={() => quitar(idx)} className="text-xs text-destructive hover:text-destructive/80">Quitar</button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Nombre y apellido <span className="text-destructive">*</span></label>
                  <Input placeholder="Juan Martín Pérez" value={socio.nombre} onChange={e => actualizar(idx, 'nombre', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">DNI <span className="text-destructive">*</span></label>
                  <Input placeholder="34.567.890" value={socio.dni} onChange={e => actualizar(idx, 'dni', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">CUIT / CUIL <span className="text-destructive">*</span></label>
                  <Input placeholder="20-34567890-1" value={socio.cuit} onChange={e => actualizar(idx, 'cuit', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Fecha de nacimiento <span className="text-destructive">*</span></label>
                  <Input type="date" value={socio.fecha_nacimiento} onChange={e => actualizar(idx, 'fecha_nacimiento', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Nacionalidad <span className="text-destructive">*</span></label>
                  <Input placeholder="Argentina" value={socio.nacionalidad} onChange={e => actualizar(idx, 'nacionalidad', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Estado civil <span className="text-destructive">*</span></label>
                  <Select value={socio.estado_civil} onChange={e => actualizar(idx, 'estado_civil', e.target.value)} className="bg-background">
                    <option value="">Seleccioná...</option>
                    {ESTADO_CIVIL_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Profesión <span className="text-destructive">*</span></label>
                  <Input placeholder="Desarrollador de software" value={socio.profesion} onChange={e => actualizar(idx, 'profesion', e.target.value)} className="bg-background" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Domicilio completo <span className="text-destructive">*</span></label>
                  <Input placeholder="Av. España 1234, Godoy Cruz, Mendoza" value={socio.domicilio} onChange={e => actualizar(idx, 'domicilio', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                  <Input placeholder="+54 9 261 123-4567" value={socio.telefono} onChange={e => actualizar(idx, 'telefono', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Email <span className="text-destructive">*</span></label>
                  <Input type="email" placeholder="socio@email.com" value={socio.email} onChange={e => actualizar(idx, 'email', e.target.value)} className="bg-background" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cantidad de acciones <span className="text-destructive">*</span></label>
                  <Input type="number" min={1} placeholder="5000" value={socio.cantidad_acciones} onChange={e => actualizar(idx, 'cantidad_acciones', e.target.value)} className="bg-background" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button type="button" onClick={agregar} className="text-sm text-foreground hover:text-foreground/70 font-medium flex items-center gap-1">
        + Agregar otro socio
      </button>

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      <div className="flex gap-3">
        <Button type="button" onClick={handleNext}>Siguiente →</Button>
        <Button type="button" variant="outline" onClick={onBack}>Atrás</Button>
      </div>
    </div>
  )
}

// ── Formulario de administrador externo (no socio) ────────────
function AdminExternoFields({
  admin, onChange,
}: {
  admin: Administrador
  onChange: (campo: keyof Administrador, valor: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <div className="sm:col-span-2">
        <label className="block text-xs text-muted-foreground mb-1">Nombre y apellido completo <span className="text-destructive">*</span></label>
        <Input placeholder="Juan Martín Pérez" value={admin.nombre} onChange={e => onChange('nombre', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">DNI <span className="text-destructive">*</span></label>
        <Input placeholder="34.567.890" value={admin.dni} onChange={e => onChange('dni', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">CUIT / CUIL <span className="text-destructive">*</span></label>
        <Input placeholder="20-34567890-1" value={admin.cuit} onChange={e => onChange('cuit', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Fecha de nacimiento <span className="text-destructive">*</span></label>
        <Input type="date" value={admin.fecha_nacimiento} onChange={e => onChange('fecha_nacimiento', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Nacionalidad <span className="text-destructive">*</span></label>
        <Input placeholder="Argentina" value={admin.nacionalidad} onChange={e => onChange('nacionalidad', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Profesión <span className="text-destructive">*</span></label>
        <Input placeholder="Contador" value={admin.profesion} onChange={e => onChange('profesion', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Estado civil <span className="text-destructive">*</span></label>
        <Select value={admin.estado_civil} onChange={e => onChange('estado_civil', e.target.value)} className="bg-background">
          <option value="">Seleccioná...</option>
          {ESTADO_CIVIL_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-muted-foreground mb-1">Domicilio completo <span className="text-destructive">*</span></label>
        <Input placeholder="Av. España 1234, Godoy Cruz, Mendoza" value={admin.domicilio} onChange={e => onChange('domicilio', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Email <span className="text-destructive">*</span></label>
        <Input type="email" placeholder="admin@email.com" value={admin.email} onChange={e => onChange('email', e.target.value)} className="bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Domicilio constituido <span className="text-destructive">*</span></label>
        <Input placeholder="Sede social (o indicá otro)" value={admin.domicilio_constituido} onChange={e => onChange('domicilio_constituido', e.target.value)} className="bg-background" />
      </div>
    </div>
  )
}

// ── Panel selector de administrador ──────────────────────────
function AdminSelectorPanel({
  label, tipo, setTipo, socioIdx, setSocioIdx,
  domConst, setDomConst, externo, setExterno,
  socios, disabledSocioIdx,
}: {
  label: string
  tipo: TipoAdmin
  setTipo: (t: TipoAdmin) => void
  socioIdx: number
  setSocioIdx: (i: number) => void
  domConst: string
  setDomConst: (v: string) => void
  externo: Administrador
  setExterno: React.Dispatch<React.SetStateAction<Administrador>>
  socios: Socio[]
  disabledSocioIdx: number
}) {
  const socioSeleccionado = tipo === 'socio' && socioIdx >= 0 ? socios[socioIdx] : null

  function handleSelect(value: string) {
    if (value === '') { setTipo(''); setSocioIdx(-1) }
    else if (value === 'externo') { setTipo('externo'); setSocioIdx(-1) }
    else {
      const i = parseInt(value)
      setTipo('socio')
      setSocioIdx(i)
    }
  }

  const selectValue = tipo === '' ? '' : tipo === 'externo' ? 'externo' : String(socioIdx)

  return (
    <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
      <p className="text-sm font-semibold text-foreground">{label}</p>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">¿Quién será el administrador? <span className="text-destructive">*</span></label>
        <Select value={selectValue} onChange={e => handleSelect(e.target.value)} className="bg-background">
          <option value="">Seleccioná...</option>
          {socios.map((s, i) => (
            <option key={i} value={String(i)} disabled={i === disabledSocioIdx}>
              {s.nombre || `Socio ${i + 1}`}{i === disabledSocioIdx ? ' (ya asignado)' : ''}
            </option>
          ))}
          <option value="externo">Persona no socio</option>
        </Select>
      </div>

      {tipo === 'socio' && socioSeleccionado && (
        <div className="space-y-3">
          <div className="bg-muted border border-border rounded-lg p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Datos del socio — se usarán en el estatuto</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Nombre</span>
              <span className="text-foreground font-medium">{socioSeleccionado.nombre}</span>
              <span className="text-muted-foreground">DNI</span>
              <span className="text-foreground">{socioSeleccionado.dni}</span>
              <span className="text-muted-foreground">CUIT/CUIL</span>
              <span className="text-foreground">{socioSeleccionado.cuit}</span>
              <span className="text-muted-foreground">Nacimiento</span>
              <span className="text-foreground">{socioSeleccionado.fecha_nacimiento || '—'}</span>
              <span className="text-muted-foreground">Nacionalidad</span>
              <span className="text-foreground">{socioSeleccionado.nacionalidad}</span>
              <span className="text-muted-foreground">Profesión</span>
              <span className="text-foreground">{socioSeleccionado.profesion}</span>
              <span className="text-muted-foreground">Estado civil</span>
              <span className="text-foreground">{socioSeleccionado.estado_civil}</span>
              <span className="text-muted-foreground">Domicilio</span>
              <span className="text-foreground">{socioSeleccionado.domicilio}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Domicilio constituido <span className="text-destructive">*</span></label>
            <Input placeholder="Sede social (o indicá otro domicilio)" value={domConst} onChange={e => setDomConst(e.target.value)} className="bg-background" />
            <p className="text-xs text-muted-foreground mt-1">Generalmente coincide con la sede social.</p>
          </div>
        </div>
      )}

      {tipo === 'externo' && (
        <AdminExternoFields
          admin={externo}
          onChange={(campo, valor) => setExterno(prev => ({ ...prev, [campo]: valor }))}
        />
      )}
    </div>
  )
}

// ── Paso 4: Administradores ───────────────────────────────────
function Paso4({
  socios,
  titTipo, setTitTipo, titIdx, setTitIdx, titDomConst, setTitDomConst,
  titExterno, setTitExterno,
  supTipo, setSupTipo, supIdx, setSupIdx, supDomConst, setSupDomConst,
  supExterno, setSupExterno,
  onSubmit, onBack, isPending,
}: {
  socios: Socio[]
  titTipo: TipoAdmin; setTitTipo: (t: TipoAdmin) => void
  titIdx: number; setTitIdx: (i: number) => void
  titDomConst: string; setTitDomConst: (v: string) => void
  titExterno: Administrador; setTitExterno: React.Dispatch<React.SetStateAction<Administrador>>
  supTipo: TipoAdmin; setSupTipo: (t: TipoAdmin) => void
  supIdx: number; setSupIdx: (i: number) => void
  supDomConst: string; setSupDomConst: (v: string) => void
  supExterno: Administrador; setSupExterno: React.Dispatch<React.SetStateAction<Administrador>>
  onSubmit: () => void; onBack: () => void; isPending: boolean
}) {
  const [err, setErr] = useState('')

  function handleSubmit() {
    if (!titTipo) { setErr('Seleccioná al Administrador Titular.'); return }
    if (titTipo === 'socio' && !titDomConst.trim()) {
      setErr('Ingresá el domicilio constituido del Administrador Titular.'); return
    }
    if (titTipo === 'externo') {
      const t = titExterno
      if (!t.nombre.trim()) { setErr('Nombre del Administrador Titular obligatorio.'); return }
      if (!t.dni.trim()) { setErr('DNI del Administrador Titular obligatorio.'); return }
      if (!t.cuit.trim()) { setErr('CUIT/CUIL del Administrador Titular obligatorio.'); return }
      if (!t.fecha_nacimiento) { setErr('Fecha de nacimiento del Administrador Titular obligatoria.'); return }
      if (!t.nacionalidad.trim()) { setErr('Nacionalidad del Administrador Titular obligatoria.'); return }
      if (!t.profesion.trim()) { setErr('Profesión del Administrador Titular obligatoria.'); return }
      if (!t.estado_civil) { setErr('Estado civil del Administrador Titular obligatorio.'); return }
      if (!t.domicilio.trim()) { setErr('Domicilio del Administrador Titular obligatorio.'); return }
      if (!t.email.trim()) { setErr('Email del Administrador Titular obligatorio.'); return }
      if (!t.domicilio_constituido.trim()) { setErr('Domicilio constituido del Administrador Titular obligatorio.'); return }
    }
    if (!supTipo) { setErr('Seleccioná al Administrador Suplente.'); return }
    if (supTipo === 'socio' && !supDomConst.trim()) {
      setErr('Ingresá el domicilio constituido del Administrador Suplente.'); return
    }
    if (supTipo === 'externo') {
      const s = supExterno
      if (!s.nombre.trim()) { setErr('Nombre del Administrador Suplente obligatorio.'); return }
      if (!s.dni.trim()) { setErr('DNI del Administrador Suplente obligatorio.'); return }
      if (!s.cuit.trim()) { setErr('CUIT/CUIL del Administrador Suplente obligatorio.'); return }
    }
    if (titTipo === 'socio' && supTipo === 'socio' && titIdx === supIdx) {
      setErr('El Administrador Titular y Suplente no pueden ser el mismo socio.'); return
    }
    setErr('')
    onSubmit()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Paso 4 de 4 — Administradores</h3>
        <p className="text-sm text-muted-foreground">Elegí quién ejercerá la administración de la sociedad. Podés elegir a uno de los socios o a una persona externa.</p>
      </div>

      <AdminSelectorPanel
        label="Administrador Titular"
        tipo={titTipo} setTipo={setTitTipo}
        socioIdx={titIdx} setSocioIdx={setTitIdx}
        domConst={titDomConst} setDomConst={setTitDomConst}
        externo={titExterno} setExterno={setTitExterno}
        socios={socios}
        disabledSocioIdx={supTipo === 'socio' ? supIdx : -1}
      />

      <AdminSelectorPanel
        label="Administrador Suplente"
        tipo={supTipo} setTipo={setSupTipo}
        socioIdx={supIdx} setSocioIdx={setSupIdx}
        domConst={supDomConst} setDomConst={setSupDomConst}
        externo={supExterno} setExterno={setSupExterno}
        socios={socios}
        disabledSocioIdx={titTipo === 'socio' ? titIdx : -1}
      />

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      <div className="flex gap-3">
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Enviando...' : 'Enviar datos al estudio →'}
        </Button>
        <Button type="button" variant="outline" onClick={onBack}>Atrás</Button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function FormSAS({ tramiteId, datosPropuesta, onSubmitOk, onCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [paso, setPaso] = useState(1)
  const [error, setError] = useState('')

  // Paso 1
  const [den1, setDen1] = useState('')
  const [den2, setDen2] = useState('')
  const [den3, setDen3] = useState('')
  const [calle, setCalle] = useState('')
  const [numero, setNumero] = useState('')
  const [piso, setPiso] = useState('')
  const [depto, setDepto] = useState('')
  const [ciudad, setCiudad] = useState('Mendoza')
  const [provincia, setProvincia] = useState('Mendoza')

  // Paso 2
  const [objeto, setObjeto] = useState('')
  const [capital, setCapital] = useState('')

  // Paso 3
  const [socios, setSocios] = useState<Socio[]>([socioVacio()])

  // Paso 4 — Titular
  const [titTipo, setTitTipo] = useState<TipoAdmin>('')
  const [titIdx, setTitIdx] = useState(-1)
  const [titDomConst, setTitDomConst] = useState('')
  const [titExterno, setTitExterno] = useState<Administrador>(adminVacio())

  // Paso 4 — Suplente
  const [supTipo, setSupTipo] = useState<TipoAdmin>('')
  const [supIdx, setSupIdx] = useState(-1)
  const [supDomConst, setSupDomConst] = useState('')
  const [supExterno, setSupExterno] = useState<Administrador>(adminVacio())

  const capitalNum = parseInt(capital.replace(/\D/g, ''), 10) || 0
  const accionesTotales = capitalNum / 100

  function buildSedeSocial() {
    return [calle, numero, piso ? `Piso ${piso}` : '', depto ? `Depto. ${depto}` : '']
      .filter(Boolean).join(' ') + `, ${ciudad}, ${provincia}`
  }

  function calcularEdad(fechaNac: string): number {
    if (!fechaNac) return 0
    const hoy = new Date()
    const nac = new Date(fechaNac)
    let edad = hoy.getFullYear() - nac.getFullYear()
    const m = hoy.getMonth() - nac.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
    return edad
  }

  function formatFecha(fecha: string): string {
    if (!fecha) return ''
    const [y, m, d] = fecha.split('-')
    return `${d}/${m}/${y}`
  }

  function buildAdminData(tipo: TipoAdmin, idx: number, domConst: string, externo: Administrador) {
    if (tipo === 'socio') {
      const s = socios[idx]
      return {
        nombre: s.nombre, dni: s.dni, cuit: s.cuit,
        fecha_nacimiento: s.fecha_nacimiento,
        fecha_nacimiento_formateada: formatFecha(s.fecha_nacimiento),
        edad: calcularEdad(s.fecha_nacimiento),
        nacionalidad: s.nacionalidad, profesion: s.profesion,
        estado_civil: s.estado_civil, domicilio: s.domicilio,
        email: s.email, domicilio_constituido: domConst,
      }
    }
    return {
      nombre: externo.nombre, dni: externo.dni, cuit: externo.cuit,
      fecha_nacimiento: externo.fecha_nacimiento,
      fecha_nacimiento_formateada: formatFecha(externo.fecha_nacimiento),
      edad: calcularEdad(externo.fecha_nacimiento),
      nacionalidad: externo.nacionalidad, profesion: externo.profesion,
      estado_civil: externo.estado_civil, domicilio: externo.domicilio,
      email: externo.email, domicilio_constituido: externo.domicilio_constituido,
    }
  }

  function handleFinalSubmit() {
    setError('')
    startTransition(async () => {
      const sociosConDatos = socios.map(s => {
        const acc = parseInt(s.cantidad_acciones) || 0
        const porcentaje = accionesTotales > 0 ? ((acc / accionesTotales) * 100).toFixed(2) + '%' : '0%'
        return {
          nombre: s.nombre, dni: s.dni, cuit: s.cuit,
          fecha_nacimiento: s.fecha_nacimiento,
          fecha_nacimiento_formateada: formatFecha(s.fecha_nacimiento),
          edad: calcularEdad(s.fecha_nacimiento),
          nacionalidad: s.nacionalidad, estado_civil: s.estado_civil,
          profesion: s.profesion, domicilio: s.domicilio,
          telefono: s.telefono, email: s.email,
          acciones_susc: acc, porcentaje,
        }
      })

      const datos = {
        tipo_formulario: 'SAS',
        denominaciones: [den1, den2, den3].filter(Boolean),
        sede_social: buildSedeSocial(),
        objeto_social: objeto,
        capital_social: capitalNum,
        cantidad_acciones: accionesTotales,
        socios: sociosConDatos,
        administrador_titular: buildAdminData(titTipo, titIdx, titDomConst, titExterno),
        administrador_suplente: buildAdminData(supTipo, supIdx, supDomConst, supExterno),
      }

      const result = await guardarFormulario(tramiteId, datos)
      if (result.error) setError(result.error)
      else onSubmitOk()
    })
  }

  return (
    <div className="space-y-6">
      {/* Presupuesto si disponible */}
      {datosPropuesta?.total_propuesta !== undefined && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-semibold text-foreground mb-1">Presupuesto acordado con tu estudio</p>
          <p className="text-xl font-bold text-foreground">{ars(datosPropuesta.total_propuesta)}</p>
          <p className="text-xs text-muted-foreground mt-1">Incluye honorarios y gastos de constitución. La rúbrica de libros se abona al finalizar.</p>
        </div>
      )}

      {/* Indicador de pasos */}
      <PasoIndicador paso={paso} />

      {/* Paso activo */}
      {paso === 1 && (
        <Paso1
          den1={den1} setDen1={setDen1}
          den2={den2} setDen2={setDen2}
          den3={den3} setDen3={setDen3}
          calle={calle} setCalle={setCalle}
          numero={numero} setNumero={setNumero}
          piso={piso} setPiso={setPiso}
          depto={depto} setDepto={setDepto}
          ciudad={ciudad} setCiudad={setCiudad}
          provincia={provincia} setProvincia={setProvincia}
          onNext={() => setPaso(2)}
          onCancel={onCancel}
        />
      )}
      {paso === 2 && (
        <Paso2
          objeto={objeto} setObjeto={setObjeto}
          capital={capital} setCapital={setCapital}
          onNext={() => setPaso(3)}
          onBack={() => setPaso(1)}
        />
      )}
      {paso === 3 && (
        <Paso3
          socios={socios}
          setSocios={setSocios}
          capitalTotal={capitalNum}
          onNext={() => setPaso(4)}
          onBack={() => setPaso(2)}
        />
      )}
      {paso === 4 && (
        <Paso4
          socios={socios}
          titTipo={titTipo} setTitTipo={setTitTipo}
          titIdx={titIdx} setTitIdx={setTitIdx}
          titDomConst={titDomConst} setTitDomConst={setTitDomConst}
          titExterno={titExterno} setTitExterno={setTitExterno}
          supTipo={supTipo} setSupTipo={setSupTipo}
          supIdx={supIdx} setSupIdx={setSupIdx}
          supDomConst={supDomConst} setSupDomConst={setSupDomConst}
          supExterno={supExterno} setSupExterno={setSupExterno}
          onSubmit={handleFinalSubmit}
          onBack={() => setPaso(3)}
          isPending={isPending}
        />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
