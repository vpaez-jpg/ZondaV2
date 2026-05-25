'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams }                    from 'next/navigation'

interface Campo {
  id:              string
  tipo:            'texto' | 'email' | 'telefono' | 'fecha' | 'numero' | 'opcion' | 'archivo' | 'textarea'
  etiqueta:        string
  descripcion?:    string
  requerido:       boolean
  opciones?:       string[]
  acepta_archivo?: boolean
}

interface FormInfo {
  id:             string
  titulo:         string
  descripcion:    string | null
  campos:         Campo[]
  cliente_nombre: string | null
  estado:         string
  partner_nombre: string
}

export default function FormularioPage() {
  const { token } = useParams<{ token: string }>()

  const [form,       setForm]       = useState<FormInfo | null>(null)
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState('')
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [archivos,   setArchivos]   = useState<Record<string, File | null>>({})
  const [enviando,   setEnviando]   = useState(false)
  const [enviado,    setEnviado]    = useState(false)
  const [errEnvio,   setErrEnvio]   = useState('')

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Cargar info del formulario
  useEffect(() => {
    if (!token) return
    fetch(`/api/formulario/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError('Este formulario no existe o ya fue completado.'); return }
        setForm(data)
        if (data.estado === 'completado') setEnviado(true)
      })
      .catch(() => setError('Error cargando el formulario. Intentá de nuevo.'))
      .finally(() => setCargando(false))
  }, [token])

  const handleCampo = (campoId: string, valor: string) => {
    setRespuestas(prev => ({ ...prev, [campoId]: valor }))
  }

  const handleArchivo = (campoId: string, file: File | null) => {
    setArchivos(prev => ({ ...prev, [campoId]: file }))
  }

  const validar = (): string | null => {
    if (!form) return 'Sin formulario'
    for (const campo of form.campos) {
      if (!campo.requerido) continue
      if (campo.tipo === 'archivo') {
        if (!archivos[campo.id]) return `"${campo.etiqueta}" es requerido`
      } else {
        if (!respuestas[campo.id]?.trim()) return `"${campo.etiqueta}" es requerido`
      }
    }
    return null
  }

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrEnvio('')

    const err = validar()
    if (err) { setErrEnvio(err); return }

    setEnviando(true)

    try {
      // Si hay archivos, subirlos primero directo a Supabase Storage (intake-archivos bucket)
      const archivosMetadata: Array<{ campo_id: string; nombre: string; url: string; tipo_mime: string; tamanio: number }> = []

      for (const campo of (form?.campos ?? [])) {
        if (campo.tipo !== 'archivo') continue
        const file = archivos[campo.id]
        if (!file) continue

        // Paso 1: obtener signed upload URL del servidor (valida el token)
        const urlRes = await fetch(`/api/formulario/${token}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre:    file.name,
            tipo_mime: file.type,
            campo_id:  campo.id,
          }),
        })

        if (urlRes.ok) {
          const { signedUrl, publicUrl } = await urlRes.json()

          // Paso 2: subir el archivo directo a Supabase Storage desde el browser
          const putRes = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          })

          archivosMetadata.push({
            campo_id:  campo.id,
            nombre:    file.name,
            url:       putRes.ok ? publicUrl : '',
            tipo_mime: file.type,
            tamanio:   file.size,
          })
        } else {
          // Si falla la obtención de la URL, registrar igual sin URL (el campo quedará vacío)
          archivosMetadata.push({
            campo_id:  campo.id,
            nombre:    file.name,
            url:       '',
            tipo_mime: file.type,
            tamanio:   file.size,
          })
        }
      }

      const res = await fetch(`/api/formulario/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          respuestas,
          archivos: archivosMetadata.length > 0 ? archivosMetadata : null,
        }),
      })

      if (res.ok) {
        setEnviado(true)
      } else {
        const data = await res.json()
        setErrEnvio(data.error ?? 'Error al enviar. Intentá de nuevo.')
      }
    } catch {
      setErrEnvio('Error de conexión. Verificá tu internet e intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  // ── Pantalla de carga ────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <svg className="w-6 h-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
          <path d="M4 12a8 8 0 018-8V0" fill="currentColor" className="opacity-75"/>
        </svg>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-background border border-border rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground">Formulario no disponible</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  // ── Enviado exitosamente ─────────────────────────────────────────
  if (enviado) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-background border border-border rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">¡Listo! Formulario enviado</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Tu información llegó al estudio. Te van a contactar a la brevedad.
            </p>
          </div>
          {form && (
            <p className="text-xs text-muted-foreground">
              {form.partner_nombre}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!form) return null

  // ── Formulario ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="w-full max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="bg-background border border-border rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{form.partner_nombre} necesita</p>
              <p className="text-sm font-semibold text-foreground">{form.titulo}</p>
            </div>
          </div>

          {form.descripcion && (
            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              {form.descripcion}
            </p>
          )}

          {form.cliente_nombre && (
            <p className="text-xs text-muted-foreground">
              Para: <span className="font-medium text-foreground">{form.cliente_nombre}</span>
            </p>
          )}
        </div>

        {/* Campos */}
        <form onSubmit={handleEnviar} className="bg-background border border-border rounded-2xl p-5 space-y-5">
          {form.campos.map((campo, idx) => (
            <div key={campo.id} className="space-y-1.5">
              <label className="text-sm font-medium text-foreground block">
                {campo.etiqueta}
                {campo.requerido && <span className="text-destructive ml-1">*</span>}
              </label>

              {campo.descripcion && (
                <p className="text-xs text-muted-foreground">{campo.descripcion}</p>
              )}

              {/* Tipo: texto, email, telefono, fecha, numero */}
              {(campo.tipo === 'texto' || campo.tipo === 'email' || campo.tipo === 'telefono' || campo.tipo === 'fecha' || campo.tipo === 'numero') && (
                <input
                  type={
                    campo.tipo === 'email'    ? 'email'  :
                    campo.tipo === 'telefono' ? 'tel'    :
                    campo.tipo === 'fecha'    ? 'date'   :
                    campo.tipo === 'numero'   ? 'number' : 'text'
                  }
                  value={respuestas[campo.id] ?? ''}
                  onChange={e => handleCampo(campo.id, e.target.value)}
                  required={campo.requerido}
                  autoFocus={idx === 0}
                  className="w-full text-sm rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                  placeholder={
                    campo.tipo === 'email'    ? 'tu@email.com'     :
                    campo.tipo === 'telefono' ? '11 1234-5678'     :
                    campo.tipo === 'fecha'    ? 'dd/mm/aaaa'       :
                    campo.tipo === 'numero'   ? '0'                : ''
                  }
                />
              )}

              {/* Tipo: textarea */}
              {campo.tipo === 'textarea' && (
                <textarea
                  value={respuestas[campo.id] ?? ''}
                  onChange={e => handleCampo(campo.id, e.target.value)}
                  required={campo.requerido}
                  rows={3}
                  className="w-full text-sm rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/30 resize-none"
                />
              )}

              {/* Tipo: opcion */}
              {campo.tipo === 'opcion' && campo.opciones && (
                <div className="space-y-2">
                  {campo.opciones.map(opcion => (
                    <label key={opcion} className="flex items-center gap-2.5 cursor-pointer group">
                      <div
                        onClick={() => handleCampo(campo.id, opcion)}
                        className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all ${
                          respuestas[campo.id] === opcion
                            ? 'border-foreground bg-foreground'
                            : 'border-border group-hover:border-foreground/50'
                        }`}
                      >
                        {respuestas[campo.id] === opcion && (
                          <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full"/>
                        )}
                      </div>
                      <span className="text-sm text-foreground">{opcion}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Tipo: archivo */}
              {campo.tipo === 'archivo' && (
                <div>
                  <input
                    ref={el => { fileRefs.current[campo.id] = el }}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.xls"
                    onChange={e => handleArchivo(campo.id, e.target.files?.[0] ?? null)}
                  />
                  {archivos[campo.id] ? (
                    <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2.5">
                      <span className="text-base">📎</span>
                      <span className="text-sm text-foreground flex-1 truncate">{archivos[campo.id]!.name}</span>
                      <button
                        type="button"
                        onClick={() => handleArchivo(campo.id, null)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRefs.current[campo.id]?.click()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border hover:border-foreground/30 px-3 py-4 text-sm text-muted-foreground hover:text-foreground transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.503 11.05H6.75z" />
                      </svg>
                      Seleccionar archivo
                      <span className="text-xs">(PDF, foto, Word, Excel)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {errEnvio && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
              <p className="text-sm text-destructive">{errEnvio}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-foreground text-primary-foreground rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {enviando ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                  <path d="M4 12a8 8 0 018-8V0" fill="currentColor" className="opacity-75"/>
                </svg>
                Enviando...
              </span>
            ) : (
              'Enviar información →'
            )}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            Tus datos van directamente a {form.partner_nombre} y son confidenciales.
          </p>
        </form>
      </div>
    </div>
  )
}
