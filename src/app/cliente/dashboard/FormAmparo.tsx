'use client'

/**
 * FormAmparo — formulario del cliente para carga de datos en trámites de amparo judicial.
 * Usado para: ART9 (Amparo Art. 9 Ley 24.463) y GANANCIAS (Amparo Ganancias).
 *
 * El cliente carga:
 * - Datos personales (nombre, sexo, DNI, CUIT/CUIL, domicilio, fecha de nacimiento, fecha de jubilación)
 * - Foto del DNI (frente + dorso)
 * - Bonos de sueldo (upload de archivos) O credenciales de Mi ANSES
 */

import { useState, useRef }           from 'react'
import { createClient }               from '@/lib/supabase/client'
import { guardarFormularioAmparo }    from './actions'

type TipoAmparo = 'ART9' | 'GANANCIAS'

interface Props {
  tipo:          TipoAmparo
  tramiteId:     string
  clienteId:     string
  datosPropuesta: Record<string, unknown>
  onSubmitOk:    () => void
  onCancel:      () => void
}

// ── Sub-componentes ────────────────────────────────────────────

function ProgresoBar({ bloque, total }: { bloque: number; total: number }) {
  const pct = Math.round((bloque / total) * 100)
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">Paso {bloque} de {total}</span>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className="bg-foreground h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }}/>
      </div>
      <div className="flex justify-between mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
            i + 1 < bloque  ? 'bg-foreground text-background'
            : i + 1 === bloque ? 'border-2 border-foreground text-foreground bg-background'
            : 'border border-border text-muted-foreground bg-background'
          }`}>
            {i + 1 < bloque ? '✓' : i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

interface FileUploadFieldProps {
  label: string
  hint?:  string
  accept?: string
  file:   File | null
  url:    string
  onFile: (f: File) => void
  uploading?: boolean
}

function FileUploadField({ label, hint, accept = 'image/*,application/pdf', file, url, onFile, uploading }: FileUploadFieldProps) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
      <div
        onClick={() => ref.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-foreground/40 transition-colors text-center"
      >
        {uploading ? (
          <><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin mb-1"/><p className="text-xs text-muted-foreground">Subiendo…</p></>
        ) : url ? (
          <><svg className="w-6 h-6 text-emerald-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg><p className="text-xs font-semibold text-emerald-600">{file?.name ?? 'Archivo subido'}</p><p className="text-xs text-muted-foreground">Clic para reemplazar</p></>
        ) : (
          <><svg className="w-6 h-6 text-muted-foreground mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg><p className="text-xs font-semibold text-foreground">Seleccioná un archivo</p><p className="text-xs text-muted-foreground">JPG, PNG o PDF</p></>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}/>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────
export default function FormAmparo({ tipo, tramiteId, clienteId, onSubmitOk, onCancel }: Props) {
  const supabase    = createClient()
  const TOTAL_BLOQUES = 3
  const anyosLabel  = tipo === 'ART9' ? '2 años' : '5 años'
  const tituloTipo  = tipo === 'ART9' ? 'Amparo Art. 9 Ley 24.463' : 'Amparo Ganancias'

  const [bloque, setBloque] = useState(1)
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  // ── Bloque 1: Datos personales ─────────────────────────────
  const [nombreCompleto,   setNombreCompleto]   = useState('')
  const [sexo,             setSexo]             = useState<'F' | 'M' | ''>('')
  const [fechaNacimiento,  setFechaNacimiento]  = useState('')
  const [dni,              setDni]              = useState('')
  const [cuitCuil,         setCuitCuil]         = useState('')
  const [domicilio,        setDomicilio]        = useState('')
  const [fechaJubilacion,  setFechaJubilacion]  = useState('')

  // ── Bloque 2: DNI (frente + dorso) ────────────────────────
  const [dniFrente,        setDniFrente]        = useState<File | null>(null)
  const [dniFrente_url,    setDniFrente_url]    = useState('')
  const [dniDorso,         setDniDorso]         = useState<File | null>(null)
  const [dniDorso_url,     setDniDorso_url]     = useState('')
  const [uploadingDniF,    setUploadingDniF]    = useState(false)
  const [uploadingDniD,    setUploadingDniD]    = useState(false)

  // ── Bloque 3: Bonos o Mi ANSES ─────────────────────────────
  const [metodoBonos,   setMetodoBonos]   = useState<'upload' | 'anses' | ''>('')
  const [bonosFiles,    setBonosFiles]    = useState<File[]>([])
  const [bonosUrls,     setBonosUrls]     = useState<string[]>([])
  const [uploadingBono, setUploadingBono] = useState(false)
  const [ansesUsuario,  setAnsesUsuario]  = useState('')
  const [ansesPassword, setAnsesPassword] = useState('')
  const bonosInputRef = useRef<HTMLInputElement>(null)

  // ── Upload helper ──────────────────────────────────────────
  async function uploadFile(file: File, tipo_doc: string): Promise<string> {
    const ext  = file.name.split('.').pop() ?? 'bin'
    const path = `${clienteId}/${tramiteId}/${tipo_doc}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('documentos').upload(path, file, { upsert: true })
    if (upErr) throw new Error(upErr.message)
    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
    return urlData?.publicUrl ?? path
  }

  async function handleUploadDniFrente(file: File) {
    setUploadingDniF(true)
    setError('')
    try {
      const url = await uploadFile(file, 'dni_frente')
      setDniFrente(file)
      setDniFrente_url(url)
    } catch (e) { setError(`Error al subir el DNI frente: ${String(e)}`) }
    finally { setUploadingDniF(false) }
  }

  async function handleUploadDniDorso(file: File) {
    setUploadingDniD(true)
    setError('')
    try {
      const url = await uploadFile(file, 'dni_dorso')
      setDniDorso(file)
      setDniDorso_url(url)
    } catch (e) { setError(`Error al subir el DNI dorso: ${String(e)}`) }
    finally { setUploadingDniD(false) }
  }

  async function handleUploadBonos(files: FileList) {
    setUploadingBono(true)
    setError('')
    try {
      const nuevosFiles = Array.from(files)
      const nuevasUrls: string[] = []
      for (let i = 0; i < nuevosFiles.length; i++) {
        const url = await uploadFile(nuevosFiles[i], `bono_${bonosFiles.length + i}`)
        nuevasUrls.push(url)
      }
      setBonosFiles(prev => [...prev, ...nuevosFiles])
      setBonosUrls(prev => [...prev, ...nuevasUrls])
    } catch (e) { setError(`Error al subir los bonos: ${String(e)}`) }
    finally { setUploadingBono(false) }
  }

  function removeBono(idx: number) {
    setBonosFiles(prev => prev.filter((_, i) => i !== idx))
    setBonosUrls(prev  => prev.filter((_, i) => i !== idx))
  }

  // ── Validaciones por bloque ────────────────────────────────
  function validarBloque1(): string | null {
    if (!nombreCompleto.trim()) return 'Ingresá el nombre completo.'
    if (!sexo)                  return 'Seleccioná el sexo.'
    if (!fechaNacimiento)       return 'Ingresá la fecha de nacimiento.'
    if (!dni.trim())            return 'Ingresá el número de DNI.'
    if (!cuitCuil.trim())       return 'Ingresá el CUIT o CUIL.'
    if (!domicilio.trim())      return 'Ingresá el domicilio.'
    if (!fechaJubilacion)       return 'Ingresá la fecha de jubilación.'
    return null
  }

  function validarBloque2(): string | null {
    if (!dniFrente_url) return 'Subí la foto del frente del DNI.'
    if (!dniDorso_url)  return 'Subí la foto del dorso del DNI.'
    return null
  }

  function validarBloque3(): string | null {
    if (!metodoBonos) return 'Elegí cómo vas a compartir los bonos de sueldo.'
    if (metodoBonos === 'upload' && bonosUrls.length === 0)
      return 'Subí al menos un bono de sueldo.'
    if (metodoBonos === 'anses') {
      if (!ansesUsuario.trim())  return 'Ingresá tu usuario de Mi ANSES.'
      if (!ansesPassword.trim()) return 'Ingresá tu contraseña de Mi ANSES.'
    }
    return null
  }

  async function handleSiguiente() {
    setError('')
    const err =
      bloque === 1 ? validarBloque1() :
      bloque === 2 ? validarBloque2() :
      null
    if (err) { setError(err); return }
    setBloque(b => b + 1)
  }

  async function handleEnviar() {
    setError('')
    const err3 = validarBloque3()
    if (err3) { setError(err3); return }

    setSaving(true)
    try {
      // Construir documentos_adjuntos
      const docs: Record<string, unknown>[] = [
        { tipo: 'dni_frente', nombre: dniFrente?.name ?? 'DNI frente', url: dniFrente_url, subido_at: new Date().toISOString() },
        { tipo: 'dni_dorso',  nombre: dniDorso?.name  ?? 'DNI dorso',  url: dniDorso_url,  subido_at: new Date().toISOString() },
        ...bonosUrls.map((url, i) => ({
          tipo:      'bono_sueldo',
          nombre:    bonosFiles[i]?.name ?? `Bono ${i + 1}`,
          url,
          subido_at: new Date().toISOString(),
        })),
      ]

      const datos_cliente = {
        nombre_completo:  nombreCompleto.trim(),
        sexo,
        fecha_nacimiento: fechaNacimiento,
        dni:              dni.trim(),
        cuit_cuil:        cuitCuil.trim(),
        domicilio:        domicilio.trim(),
        fecha_jubilacion: fechaJubilacion,
        metodo_bonos:     metodoBonos,
        ...(metodoBonos === 'anses' ? {
          anses_usuario:  ansesUsuario.trim(),
          anses_password: ansesPassword.trim(),
        } : {}),
      }

      await guardarFormularioAmparo({
        tramiteId,
        datos_cliente,
        documentos_adjuntos: docs,
      })

      onSubmitOk()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{tituloTipo}</p>
        <h3 className="text-base font-bold text-foreground">
          {bloque === 1 ? 'Tus datos personales'
          : bloque === 2 ? 'Copia de tu DNI'
          : 'Bonos de sueldo'}
        </h3>
      </div>

      <ProgresoBar bloque={bloque} total={TOTAL_BLOQUES}/>

      {/* BLOQUE 1 ─ Datos personales */}
      {bloque === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Nombre y apellido completo *</label>
            <input
              type="text"
              value={nombreCompleto}
              onChange={e => setNombreCompleto(e.target.value)}
              placeholder="María Elena González"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Sexo *</label>
            <div className="flex gap-2">
              {(['F', 'M'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSexo(s)}
                  className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors ${
                    sexo === s ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {s === 'F' ? 'Femenino' : 'Masculino'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Fecha de nacimiento *</label>
              <input type="date" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"/>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">DNI *</label>
              <input type="text" value={dni} onChange={e => setDni(e.target.value)} placeholder="12.345.678"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"/>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">CUIT / CUIL *</label>
            <input type="text" value={cuitCuil} onChange={e => setCuitCuil(e.target.value)} placeholder="27-12345678-4"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"/>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Domicilio completo *</label>
            <input type="text" value={domicilio} onChange={e => setDomicilio(e.target.value)}
              placeholder="Calle San Martín 1234, Mendoza, Mendoza"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"/>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Fecha de jubilación *</label>
            <input type="date" value={fechaJubilacion} onChange={e => setFechaJubilacion(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"/>
          </div>
        </div>
      )}

      {/* BLOQUE 2 ─ Fotos del DNI */}
      {bloque === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Subí una foto o escaneo de ambos lados de tu DNI. Pueden ser fotos tomadas con el celular, siempre que se lean bien los datos.
          </p>
          <FileUploadField
            label="DNI — Frente *"
            hint="La cara con tu foto y datos"
            file={dniFrente}
            url={dniFrente_url}
            onFile={handleUploadDniFrente}
            uploading={uploadingDniF}
          />
          <FileUploadField
            label="DNI — Dorso *"
            hint="La cara con el domicilio y el código de barras"
            file={dniDorso}
            url={dniDorso_url}
            onFile={handleUploadDniDorso}
            uploading={uploadingDniD}
          />
        </div>
      )}

      {/* BLOQUE 3 ─ Bonos de sueldo */}
      {bloque === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Necesitamos los bonos de sueldo de los <strong>últimos {anyosLabel}</strong>.
            Podés subirlos directamente o darnos acceso a Mi ANSES para descargarlos.
          </p>

          <div className="space-y-2">
            {/* Opción A: Subir archivos */}
            <button
              type="button"
              onClick={() => setMetodoBonos('upload')}
              className={`w-full flex items-start gap-3 border rounded-xl p-3 text-left transition-colors ${
                metodoBonos === 'upload' ? 'border-foreground/30 bg-foreground/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                metodoBonos === 'upload' ? 'border-foreground' : 'border-border'
              }`}>
                {metodoBonos === 'upload' && <div className="w-2 h-2 rounded-full bg-foreground"/>}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Subir mis bonos de sueldo</p>
                <p className="text-xs text-muted-foreground mt-0.5">Adjuntá los archivos PDF o fotos de tus bonos</p>
              </div>
            </button>

            {/* Opción B: Mi ANSES */}
            <button
              type="button"
              onClick={() => setMetodoBonos('anses')}
              className={`w-full flex items-start gap-3 border rounded-xl p-3 text-left transition-colors ${
                metodoBonos === 'anses' ? 'border-foreground/30 bg-foreground/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                metodoBonos === 'anses' ? 'border-foreground' : 'border-border'
              }`}>
                {metodoBonos === 'anses' && <div className="w-2 h-2 rounded-full bg-foreground"/>}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Darle acceso a Mi ANSES a mi abogado</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ingresás tu usuario y contraseña de Mi ANSES y nosotros descargamos los bonos</p>
              </div>
            </button>
          </div>

          {/* Área de upload de bonos */}
          {metodoBonos === 'upload' && (
            <div className="space-y-3">
              <div
                onClick={() => bonosInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-foreground/40 transition-colors text-center"
              >
                {uploadingBono ? (
                  <><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin mb-1"/><p className="text-xs text-muted-foreground">Subiendo…</p></>
                ) : (
                  <>
                    <svg className="w-6 h-6 text-muted-foreground mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    <p className="text-xs font-semibold text-foreground">Clic para seleccionar archivos</p>
                    <p className="text-xs text-muted-foreground">PDF, JPG o PNG · Podés seleccionar varios a la vez</p>
                  </>
                )}
              </div>
              <input ref={bonosInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                onChange={e => { if (e.target.files?.length) handleUploadBonos(e.target.files) }}/>

              {bonosFiles.length > 0 && (
                <div className="space-y-1.5">
                  {bonosFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 bg-muted rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        <span className="text-xs text-foreground truncate">{f.name}</span>
                      </div>
                      <button type="button" onClick={() => removeBono(i)} className="text-muted-foreground hover:text-red-500 shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">{bonosFiles.length} archivo{bonosFiles.length !== 1 ? 's' : ''} cargado{bonosFiles.length !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>
          )}

          {/* Credenciales Mi ANSES */}
          {metodoBonos === 'anses' && (
            <div className="space-y-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
              <div className="flex gap-2">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <p className="text-xs text-amber-700">Tus credenciales se almacenan de forma segura y serán usadas únicamente para descargar tus bonos de sueldo.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Usuario de Mi ANSES *</label>
                <input type="text" value={ansesUsuario} onChange={e => setAnsesUsuario(e.target.value)}
                  placeholder="tu_usuario_anses"
                  className="w-full h-9 px-3 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Contraseña de Mi ANSES *</label>
                <input type="password" value={ansesPassword} onChange={e => setAnsesPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Botones de navegación */}
      <div className="flex gap-3 pt-2">
        {bloque > 1 && (
          <button type="button" onClick={() => { setError(''); setBloque(b => b - 1) }}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Atrás
          </button>
        )}
        {bloque === 1 && (
          <button type="button" onClick={onCancel}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
        )}
        {bloque < TOTAL_BLOQUES ? (
          <button type="button" onClick={handleSiguiente}
            className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors">
            Siguiente
          </button>
        ) : (
          <button type="button" onClick={handleEnviar} disabled={saving}
            className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando…' : 'Enviar información'}
          </button>
        )}
      </div>
    </div>
  )
}
