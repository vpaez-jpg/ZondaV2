'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Etapa {
  numero:               number
  titulo:               string
  descripcion_juridica: string | null
  descripcion_cliente:  string | null
  completada:           boolean
}

interface Nota {
  id:             string
  texto_juridico: string
  texto_cliente:  string | null
  created_at:     string
}

interface Documento {
  id:          string
  nombre:      string
  descripcion: string | null
  url:         string
  tipo_mime:   string | null
  tamanio:     number | null
  rol_subidor: string
  created_at:  string
}

interface Mensaje {
  id:        string
  autor_id:  string
  autor_rol: string
  texto:     string
  leido:     boolean
  created_at: string
}

interface IntakeForm {
  id:            string
  titulo:        string
  estado:        string
  cliente_nombre: string | null
  created_at:    string
  completado_at: string | null
}

interface Caso {
  id:               string
  titulo:           string
  tipo_caso:        string | null
  cliente_nombre:   string
  cliente_email:    string | null
  cliente_whatsapp: string | null
  cliente_id:       string | null
  estado:           string
  etapa_actual:     number
  invitation_token: string
  created_at:       string
  caso_etapas:      Etapa[]
  caso_notas:       Nota[]
  caso_documentos:  Documento[]
}

interface Props {
  caso:          Caso
  mensajes:      Mensaje[]
  intakeForms:   IntakeForm[]
  partnerId:     string
  nombrePartner: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTamanio(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function iconoMime(mime: string | null) {
  if (!mime) return '📎'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('word')) return '📝'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊'
  return '📎'
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CasoDetalleShell({ caso, mensajes: mensajesIniciales, intakeForms, partnerId, nombrePartner }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zondalegal.com'

  // Estado local de etapas (optimistic updates)
  const [etapas,    setEtapas]    = useState<Etapa[]>(
    [...caso.caso_etapas].sort((a, b) => a.numero - b.numero)
  )
  const [notas,     setNotas]     = useState<Nota[]>(
    [...caso.caso_notas].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  )
  const [docs,      setDocs]      = useState<Documento[]>(caso.caso_documentos)
  const [mensajes,  setMensajes]  = useState<Mensaje[]>(mensajesIniciales)
  const [estado,    setEstado]    = useState(caso.estado)

  // UI state
  const [tab,          setTab]          = useState<'timeline' | 'mensajes' | 'documentos' | 'notas'>('timeline')
  const [textoNota,    setTextoNota]    = useState('')
  const [textoMsg,     setTextoMsg]     = useState('')
  const [enviandoNota, setEnviandoNota] = useState(false)
  const [enviandoMsg,  setEnviandoMsg]  = useState(false)
  const [subiendoDoc,  setSubiendoDoc]  = useState(false)
  const [copiadoLink,  setCopiadoLink]  = useState(false)
  const [toggling,     setToggling]     = useState<number | null>(null)

  const mensajesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  // Scroll al último mensaje al cambiar de tab
  useEffect(() => {
    if (tab === 'mensajes') {
      setTimeout(() => mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [tab, mensajes])

  // Calcular progreso
  const total      = etapas.length
  const completadas = etapas.filter(e => e.completada).length
  const pct        = total > 0 ? Math.round((completadas / total) * 100) : 0
  const noLeidos   = mensajes.filter(m => m.autor_rol === 'cliente' && !m.leido).length

  // ── Toggle etapa ────────────────────────────────────────────────────────────
  const toggleEtapa = useCallback(async (numero: number, completada: boolean) => {
    setToggling(numero)
    // Optimistic
    setEtapas(prev => prev.map(e => e.numero === numero ? { ...e, completada } : e))

    const res = await fetch(`/api/partner/casos/${caso.id}/etapas/${numero}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completada }),
    })

    if (!res.ok) {
      // Revertir
      setEtapas(prev => prev.map(e => e.numero === numero ? { ...e, completada: !completada } : e))
    }
    setToggling(null)
  }, [caso.id])

  // ── Enviar nota ─────────────────────────────────────────────────────────────
  const enviarNota = async () => {
    if (!textoNota.trim()) return
    setEnviandoNota(true)
    try {
      const res = await fetch(`/api/partner/casos/${caso.id}/nota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto_juridico: textoNota.trim() }),
      })
      if (res.ok) {
        const nueva = await res.json()
        setNotas(prev => [nueva, ...prev])
        setTextoNota('')
      }
    } finally { setEnviandoNota(false) }
  }

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const enviarMensaje = async () => {
    if (!textoMsg.trim()) return
    setEnviandoMsg(true)
    try {
      const res = await fetch(`/api/partner/casos/${caso.id}/mensajes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoMsg.trim() }),
      })
      if (res.ok) {
        const nuevo = await res.json()
        setMensajes(prev => [...prev, nuevo])
        setTextoMsg('')
      }
    } finally { setEnviandoMsg(false) }
  }

  // ── Subir documento ─────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoDoc(true)

    try {
      // Paso 1: pedir al servidor una signed upload URL (nunca pasa el archivo por el servidor)
      const urlRes = await fetch(`/api/partner/casos/${caso.id}/upload-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: file.name, tipo_mime: file.type, tamanio: file.size }),
      })
      if (!urlRes.ok) {
        alert('No se pudo generar la URL de carga. Verificá que Supabase Storage esté configurado.')
        return
      }
      const { signedUrl, path } = await urlRes.json()

      // Paso 2: subir el archivo DIRECTO a Supabase Storage desde el browser
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) {
        alert('Error al subir el archivo. Intentá de nuevo.')
        return
      }

