'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface CampoIntake {
  id:          string
  tipo:        string
  etiqueta:    string
  descripcion?: string
  requerido:   boolean
}

interface ArchivoRespuesta {
  campo_id: string
  nombre:   string
  url:      string
  tipo_mime: string
  tamanio:  number
}

interface IntakeRespuesta {
  id:         string
  respuestas: Record<string, unknown>
  archivos:   ArchivoRespuesta[] | null
  created_at: string
}

interface IntakeFormDetail {
  id:               string
  token:            string
  titulo:           string
  descripcion:      string | null
  estado:           string
  campos:           CampoIntake[]
  cliente_nombre:   string | null
  cliente_whatsapp: string | null
  cliente_email:    string | null
  caso_id:          string | null
  created_at:       string
  completado_at:    string | null
  preview_url:      string
  intake_respuestas: IntakeRespuesta[]
}

interface IntakeFormListItem {
  id:               string
  titulo:           string
  estado:           string
  cliente_nombre:   string | null
  cliente_whatsapp: string | null
  created_at:       string
  completado_at:    string | null
  preview_url:      string
  intake_respuestas: { id: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTamanio(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function IntakeDrawer() {
  const [open,       setOpen]       = useState(false)
  const [forms,      setForms]      = useState<IntakeFormListItem[]>([])
  const [loading,    setLoading]    = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail,     setDetail]     = useState<IntakeFormDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [casoCreado, setCasoCreado] = useState<{ id: string; nombre: string } | null>(null)

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partner/intake')
      if (res.ok) setForms(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadForms()
  }, [open, loadForms])

  // Abrir/cerrar un form en la lista
  async function toggleDetail(id: string) {
    if (selectedId === id) {
      setSelectedId(null)
      setDetail(null)
      setCasoCreado(null)
      return
    }
    setSelectedId(id)
    setDetail(null)
    setCasoCreado(null)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/partner/intake/${id}`)
      if (res.ok) setDetail(await res.json())
    } finally {
      setLoadingDetail(false)
    }
  }

  async function crearCliente() {
    if (!detail) return
    setCreandoCliente(true)
    try {
      // Intentar extraer email de las respuestas
      const respuestas = detail.intake_respuestas[0]?.respuestas ?? {}
      const emailCampo = detail.campos.find(c => c.tipo === 'email')
      const emailResp  = emailCampo ? String(respuestas[emailCampo.id] ?? '') : null
      const email      = emailResp || detail.cliente_email || null

      const res = await fetch('/api/partner/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:          detail.cliente_nombre ?? 'Cliente',
          whatsapp:        detail.cliente_whatsapp,
          email,
          desde_intake_id: detail.id,
        }),
      })
      if (res.ok) {
        const caso = await res.json()
        setCasoCreado({ id: caso.id, nombre: caso.cliente_nombre })
        // Actualizar el caso_id en la lista local
        setDetail(prev => prev ? { ...prev, caso_id: caso.id } : prev)
      }
    } finally {
      setCreandoCliente(false)
    }
  }

  function renderRespuesta(
    campo: CampoIntake,
    respuestas: Record<string, unknown>,
    archivos: ArchivoRespuesta[] | null
  ) {
    if (campo.tipo === 'archivo') {
      const archivo = archivos?.find(a => a.campo_id === campo.id)
      if (!archivo || !archivo.url)
        return <span className="text-xs text-muted-foreground italic">No subido</span>
      return (
        <a
          href={archivo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
        >
          <span>📎</span>
          <span className="truncate max-w-[200px]">{archivo.nombre}</span>
          <span className="text-muted-foreground shrink-0">
            {formatTamanio(archivo.tamanio)}
          </span>
          <span className="text-muted-foreground">↗</span>
        </a>
      )
    }

    const valor = respuestas[campo.id]
    if (valor === undefined || valor === null || valor === '')
      return <span className="text-xs text-muted-foreground italic">Sin respuesta</span>
    return <span className="text-sm text-foreground break-words">{String(valor)}</span>
  }

  const pendientes  = forms.filter(f => f.estado !== 'completado').length
  const completados = forms.filter(f => f.estado === 'completado').length

  return (
    <>
      {/* ── Botón trigger ── */}
      <button
        onClick={() => setOpen(true)}
        title="Formularios de intake"
        className="relative flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background transition-colors"
      >
        {/* Icono: clipboard list */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25V6.75zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
        Formularios
        {/* Badge con pendientes */}
        {pendientes > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-[9px] font-bold text-white rounded-full flex items-center justify-center">
            {pendientes}
          </span>
        )}
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Drawer ── */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[520px] bg-background border-l border-border shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Formularios de datos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completados} completado{completados !== 1 ? 's' : ''}
              {pendientes > 0 && ` · ${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Lista de formularios */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-muted-foreground animate-pulse">Cargando formularios...</p>
            </div>
          )}

          {!loading && forms.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 px-6 text-center">
              <div className="text-3xl">📋</div>
              <p className="text-sm text-muted-foreground">
                Todavía no enviaste ningún formulario.
              </p>
              <p className="text-xs text-muted-foreground">
                Pedile al asistente: <span className="font-medium text-foreground">"Necesito el DNI y CUIL de Juan García, tel 11-1234-5678"</span>
              </p>
            </div>
          )}

