'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface CampoIntake {
  id:          string
  tipo:        string
  etiqueta:    string
  descripcion?: string
  requerido:   boolean
}

interface IntakePreview {
  id:          string
  token:       string
  titulo:      string
  campos:      CampoIntake[]
  clienteNombre:    string | null
  clienteWhatsapp:  string | null
  previewUrl:  string
  waLink:      string | null
}

interface Mensaje {
  role:     'user' | 'assistant'
  content:  string
  acciones?: string[]
  intake?:  IntakePreview   // datos del formulario generado (para confirmación)
}

interface VencimientoLS {
  id: string
  titulo: string
  fecha: string
  fechaRecordatorio?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getVencimientosLS(): VencimientoLS[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('zonda_vencimientos')
    return raw ? (JSON.parse(raw) as VencimientoLS[]) : []
  } catch {
    return []
  }
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function AsistenteChat({ nombrePartner }: { nombrePartner: string }) {
  const [input,    setInput]    = useState('')
  const [open,     setOpen]     = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [cargando, setCargando] = useState(false)
  const [grabando, setGrabando] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const bottomRef      = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const modalTextRef   = useRef<HTMLTextAreaElement>(null)

  const nombreCorto = nombrePartner.split(' ')[0]

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [mensajes, open, cargando])

  // ── Detección de intent de intake ──────────────────────────────────────────
  function detectaIntake(texto: string): boolean {
    const t = texto.toLowerCase()
    const palabrasFormulario = ['formulario', 'que complete', 'que llene', 'que cargue sus datos', 'pedirle los datos', 'mandale un form', 'enviá un form', 'crear un formulario', 'intake']
    const palabrasDatos = ['dni', 'cuil', 'cuit', 'datos personales', 'datos del cliente', 'necesito que', 'pedile que']
    return (
      palabrasFormulario.some(p => t.includes(p)) ||
      (palabrasDatos.some(p => t.includes(p)) && (t.includes('whatsapp') || t.includes('wa') || t.includes('link') || t.includes('formulario') || t.includes('form')))
    )
  }

  // ── Extraer teléfono del mensaje ───────────────────────────────────────────
  function extraerTelefono(texto: string): string | null {
    const match = texto.match(/(?:\+54\s?)?(?:11|15|(?:2|3)\d{2,3})[.\s-]?\d{4}[.\s-]?\d{4}/)
    return match ? match[0].replace(/[\s.-]/g, '') : null
  }

  // ── Extraer nombre del cliente del mensaje ──────────────────────────────────
  // (heurística simple: "de Juan García", "para María López")
  function extraerNombreCliente(texto: string): string | null {
    const match = texto.match(/(?:de|para|cliente|el sr\.|la sra\.|señor|señora)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/i)
    return match ? match[1].trim() : null
  }

  // ── Generar intake form y mostrar en el chat ───────────────────────────────
  async function procesarIntake(descripcion: string) {
    // Mostrar mensaje "pensando..." del asistente
    setMensajes(prev => [...prev, {
      role: 'assistant',
      content: '📋 Generando tu formulario...',
    }])
    setCargando(true)

    const tel    = extraerTelefono(descripcion)
    const nombre = extraerNombreCliente(descripcion)

    try {
      const res = await fetch('/api/partner/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion,
          cliente_nombre:   nombre,
          cliente_whatsapp: tel,
          enviar_wa:        false, // no enviamos todavía, primero confirmamos
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMensajes(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: `No pude generar el formulario: ${data.error}` },
        ])
        return
      }

      // Armar el mensaje de confirmación
      const faltaTelefono = !tel

      const preview: IntakePreview = {
        id:              data.id,
        token:           data.token,
        titulo:          data.titulo,
        campos:          data.campos,
        clienteNombre:   nombre,
        clienteWhatsapp: tel,
        previewUrl:      data.preview_url,
        waLink:          data.wa_link,
      }

      const camposResumen = data.campos
        .slice(0, 5)
        .map((c: CampoIntake) => `• ${c.etiqueta}${c.tipo === 'archivo' ? ' (archivo)' : ''}`)
        .join('\n')

      const contenido = faltaTelefono
        ? `✅ Formulario listo: **${data.titulo}**\n\n${camposResumen}\n\n⚠️ No encontré el teléfono del cliente para enviar el WhatsApp. ¿Me podés pasar el número?`
        : `✅ Formulario listo: **${data.titulo}**\n\n${camposResumen}\n\nEl formulario ya está creado. ¿Lo envío por WhatsApp${nombre ? ` a ${nombre}` : ''}${tel ? ` al ${tel}` : ''}?`