      // Paso 3: registrar el documento en la base de datos
      const docRes = await fetch(`/api/partner/casos/${caso.id}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:       file.name,
          url:          path,
          storage_path: path,
          tipo_mime:    file.type,
          tamanio:      file.size,
        }),
      })
      if (docRes.ok) {
        const doc = await docRes.json()
        setDocs(prev => [doc, ...prev])
      }
    } finally {
      setSubiendoDoc(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Copiar link de invitación ────────────────────────────────────────────────
  const copiarLink = () => {
    const url = `${appUrl}/invitacion/${caso.invitation_token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiadoLink(true)
      setTimeout(() => setCopiadoLink(false), 2000)
    })
  }

  // ── Abrir WhatsApp ───────────────────────────────────────────────────────────
  const abrirWhatsApp = () => {
    const url = `${appUrl}/invitacion/${caso.invitation_token}`
    const mensaje = `Hola ${caso.cliente_nombre.split(' ')[0]}, soy ${nombrePartner}. Podés ver el avance de tu caso "${caso.titulo}" en tiempo real desde acá: ${url}`
    const tel = caso.cliente_whatsapp?.replace(/\D/g, '') ?? ''
    const waUrl = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`
    window.open(waUrl, '_blank')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  const estadoBadge: Record<string, string> = {
    activo:     'bg-emerald-100 text-emerald-700',
    en_espera:  'bg-amber-100 text-amber-700',
    finalizado: 'bg-muted text-muted-foreground',
    archivado:  'bg-muted text-muted-foreground',
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          <Link
            href="/partner/casos"
            className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ← Volver
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-foreground truncate">{caso.titulo}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoBadge[estado] ?? 'bg-muted text-muted-foreground'}`}>
                {estado}
              </span>
            </div>
            {caso.tipo_caso && (
              <p className="text-sm text-muted-foreground mt-0.5">{caso.tipo_caso}</p>
            )}
          </div>
        </div>

        {/* ── Info cliente + acciones rápidas ── */}
        <div className="bg-background border border-border rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</p>
            <p className="text-sm font-semibold text-foreground">{caso.cliente_nombre}</p>
            {caso.cliente_email && (
              <p className="text-xs text-muted-foreground">{caso.cliente_email}</p>
            )}
            {caso.cliente_whatsapp && (
              <p className="text-xs text-muted-foreground">{caso.cliente_whatsapp}</p>
            )}
            {caso.cliente_id ? (
              <p className="text-xs text-emerald-600 font-medium mt-1">✓ Registrado en el portal</p>
            ) : (
              <p className="text-xs text-amber-600 font-medium mt-1">⏳ Pendiente de registrarse</p>
            )}
          </div>

          {/* Barra de progreso */}
          <div className="flex-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progreso del caso</span>
              <span>{completadas}/{total} etapas</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-right">{pct}% completado</p>
          </div>

          {/* Acciones rápidas */}
          <div className="flex flex-row sm:flex-col gap-2 sm:w-40">
            <button
              onClick={copiarLink}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors"
            >
              {copiadoLink ? '✓ Copiado' : '🔗 Copiar link'}
            </button>
            <button
              onClick={abrirWhatsApp}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-foreground text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              📲 WhatsApp
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl">
          {[
            { key: 'timeline',   label: 'Timeline', count: null },
            { key: 'mensajes',   label: 'Mensajes',  count: noLeidos > 0 ? noLeidos : null },
            { key: 'documentos', label: 'Documentos', count: null },
            { key: 'notas',      label: 'Notas',      count: null },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              {count != null && (
                <span className="bg-foreground text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB: TIMELINE                                                         */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'timeline' && (
          <div className="space-y-3">
            {etapas.map((etapa, idx) => {
              const esActual = !etapa.completada && (idx === 0 || etapas[idx - 1]?.completada)
              const cargando = toggling === etapa.numero

              return (
                <div
                  key={etapa.numero}
                  className={`bg-background border rounded-2xl p-4 transition-all ${
                    etapa.completada
                      ? 'border-border opacity-70'
                      : esActual
                        ? 'border-foreground/30 shadow-sm'
                        : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox / número */}
                    <button
                      onClick={() => toggleEtapa(etapa.numero, !etapa.completada)}
                      disabled={cargando}
                      className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        etapa.completada
                          ? 'bg-foreground text-primary-foreground'
                          : esActual
                            ? 'border-2 border-foreground text-foreground'
                            : 'border-2 border-muted text-muted-foreground'
                      } ${cargando ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'}`}
                    >
                      {cargando ? (
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/>
                          <path d="M4 12a8 8 0 018-8V0" stroke="currentColor" strokeWidth="3" className="opacity-75"/>
                        </svg>
                      ) : etapa.completada ? (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{etapa.numero}</span>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${etapa.completada ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {etapa.titulo}
                        </p>
                        {esActual && (
                          <span className="text-[10px] bg-foreground text-primary-foreground px-2 py-0.5 rounded-full font-medium">
                            En curso
                          </span>
                        )}
                      </div>

                      {etapa.descripcion_juridica && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          <span className="font-medium">Jurídico:</span> {etapa.descripcion_juridica}
                        </p>
                      )}
                      {etapa.descripcion_cliente && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          <span className="font-medium">Para el cliente:</span> {etapa.descripcion_cliente}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {etapas.length === 0 && (
              <div className="bg-background border border-border rounded-2xl p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Este caso no tiene etapas todavía.
                  <br/>
                  <Link href="/partner/casos" className="text-foreground font-medium hover:underline">
                    Abrí el editor de timeline
                  </Link>
                  {' '}para generarlas con IA.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB: MENSAJES                                                         */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'mensajes' && (
          <div className="bg-background border border-border rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: '420px' }}>
            {/* Chat */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '380px' }}>
              {mensajes.length === 0 && (
                <div className="flex items-center justify-center h-32">
                  <p className="text-sm text-muted-foreground text-center">
                    Todavía no hay mensajes.<br/>
                    {caso.cliente_id
                      ? 'Enviá el primero acá abajo.'
                      : 'El cliente todavía no se registró en el portal.'}
                  </p>
                </div>
              )}
              {mensajes.map(m => {
                const esPartner = m.autor_rol === 'partner'
                return (
                  <div key={m.id} className={`flex ${esPartner ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                      esPartner
                        ? 'bg-foreground text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      <p className="text-sm leading-relaxed">{m.texto}</p>
                      <p className={`text-[10px] mt-1 ${esPartner ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {formatFecha(m.created_at)}
                        {esPartner && m.leido && ' · ✓✓'}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={mensajesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3 flex gap-2">
              <textarea
                value={textoMsg}
                onChange={e => setTextoMsg(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje() }
                }}
                placeholder={caso.cliente_id ? 'Escribí un mensaje al cliente...' : 'El cliente aún no se registró'}
                disabled={!caso.cliente_id || enviandoMsg}
                rows={1}
                className="flex-1 resize-none text-sm rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50"
              />
              <button
                onClick={enviarMensaje}
                disabled={!textoMsg.trim() || !caso.cliente_id || enviandoMsg}
                className="px-4 py-2 bg-foreground text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {enviandoMsg ? '...' : 'Enviar'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB: DOCUMENTOS                                                       */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'documentos' && (
          <div className="space-y-3">
            {/* Upload area */}
            <div className="bg-background border border-border border-dashed rounded-2xl p-5 text-center">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="*/*"
              />
              <p className="text-sm text-muted-foreground mb-3">
                Subí documentos para compartir con el cliente
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={subiendoDoc}
                className="px-4 py-2 bg-foreground text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {subiendoDoc ? 'Subiendo...' : '+ Agregar documento'}
              </button>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, imágenes, Word — cualquier formato
              </p>
            </div>

            {/* Lista de documentos */}
            {docs.length === 0 ? (
              <div className="bg-background border border-border rounded-2xl p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  No hay documentos adjuntos todavía.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Sección: del partner */}
                {docs.filter(d => d.rol_subidor === 'partner').length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground px-1">Del estudio</p>
                    {docs.filter(d => d.rol_subidor === 'partner').map(doc => (
                      <DocRow key={doc.id} doc={doc} casoId={caso.id} onDelete={id => setDocs(prev => prev.filter(d => d.id !== id))} />
                    ))}
                  </>
                )}

                {/* Sección: del cliente */}
                {docs.filter(d => d.rol_subidor === 'cliente').length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground px-1 mt-3">Del cliente</p>
                    {docs.filter(d => d.rol_subidor === 'cliente').map(doc => (
                      <DocRow key={doc.id} doc={doc} casoId={caso.id} onDelete={null} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB: NOTAS                                                            */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'notas' && (
          <div className="space-y-4">
            {/* Nueva nota */}
            <div className="bg-background border border-border rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Nueva novedad</p>
              <p className="text-xs text-muted-foreground">
                Escribí en lenguaje jurídico — la IA lo traduce para el cliente automáticamente
              </p>
              <textarea
                value={textoNota}
                onChange={e => setTextoNota(e.target.value)}
                placeholder="Ej: Se presentó escrito de inicio de demanda ante el Juzgado Civil N°14..."
                rows={3}
                className="w-full resize-none text-sm rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
              <button
                onClick={enviarNota}
                disabled={!textoNota.trim() || enviandoNota}
                className="px-4 py-2 bg-foreground text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {enviandoNota ? 'Traduciendo y guardando...' : 'Agregar novedad'}
              </button>
            </div>

            {/* Lista de notas */}
            {notas.length === 0 ? (
              <div className="bg-background border border-border rounded-2xl p-8 text-center">
                <p className="text-muted-foreground text-sm">No hay novedades registradas todavía.</p>
              </div>
            ) : (
              notas.map(nota => (
                <div key={nota.id} className="bg-background border border-border rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{formatFecha(nota.created_at)}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-muted/30 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Texto jurídico</p>
                      <p className="text-xs text-foreground leading-relaxed">{nota.texto_juridico}</p>
                    </div>
                    {nota.texto_cliente && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">✓ Traducción para el cliente</p>
                        <p className="text-xs text-foreground leading-relaxed">{nota.texto_cliente}</p>
                      </div>
                    )}
                    {!nota.texto_cliente && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3">
                        <p className="text-xs text-amber-700 dark:text-amber-400">⚠ La traducción IA no está disponible para esta nota</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Intake forms ── */}
        {intakeForms.length > 0 && (
          <div className="bg-background border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Formularios de datos</p>
              <Link href={`/partner/casos/${caso.id}/intake`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Ver todos →
              </Link>
            </div>
            {intakeForms.map(f => (
              <div key={f.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">{f.titulo}</p>
                  <p className="text-xs text-muted-foreground">{formatFecha(f.created_at)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  f.estado === 'completado'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {f.estado === 'completado' ? '✓ Completado' : '⏳ Pendiente'}
                </span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Sub-componente: fila de documento ───────────────────────────────────────

function DocRow({
  doc,
  casoId,
  onDelete,
}: {
  doc: Documento
  casoId: string
  onDelete: ((id: string) => void) | null
}) {
  const [eliminando, setEliminando] = useState(false)

  const eliminar = async () => {
    if (!onDelete) return
    setEliminando(true)
    await fetch(`/api/partner/casos/${casoId}/documentos?docId=${doc.id}`, { method: 'DELETE' })
    onDelete(doc.id)
    setEliminando(false)
  }

  return (
    <div className="bg-background border border-border rounded-xl p-3 flex items-center gap-3">
      <span className="text-xl">{iconoMime(doc.tipo_mime)}</span>
      <div className="flex-1 min-w-0">
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground hover:underline truncate block"
        >
          {doc.nombre}
        </a>
        <p className="text-xs text-muted-foreground">
          {doc.descripcion ?? ''}
          {doc.tamanio ? ` · ${formatTamanio(doc.tamanio)}` : ''}
          {' · '}
          {new Date(doc.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
        </p>
      </div>
      {onDelete && (
        <button
          onClick={eliminar}
          disabled={eliminando}
          className="text-muted-foreground hover:text-destructive transition-colors p-1 disabled:opacity-50"
          title="Eliminar"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  )
}