          <div className="p-3 space-y-2">
            {forms.map(form => {
              const completado  = form.estado === 'completado'
              const isSelected  = selectedId === form.id
              const respCount   = form.intake_respuestas.length

              return (
                <div
                  key={form.id}
                  className={`border rounded-xl overflow-hidden transition-colors ${
                    isSelected ? 'border-foreground/20' : 'border-border'
                  }`}
                >
                  {/* Fila principal */}
                  <button
                    onClick={() => toggleDetail(form.id)}
                    className="w-full flex items-center gap-3 p-3.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className={`shrink-0 w-2.5 h-2.5 rounded-full mt-0.5 ${
                      completado ? 'bg-emerald-500' : 'bg-amber-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{form.titulo}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {form.cliente_nombre ?? 'Sin nombre'}
                        {' · '}
                        {formatFecha(form.created_at)}
                        {respCount > 0 && ' · ✓ Con respuesta'}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`hidden sm:block text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        completado
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {completado ? 'Completado' : 'Pendiente'}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isSelected ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Panel expandido */}
                  {isSelected && (
                    <div className="border-t border-border bg-muted/20">
                      {loadingDetail && detail?.id !== form.id && (
                        <div className="p-4">
                          <p className="text-xs text-muted-foreground animate-pulse">Cargando respuestas...</p>
                        </div>
                      )}

                      {detail && detail.id === form.id && (
                        <div className="p-4 space-y-4">

                          {/* Info del cliente */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {detail.cliente_nombre && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Cliente:</span> {detail.cliente_nombre}
                              </p>
                            )}
                            {detail.cliente_whatsapp && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Tel:</span> {detail.cliente_whatsapp}
                              </p>
                            )}
                            {detail.cliente_email && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Email:</span> {detail.cliente_email}
                              </p>
                            )}
                          </div>

                          {/* Respuestas */}
                          {detail.intake_respuestas.length > 0 ? (
                            <div className="space-y-3">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                Respuestas del cliente · {formatFecha(detail.intake_respuestas[0].created_at)}
                              </p>
                              {detail.campos.map(campo => {
                                const resp = detail.intake_respuestas[0]
                                return (
                                  <div key={campo.id} className="space-y-0.5">
                                    <p className="text-xs font-medium text-muted-foreground">{campo.etiqueta}</p>
                                    {renderRespuesta(campo, resp.respuestas, resp.archivos)}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                ⏳ El cliente todavía no completó el formulario
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(detail.preview_url)
                                  }}
                                  className="text-xs text-amber-800 dark:text-amber-300 font-medium hover:underline"
                                >
                                  📋 Copiar link
                                </button>
                                <span className="text-amber-300 dark:text-amber-700">·</span>
                                <a
                                  href={detail.preview_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-amber-800 dark:text-amber-300 font-medium hover:underline"
                                >
                                  Ver formulario →
                                </a>
                              </div>
                            </div>
                          )}

                          {/* CTA: Convertir en cliente */}
                          {completado && (
                            detail.caso_id || casoCreado ? (
                              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                <span className="text-emerald-500">✓</span>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium flex-1">
                                  {casoCreado ? `${casoCreado.nombre} fue creado como cliente` : 'Ya tiene un caso asociado'}
                                </p>
                                <a
                                  href={`/partner/casos/${detail.caso_id ?? casoCreado?.id}`}
                                  className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:underline shrink-0"
                                >
                                  Ver caso →
                                </a>
                              </div>
                            ) : (
                              <button
                                onClick={crearCliente}
                                disabled={creandoCliente}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-foreground text-primary-foreground rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                {creandoCliente ? (
                                  <>
                                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/>
                                      <path d="M4 12a8 8 0 018-8V0" stroke="currentColor" strokeWidth="3" className="opacity-75"/>
                                    </svg>
                                    Creando cliente...
                                  </>
                                ) : (
                                  '+ Convertir en cliente'
                                )}
                              </button>
                            )
                          )}

                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