      setMensajes(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: contenido, intake: preview },
      ])
    } catch {
      setMensajes(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Error de conexión al crear el formulario.' },
      ])
    } finally {
      setCargando(false)
    }
  }

  // ── Confirmar envío de WhatsApp para un intake ──────────────────────────────
  async function confirmarEnvioWA(intake: IntakePreview, telefonoManual?: string) {
    const tel = telefonoManual ?? intake.clienteWhatsapp
    if (!tel) return

    // Construir WA link
    const telLimpio = tel.replace(/\D/g, '')
    const nombre    = intake.clienteNombre?.split(' ')[0] ?? 'Cliente'
    const mensajeWA = `Hola ${nombre}, te comparto el formulario que necesito que completes para poder avanzar:\n\n${intake.previewUrl}\n\nSon solo unos minutos y podés hacerlo desde el celular. Gracias.`
    const waUrl     = `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensajeWA)}`

    window.open(waUrl, '_blank')

    setMensajes(prev => [...prev, {
      role:    'assistant',
      content: `📲 Te abrí WhatsApp con el mensaje listo para enviarle el link del formulario. El formulario también está disponible en:\n${intake.previewUrl}`,
    }])
  }

  // ── Detección de intent: crear cliente ────────────────────────────────────
  function detectaCrearCliente(texto: string): boolean {
    const t = texto.toLowerCase()
    // Incluye infinitivos, imperativos y variantes con tilde
    const verbos = [
      'crear', 'creá', 'crea ',       // "crea un cliente"
      'agregar', 'agregá', 'agrega ',
      'añadir', 'añade ',
      'registrar', 'registrá', 'registra ',
      'cargar', 'cargá', 'carga ',
      'dar de alta', 'ingresa ', 'ingresá',
      'nuevo cliente', 'nueva cliente',
    ]
    const sustantivos = ['cliente', 'clte', 'causante', 'mandante']
    return verbos.some(v => t.includes(v)) && sustantivos.some(s => t.includes(s))
  }

  // ── Crear cliente(s) desde el asistente — usa IA para parsear ───────────────
  async function procesarCrearCliente(descripcion: string) {
    setMensajes(prev => [...prev, { role: 'assistant', content: 'Procesando...' }])
    setCargando(true)

    try {
      // Paso 1: IA extrae nombre + lista de casos del texto libre
      const extraerRes = await fetch('/api/partner/clientes/extraer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ descripcion }),
      })
      const extraido = await extraerRes.json()

      if (!extraerRes.ok) {
        setMensajes(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: extraido.error ?? 'No pude interpretar el pedido.' },
        ])
        return
      }

      const { nombre, whatsapp, email, tipo_caso, casos } = extraido as {
        nombre:    string
        whatsapp:  string | null
        email:     string | null
        tipo_caso: string | null
        casos:     { titulo: string; tipo_caso?: string | null }[]
      }

      // Paso 2: Crear cada caso vía API
      const creados: { id: string; titulo: string }[] = []

      for (const c of casos) {
        const res = await fetch('/api/partner/clientes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            nombre,
            titulo:   c.titulo,
            tipo_caso: c.tipo_caso ?? tipo_caso,
            whatsapp,
            email,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          creados.push({ id: data.id, titulo: data.titulo })
        }
      }

      if (creados.length === 0) {
        setMensajes(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: 'No pude crear los casos. Intentá de nuevo.' },
        ])
        return
      }

      // Paso 3: Confirmar con resumen
      const resumenCasos = creados.map(c => `• ${c.titulo}`).join('\n')
      const contacto = [whatsapp && `tel: ${whatsapp}`, email && `email: ${email}`]
        .filter(Boolean).join(', ')

      const contenido = creados.length === 1
        ? `Listo. Registré a **${nombre}** con el caso:\n\n${resumenCasos}${contacto ? `\n\n${contacto}` : ''}\n\n¿Querés que genere el timeline del caso con IA?`
        : `Listo. Registré a **${nombre}** con ${creados.length} casos:\n\n${resumenCasos}${contacto ? `\n\n${contacto}` : ''}\n\n¿Querés que genere el timeline de alguno con IA?`

      setMensajes(prev => [
        ...prev.slice(0, -1),
        {
          role:    'assistant',
          content: contenido,
          acciones: creados.map(c => `ir_a_caso:${c.id}`),
        },
      ])
    } catch {
      setMensajes(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Error de conexión al registrar el cliente.' },
      ])
    } finally {
      setCargando(false)
    }
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────────────
  async function enviar(texto: string) {
    const msg = texto.trim()
    if (!msg || cargando) return

    setInput('')
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }

    setOpen(true)
    setMensajes(prev => [...prev, { role: 'user', content: msg }])

    // ── Detección de intake ─────────────────────────────────────
    if (detectaIntake(msg)) {
      await procesarIntake(msg)
      return
    }

    // ── Detección de crear cliente ──────────────────────────────
    if (detectaCrearCliente(msg)) {
      await procesarCrearCliente(msg)
      return
    }

    // ── Flujo normal del asistente ──────────────────────────────
    setCargando(true)
    try {
      const history = mensajes.slice(-8).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/partner/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:      msg,
          history,
          vencimientos: getVencimientosLS(),
        }),
      })

      const data = await res.json()
      setMensajes(prev => [
        ...prev,
        {
          role:    'assistant',
          content:  data.response ?? 'No se pudo obtener respuesta.',
          acciones: data.acciones,
        },
      ])

      const creoEvento = (data.acciones as string[] | undefined)
        ?.some((a: string) => a.startsWith('crear_evento_calendario'))
      if (creoEvento) {
        window.dispatchEvent(new Event('zonda_calendar_change'))
      }
    } catch {
      setMensajes(prev => [
        ...prev,
        { role: 'assistant', content: 'Error de conexión. Intentá de nuevo.' },
      ])
    } finally {
      setCargando(false)
    }
  }

  // ── Voz ────────────────────────────────────────────────────────────────────
  function toggleGrabacion() {
    const hasSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
    if (!hasSpeech) return

    if (grabando) {
      recognitionRef.current?.stop()
      setGrabando(false)
      return
    }

    const API = (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition })
      .webkitSpeechRecognition ?? window.SpeechRecognition

    const recognition = new API()
    recognition.lang            = 'es-AR'
    recognition.continuous      = false
    recognition.interimResults  = false

    recognition.onstart  = () => setGrabando(true)
    recognition.onend    = () => setGrabando(false)
    recognition.onerror  = () => setGrabando(false)
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const texto = event.results[0][0].transcript
      // Enviar directamente sin pasar por el input
      setTimeout(() => enviar(texto), 100)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  // ── Teclado ────────────────────────────────────────────────────────────────
  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar(input)
    }
  }

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  function autoResize(e: React.FormEvent<HTMLTextAreaElement>) {
    const t = e.currentTarget
    t.style.height = 'auto'
    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
  }

  function cerrar() {
    setOpen(false)
    setMensajes([])
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Barra de entrada ──────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="relative flex items-end gap-2 bg-background border border-border rounded-xl shadow-sm px-3 py-2.5 focus-within:border-foreground/25 transition-colors">

          {/* Ícono asistente */}
          <div className="shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center mb-0.5">
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
          </div>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onInput={autoResize}
            placeholder={`¿En qué te ayudo hoy, ${nombreCorto}? Agendá reuniones, consultá cobros, registrá honorarios...`}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />

          {/* Micrófono */}
          <button
            type="button"
            onClick={toggleGrabacion}
            title="Grabar mensaje de voz"
            className={cn(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors mb-0.5',
              grabando
                ? 'bg-destructive/10 text-destructive animate-pulse'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>

          {/* Enviar */}
          <button
            type="button"
            onClick={() => enviar(input)}
            disabled={!input.trim() || cargando}
            className={cn(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors mb-0.5',
              input.trim() && !cargando
                ? 'bg-foreground text-primary-foreground hover:bg-foreground/90'
                : 'text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-1.5 px-1">
          Asistente legal IA · Enter para enviar · Shift+Enter nueva línea
        </p>
      </div>

      {/* ── Hint contextual ───────────────────────────────────────────── */}
      {!open && (
        <div className="px-1 -mt-2">
          <p className="text-[11px] text-muted-foreground/60">
            💡 Tip: <em>"Creá un formulario para Juan García, necesito su DNI y CUIL"</em> · <em>"Registrá como cliente a María López, cel 11-1234-5678"</em>
          </p>
        </div>
      )}

      {/* ── Modal de chat ──────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">

          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={cerrar}
          />

          {/* Panel */}
          <div className="relative w-full sm:max-w-lg bg-background border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: 'min(80vh, 640px)', height: '80vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-foreground" />
                <p className="text-sm font-semibold text-foreground">Asistente Zonda Legal</p>
                {cargando && (
                  <span className="text-xs text-muted-foreground animate-pulse">pensando...</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMensajes([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                  title="Nueva conversación"
                >
                  Nueva
                </button>
                <button
                  onClick={cerrar}
                  className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {mensajes.length === 0 && !cargando && (
                <div className="text-center py-10">
                  <p className="text-3xl mb-3">⚖️</p>
                  <p className="text-sm font-medium text-foreground mb-1">Asistente legal listo</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Podés pedirme que agendé reuniones, consulte cuánto tenés por cobrar, registre honorarios, o te informe sobre el estado de tus trámites.
                  </p>
                </div>
              )}

              {mensajes.map((m, i) => (
                <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-foreground text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  )}>
                    <p className="whitespace-pre-wrap">{m.content}</p>

                    {m.role === 'assistant' && m.acciones && m.acciones.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/40 flex flex-wrap gap-1">
                        {m.acciones.map((accion, j) => {
                          if (accion.startsWith('ir_a_caso:')) {
                            const casoId = accion.split(':')[1]
                            const label  = m.acciones!.filter(a => a.startsWith('ir_a_caso:')).length > 1
                              ? `Ver caso ${j + 1} →`
                              : 'Ver caso →'
                            return (
                              <a
                                key={j}
                                href={`/partner/casos/${casoId}`}
                                className="text-[10px] font-semibold text-primary-foreground/90 bg-foreground/20 border border-foreground/20 rounded px-2 py-0.5 hover:bg-foreground/30 transition-colors"
                              >
                                {label}
                              </a>
                            )
                          }
                          return (
                            <span key={j} className="text-[10px] text-muted-foreground bg-background/60 border border-border/60 rounded px-1.5 py-0.5">
                              ✓ acción ejecutada
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Card de confirmación de intake ──────────────────── */}
                  {m.role === 'assistant' && m.intake && (
                    <IntakeConfirmCard
                      intake={m.intake}
                      onConfirmar={confirmarEnvioWA}
                    />
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {cargando && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input del modal */}
            <div className="border-t border-border p-3 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={modalTextRef}
                  rows={1}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  onInput={autoResize}
                  placeholder="Escribí tu consulta..."
                  disabled={cargando}
                  className="flex-1 resize-none bg-muted rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed disabled:opacity-50"
                  style={{ minHeight: '36px', maxHeight: '100px' }}
                />

                <button
                  type="button"
                  onClick={toggleGrabacion}
                  title="Grabar"
                  className={cn(
                    'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                    grabando
                      ? 'bg-destructive/10 text-destructive animate-pulse'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => enviar(input)}
                  disabled={!input.trim() || cargando}
                  className={cn(
                    'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                    input.trim() && !cargando
                      ? 'bg-foreground text-primary-foreground hover:bg-foreground/90'
                      : 'bg-muted text-muted-foreground/30 cursor-not-allowed'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Sub-componente: card de confirmación de intake ─────────────────────────────

function IntakeConfirmCard({
  intake,
  onConfirmar,
}: {
  intake: IntakePreview
  onConfirmar: (intake: IntakePreview, telefonoManual?: string) => void
}) {
  const [telManual, setTelManual] = useState('')
  const [copiado,   setCopiado]   = useState(false)
  const [enviado,   setEnviado]   = useState(false)
  const faltaTel = !intake.clienteWhatsapp

  const copiarLink = () => {
    navigator.clipboard.writeText(intake.previewUrl).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  const confirmar = () => {
    const tel = intake.clienteWhatsapp ?? telManual.trim()
    if (!tel) return
    setEnviado(true)
    onConfirmar(intake, tel || undefined)
  }

  return (
    <div className="mt-2 w-full max-w-[88%] bg-background border border-border rounded-xl p-3 space-y-3">
      {/* Campos del formulario */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">{intake.titulo}</p>
        {intake.campos.slice(0, 6).map(c => (
          <div key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{c.tipo === 'archivo' ? '📎' : '·'}</span>
            <span>{c.etiqueta}</span>
            {c.requerido && <span className="text-destructive text-[10px]">*</span>}
          </div>
        ))}
        {intake.campos.length > 6 && (
          <p className="text-xs text-muted-foreground">+{intake.campos.length - 6} más...</p>
        )}
      </div>

      {/* Input de teléfono si falta */}
      {faltaTel && !enviado && (
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            ¿Cuál es el WhatsApp del cliente?
          </label>
          <input
            type="tel"
            value={telManual}
            onChange={e => setTelManual(e.target.value)}
            placeholder="11 1234-5678"
            className="w-full text-xs rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>
      )}

      {/* Acciones */}
      {!enviado ? (
        <div className="flex gap-2">
          <button
            onClick={confirmar}
            disabled={faltaTel && !telManual.trim()}
            className="flex-1 py-2 bg-foreground text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            📲 Abrir WhatsApp
          </button>
          <button
            onClick={copiarLink}
            className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copiado ? '✓' : '🔗'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-600 font-medium">✓ WhatsApp listo para enviar</span>
          <button onClick={copiarLink} className="text-xs text-muted-foreground hover:text-foreground ml-auto">
            {copiado ? '✓ Copiado' : 'Copiar link'}
          </button>
        </div>
      )}
    </div>
  )
}
