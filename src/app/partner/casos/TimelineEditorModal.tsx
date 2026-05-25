'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface Etapa {
  numero:               number
  titulo:               string
  descripcion_juridica: string
  descripcion_cliente:  string
}

interface Props {
  casoId:       string
  titulo:       string
  tipoCaso:     string
  nombrePartner: string
  etapasIniciales: Etapa[]
  onClose:      () => void
  onPublicado:  (etapas: Etapa[]) => void
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function TimelineEditorModal({
  casoId,
  titulo,
  tipoCaso,
  nombrePartner,
  etapasIniciales,
  onClose,
  onPublicado,
}: Props) {
  const [paso, setPaso] = useState<'describir' | 'editar'>(
    etapasIniciales.length > 0 ? 'editar' : 'describir'
  )
  const [descripcion, setDescripcion]   = useState('')
  const [etapas,      setEtapas]        = useState<Etapa[]>(etapasIniciales)
  const [generando,   setGenerando]     = useState(false)
  const [guardando,   setGuardando]     = useState(false)
  const [ajuste,      setAjuste]        = useState('')
  const [ajustando,   setAjustando]     = useState(false)
  const [chatLog,     setChatLog]       = useState<{ rol: 'user' | 'ia'; texto: string }[]>([])
  const [grabando,    setGrabando]      = useState(false)
  const [visible,     setVisible]       = useState(false)
  const [etapaEdit,   setEtapaEdit]     = useState<number | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const chatEndRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatLog])

  function cerrar() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  // ── Voice input ────────────────────────────────────────────────────────────

  function toggleGrabacion() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return
    if (grabando) { recognitionRef.current?.stop(); setGrabando(false); return }

    const SpeechAPI =
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
      ?? window.SpeechRecognition

    const rec = new SpeechAPI()
    rec.lang          = 'es-AR'
    rec.continuous    = true
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let txt = ''
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + ' '
      setDescripcion(prev => prev + txt)
    }
    rec.onend = () => setGrabando(false)
    rec.onerror = () => setGrabando(false)
    rec.start()
    recognitionRef.current = rec
    setGrabando(true)
  }

  // ── Generar timeline desde descripción ────────────────────────────────────

  async function generarTimeline() {
    if (!descripcion.trim()) return
    setGenerando(true)
    try {
      const res = await fetch('/api/partner/casos/generar-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion, titulo, tipoCaso, nombrePartner }),
      })
      const data = await res.json()
      if (data.etapas?.length) {
        setEtapas(data.etapas)
        setPaso('editar')
        setChatLog([{
          rol: 'ia',
          texto: `Generé ${data.etapas.length} etapas basándome en tu descripción. Revisalas y decime qué querés cambiar.`,
        }])
      }
    } finally {
      setGenerando(false)
    }
  }

  // ── Ajustar por chat ───────────────────────────────────────────────────────

  async function enviarAjuste() {
    if (!ajuste.trim() || ajustando) return
    const msg = ajuste.trim()
    setAjuste('')
    setChatLog(prev => [...prev, { rol: 'user', texto: msg }])
    setAjustando(true)

    try {
      const res = await fetch('/api/partner/casos/ajustar-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: msg, etapasActuales: etapas, titulo, tipoCaso }),
      })
      const data = await res.json()
      if (data.etapas?.length) {
        setEtapas(data.etapas)
        setChatLog(prev => [...prev, { rol: 'ia', texto: `Listo, actualicé el timeline. ${data.etapas.length} etapas en total.` }])
      } else {
        setChatLog(prev => [...prev, { rol: 'ia', texto: 'No pude aplicar el ajuste. Intentá de nuevo con más detalle.' }])
      }
    } catch {
      setChatLog(prev => [...prev, { rol: 'ia', texto: 'Error al conectar. Intentá de nuevo.' }])
    } finally {
      setAjustando(false)
    }
  }

  // ── Publicar timeline ─────────────────────────────────────────────────────

  async function publicar() {
    if (!etapas.length || guardando) return
    setGuardando(true)
    try {
      const res = await fetch(`/api/partner/casos/${casoId}/etapas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapas }),
      })
      if (res.ok) {
        onPublicado(etapas)
        cerrar()
      }
    } finally {
      setGuardando(false)
    }
  }

  // ── Edición inline de etapa ───────────────────────────────────────────────

  function actualizarEtapa(idx: number, field: keyof Etapa, val: string) {
    setEtapas(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200',
      visible ? 'opacity-100' : 'opacity-0'
    )}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cerrar} />

      <div className={cn(
        'relative w-full max-w-2xl bg-background border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-200',
        visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
      )} style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">Timeline del caso</p>
            <p className="text-xs text-muted-foreground">{titulo} · {tipoCaso}</p>
          </div>
          <button onClick={cerrar} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Paso 1: Describir el proceso */}
          {paso === 'describir' && (
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/40 border border-border">
                <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-0.5">Describí el proceso del caso</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Contame en tus palabras cómo va a ser el proceso. No hace falta que sea perfecto — la IA va a interpretar y podés ajustar después.
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground">Tu descripción del proceso</label>
                  <button
                    onClick={toggleGrabacion}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors',
                      grabando
                        ? 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse'
                        : 'border-border text-muted-foreground hover:text-foreground bg-background'
                    )}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                    {grabando ? 'Detener' : 'Dictar'}
                  </button>
                </div>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={6}
                  placeholder='Ej: "Es un divorcio de mutuo acuerdo en Mendoza. Primero presentamos la demanda con el convenio regulador. Después el juez da traslado a la otra parte. Luego se fija audiencia y finalmente sale la sentencia..."'
                  className="w-full resize-none bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 leading-relaxed focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>

              <button
                onClick={generarTimeline}
                disabled={!descripcion.trim() || generando}
                className="w-full flex items-center justify-center gap-2 bg-foreground text-primary-foreground rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {generando ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Generando timeline...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    Generar timeline con IA
                  </>
                )}
              </button>
            </div>
          )}

          {/* Paso 2: Editar y ajustar */}
          {paso === 'editar' && (
            <div className="flex flex-col">
              {/* Lista de etapas */}
              <div className="p-5 space-y-2 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {etapas.length} etapas
                  </p>
                  <button
                    onClick={() => { setPaso('describir'); setEtapas([]) }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Empezar de nuevo
                  </button>
                </div>

                {etapas.map((etapa, idx) => (
                  <div
                    key={etapa.numero}
                    className={cn(
                      'rounded-xl border transition-all',
                      etapaEdit === idx
                        ? 'border-foreground/30 bg-muted/30'
                        : 'border-border bg-card hover:border-foreground/15'
                    )}
                  >
                    {/* Header de etapa */}
                    <button
                      onClick={() => setEtapaEdit(etapaEdit === idx ? null : idx)}
                      className="w-full flex items-start gap-3 px-3.5 py-3 text-left"
                    >
                      <span className="w-5 h-5 rounded-full bg-foreground text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {etapa.numero}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{etapa.titulo}</p>
                        <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                          {etapa.descripcion_cliente}
                        </p>
                      </div>
                      <svg className={cn('w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform', etapaEdit === idx && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {/* Edición inline */}
                    {etapaEdit === idx && (
                      <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-border/50 pt-3">
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Título</label>
                          <input
                            type="text"
                            value={etapa.titulo}
                            onChange={e => actualizarEtapa(idx, 'titulo', e.target.value)}
                            className="mt-1 w-full text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Descripción jurídica (para vos)</label>
                          <textarea
                            value={etapa.descripcion_juridica}
                            onChange={e => actualizarEtapa(idx, 'descripcion_juridica', e.target.value)}
                            rows={2}
                            className="mt-1 w-full text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Descripción para el cliente</label>
                          <textarea
                            value={etapa.descripcion_cliente}
                            onChange={e => actualizarEtapa(idx, 'descripcion_cliente', e.target.value)}
                            rows={2}
                            className="mt-1 w-full text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Chat de ajuste */}
              <div className="p-4 bg-muted/20">
                <p className="text-xs font-medium text-foreground mb-3">Ajustar por chat</p>

                {/* Historial */}
                {chatLog.length > 0 && (
                  <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                    {chatLog.map((m, i) => (
                      <div key={i} className={cn('text-xs rounded-lg px-3 py-2 max-w-[85%]', m.rol === 'user'
                        ? 'bg-foreground text-primary-foreground ml-auto'
                        : 'bg-card border border-border text-foreground'
                      )}>
                        {m.texto}
                      </div>
                    ))}
                    {ajustando && (
                      <div className="bg-card border border-border rounded-lg px-3 py-2 flex gap-1 w-16">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ajuste}
                    onChange={e => setAjuste(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarAjuste()}
                    placeholder='Ej: "Cambiá el paso 3 por..." o "Agregá una etapa de..."'
                    disabled={ajustando}
                    className="flex-1 text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50"
                  />
                  <button
                    onClick={enviarAjuste}
                    disabled={!ajuste.trim() || ajustando}
                    className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground rounded-lg transition-colors disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer con Aprobar y Publicar */}
        {paso === 'editar' && etapas.length > 0 && (
          <div className="px-5 py-3.5 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              El cliente verá la versión amigable de cada etapa.
            </p>
            <button
              onClick={publicar}
              disabled={guardando}
              className="flex items-center gap-2 bg-foreground text-primary-foreground rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
            >
              {guardando ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Publicando...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Aprobar y publicar timeline
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
