// /api/partner/assistant
// Asistente legal IA con tool use (Claude Haiku).
// Capacidades: crear/listar eventos Google Calendar, listar/registrar cobros,
//              listar trámites y clientes de la plataforma.

import { NextRequest, NextResponse }                from 'next/server'
import { createClient }                             from '@/lib/supabase/server'
import { getValidToken, crearEvento, listarEventos } from '@/lib/google-calendar'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { es }                                       from 'date-fns/locale'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ETAPA_MAX: Record<string, number> = { MARCAS: 7, DNDA: 4, SAS: 6 }

// ── Definición de herramientas ────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'crear_evento_calendario',
    description: 'Crea un evento en el Google Calendar del partner. Usá cuando pida agendar una reunión, cita, llamada o cualquier evento en una fecha y hora específica.',
    input_schema: {
      type: 'object',
      properties: {
        titulo:      { type: 'string', description: 'Título del evento' },
        fecha:       { type: 'string', description: 'Fecha del evento en formato YYYY-MM-DD' },
        hora_inicio: { type: 'string', description: 'Hora de inicio en formato HH:MM (opcional; si falta se crea como evento de día completo)' },
        hora_fin:    { type: 'string', description: 'Hora de fin en formato HH:MM (opcional; si falta se asume +1 hora)' },
        descripcion: { type: 'string', description: 'Descripción o notas adicionales del evento (opcional)' },
      },
      required: ['titulo', 'fecha'],
    },
  },
  {
    name: 'listar_eventos_calendario',
    description: 'Lista eventos del Google Calendar del partner en un rango de fechas.',
    input_schema: {
      type: 'object',
      properties: {
        fecha_inicio: { type: 'string', description: 'Fecha de inicio en formato YYYY-MM-DD' },
        fecha_fin:    { type: 'string', description: 'Fecha de fin en formato YYYY-MM-DD' },
      },
      required: ['fecha_inicio', 'fecha_fin'],
    },
  },
  {
    name: 'listar_cobros',
    description: 'Lista cobros/honorarios del partner. Usá para responder preguntas sobre dinero por cobrar, cobros pendientes o de un período específico.',
    input_schema: {
      type: 'object',
      properties: {
        estado:  { type: 'string', enum: ['pendiente', 'parcial', 'cobrado', 'todos'], description: 'Filtrar por estado (omitir para mostrar pendientes y parciales)' },
        periodo: { type: 'string', enum: ['hoy', 'semana', 'mes', 'todo'],             description: 'Filtrar por fecha de vencimiento (omitir para todos)' },
      },
    },
  },
  {
    name: 'registrar_cobro',
    description: 'Registra un nuevo cobro u honorario para un cliente. Usá cuando el partner quiera cargar un cobro, honorario, cuota o pago.',
    input_schema: {
      type: 'object',
      properties: {
        cliente_nombre:    { type: 'string',  description: 'Nombre del cliente (se busca por coincidencia)' },
        monto:             { type: 'number',  description: 'Monto en pesos argentinos (ARS)' },
        concepto:          { type: 'string',  description: 'Descripción del concepto del cobro' },
        tipo:              { type: 'string',  enum: ['directo', 'litigio'], description: 'Tipo de cobro (default: directo)' },
        fecha_vencimiento: { type: 'string',  description: 'Fecha de vencimiento en formato YYYY-MM-DD (opcional)' },
      },
      required: ['monto', 'concepto'],
    },
  },
  {
    name: 'listar_tramites_clientes',
    description: 'Lista todos los trámites y clientes del partner con su estado actual.',
    input_schema: { type: 'object', properties: {} },
  },
]

// ── Tipos internos ────────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface ClienteCtx { id: string; nombre: string }
interface TramiteCtx { tipo: string; etapa_numero: number; cliente_id: string | null }

// ── Ejecución de herramientas ─────────────────────────────────────────────────

async function ejecutarHerramienta(
  nombre: string,
  input: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient,
  clientes: ClienteCtx[],
  tramites: TramiteCtx[],
): Promise<string> {
  try {
    // ── 1. Crear evento Google Calendar ──────────────────────────
    if (nombre === 'crear_evento_calendario') {
      const token = await getValidToken(userId)
      if (!token) return 'Google Calendar no está conectado. El partner debe conectarlo desde el dashboard.'

      const { titulo, fecha, hora_inicio, hora_fin, descripcion } = input as {
        titulo: string; fecha: string; hora_inicio?: string; hora_fin?: string; descripcion?: string
      }

      let start: { date?: string; dateTime?: string; timeZone?: string }
      let end:   { date?: string; dateTime?: string; timeZone?: string }

      if (hora_inicio) {
        const tz = 'America/Argentina/Buenos_Aires'
        start = { dateTime: `${fecha}T${hora_inicio}:00`, timeZone: tz }

        let endTime = hora_fin
        if (!endTime) {
          const [hh, mm] = hora_inicio.split(':').map(Number)
          const d = new Date(2000, 0, 1, hh + 1, mm)
          endTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        }
        end = { dateTime: `${fecha}T${endTime}:00`, timeZone: tz }
      } else {
        start = { date: fecha }
        end   = { date: fecha }
      }

      const resultado = await crearEvento(token, {
        summary:     titulo,
        description: descripcion,
        start,
        end,
      })

      if (!resultado) return 'No se pudo crear el evento. Verificá la conexión con Google Calendar.'
      return `✓ Evento creado: "${titulo}" el ${fecha}${hora_inicio ? ` a las ${hora_inicio}` : ' (día completo)'}.`
    }

    // ── 2. Listar eventos Google Calendar ────────────────────────
    if (nombre === 'listar_eventos_calendario') {
      const token = await getValidToken(userId)
      if (!token) return 'Google Calendar no está conectado.'

      const { fecha_inicio, fecha_fin } = input as { fecha_inicio: string; fecha_fin: string }
      const desde = new Date(`${fecha_inicio}T00:00:00`)
      const hasta = new Date(`${fecha_fin}T23:59:59`)

      const eventos = await listarEventos(token, desde, hasta) as Array<{
        summary?: string
        start?: { date?: string; dateTime?: string }
      }>

      if (eventos.length === 0) return `No hay eventos en el calendario entre ${fecha_inicio} y ${fecha_fin}.`

      return eventos.map(e => {
        const cuando = e.start?.dateTime
          ? format(new Date(e.start.dateTime), "EEEE d/MM 'a las' HH:mm", { locale: es })
          : e.start?.date ?? ''
        return `• ${e.summary ?? '(sin título)'} — ${cuando}`
      }).join('\n')
    }

    // ── 3. Listar cobros ──────────────────────────────────────────
    if (nombre === 'listar_cobros') {
      const { estado, periodo } = input as { estado?: string; periodo?: string }

      let query = supabase
        .from('cobros')
        .select('concepto, monto_total, monto_cobrado, estado, fecha_vencimiento, cliente_nombre, tipo')
        .eq('partner_id', userId)
        .neq('estado', 'cancelado')

      if (estado && estado !== 'todos') {
        query = query.eq('estado', estado)
      } else if (!estado) {
        query = query.in('estado', ['pendiente', 'parcial'])
      }

      const hoy = new Date()
      if (periodo === 'hoy') {
        const s = format(hoy, 'yyyy-MM-dd')
        query = query.eq('fecha_vencimiento', s)
      } else if (periodo === 'semana') {
        query = query
          .gte('fecha_vencimiento', format(startOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
          .lte('fecha_vencimiento', format(endOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
      } else if (periodo === 'mes') {
        query = query
          .gte('fecha_vencimiento', format(startOfMonth(hoy), 'yyyy-MM-dd'))
          .lte('fecha_vencimiento', format(endOfMonth(hoy), 'yyyy-MM-dd'))
      }

      const { data, error } = await query.order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      if (error) return 'Error al consultar los cobros.'
      if (!data || data.length === 0) return 'No hay cobros que coincidan con los filtros especificados.'

      const ars = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
      const totalPendiente = data.reduce((s, c) => s + (Number(c.monto_total) - Number(c.monto_cobrado)), 0)

      const lista = data.map(c => {
        const pendiente = Number(c.monto_total) - Number(c.monto_cobrado)
        return `• ${c.cliente_nombre ?? 'Sin cliente'} — ${ars(pendiente)} de ${ars(c.monto_total)} — "${c.concepto}"${c.fecha_vencimiento ? ` (vence: ${c.fecha_vencimiento})` : ''} [${c.estado}]`
      }).join('\n')

      return `${data.length} cobro${data.length !== 1 ? 's' : ''} encontrado${data.length !== 1 ? 's' : ''}. Total pendiente: ${ars(totalPendiente)}\n\n${lista}`
    }

    // ── 4. Registrar cobro ────────────────────────────────────────
    if (nombre === 'registrar_cobro') {
      const { cliente_nombre, monto, concepto, tipo = 'directo', fecha_vencimiento } = input as {
        cliente_nombre?: string; monto: number; concepto: string; tipo?: string; fecha_vencimiento?: string
      }

      let clienteId: string | null = null
      let clienteNombreFinal = cliente_nombre ?? null

      if (cliente_nombre) {
        const match = clientes.find(c =>
          c.nombre.toLowerCase().includes(cliente_nombre.toLowerCase()) ||
          cliente_nombre.toLowerCase().includes(c.nombre.toLowerCase())
        )
        if (match) { clienteId = match.id; clienteNombreFinal = match.nombre }
      }

      const { error } = await supabase.from('cobros').insert({
        partner_id:       userId,
        tipo,
        concepto,
        monto_total:      monto,
        cliente_id:       clienteId,
        cliente_nombre:   clienteNombreFinal,
        forma_pago:       'unico',
        estado:           'pendiente',
        fecha_vencimiento: fecha_vencimiento ?? null,
        moneda:           'ARS',
      })

      if (error) return `Error al registrar el cobro: ${error.message}`

      const ars = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
      return `✓ Cobro registrado: ${ars(monto)} — "${concepto}"${clienteNombreFinal ? ` para ${clienteNombreFinal}` : ''}${fecha_vencimiento ? ` (vence: ${fecha_vencimiento})` : ''}.`
    }

    // ── 5. Listar trámites / clientes ────────────────────────────
    if (nombre === 'listar_tramites_clientes') {
      if (!tramites || tramites.length === 0) return 'No hay trámites registrados en la plataforma.'

      const TIPO_LABEL: Record<string, string> = {
        MARCAS: 'Registro de Marca',
        DNDA:   'Derechos de Autor (DNDA)',
        SAS:    'Constitución SAS',
      }

      const lineas = tramites.map(t => {
        const max     = ETAPA_MAX[t.tipo] ?? 1
        const cliente = clientes.find(c => c.id === t.cliente_id)
        const nombre  = cliente?.nombre ?? 'Cliente sin nombre'
        const estado  = t.etapa_numero >= max ? 'Finalizado' : `Etapa ${t.etapa_numero}/${max}`
        return `• ${nombre} — ${TIPO_LABEL[t.tipo] ?? t.tipo} [${estado}]`
      })

      const activos     = tramites.filter(t => t.etapa_numero < (ETAPA_MAX[t.tipo] ?? 1)).length
      const finalizados = tramites.length - activos

      return `${tramites.length} trámite${tramites.length !== 1 ? 's' : ''} total (${activos} activos, ${finalizados} finalizados):\n\n${lineas.join('\n')}`
    }

    return 'Herramienta no reconocida.'
  } catch (err) {
    console.error(`[Assistant] Error en herramienta ${nombre}:`, err)
    return `Error ejecutando la herramienta: ${String(err)}`
  }
}

// ── POST /api/partner/assistant ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    message    = '',
    history    = [],
    vencimientos = [],
  } = body as {
    message:      string
    history:      Array<{ role: 'user' | 'assistant'; content: string }>
    vencimientos: Array<{ titulo: string; fecha: string; fechaRecordatorio?: string }>
  }

  if (!message.trim()) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })

  // ── Cargar contexto del partner ──────────────────────────────
  const [perfilRes, clientesRes, tramitesRes] = await Promise.all([
    supabase.from('perfiles').select('nombre').eq('id', user.id).single(),
    supabase.from('clientes').select('id, nombre').eq('partner_id', user.id),
    supabase.from('tramites').select('tipo, etapa_numero, cliente_id').eq('partner_id', user.id),
  ])

  const clientes: ClienteCtx[] = clientesRes.data ?? []
  const tramites: TramiteCtx[] = tramitesRes.data ?? []
  const nombrePartner = (perfilRes.data?.nombre ?? 'Dr/a.').split(' ')[0]

  const hoy       = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  const horaActual = format(new Date(), 'HH:mm')

  const clientesStr = clientes.length > 0
    ? clientes.map(c => `• ${c.nombre}`).join('\n')
    : 'Sin clientes registrados'

  const vencStr = vencimientos.length > 0
    ? vencimientos.slice(0, 15).map(v =>
        `• ${v.titulo} — vence: ${v.fecha}${v.fechaRecordatorio ? `, recordatorio: ${v.fechaRecordatorio}` : ''}`
      ).join('\n')
    : 'Sin vencimientos cargados en la plataforma'

  const activos     = tramites.filter(t => t.etapa_numero < (ETAPA_MAX[t.tipo] ?? 1)).length
  const finalizados = tramites.length - activos

  // ── System prompt ────────────────────────────────────────────
  const systemPrompt = `Sos el asistente virtual de ${nombrePartner}, abogado/a del estudio jurídico Zonda Legal. Tu rol es ayudarlo/a con la gestión diaria de su práctica jurídica.

FECHA Y HORA ACTUAL: ${hoy}, ${horaActual} hs (Argentina, UTC-3)

CONTEXTO DE LA PLATAFORMA:
Clientes (${clientes.length}):
${clientesStr}

Trámites: ${activos} activos, ${finalizados} finalizados.

Vencimientos procesales:
${vencStr}

CAPACIDADES (usá las herramientas para esto):
- Crear y consultar eventos en Google Calendar del partner
- Consultar cobros/honorarios pendientes por período
- Registrar nuevos cobros y honorarios
- Informar sobre el estado de trámites y clientes

INSTRUCCIONES:
- Respondé SIEMPRE en español rioplatense (Argentina) usando "vos"
- Sé conciso y directo — máximo 3-4 oraciones salvo que necesités listar items
- Cuando ejecutés una acción, confirmala brevemente al final de tu respuesta
- Para fechas relativas ("mañana", "el jueves", "la semana que viene"), calculá desde la fecha actual
- Si te piden algo fuera de tus capacidades o que no está en el contexto, decilo claramente
- No inventes datos ni montos que no tenés — consultá la herramienta correspondiente
- Si el partner da información incompleta para una acción, pedí solo lo estrictamente necesario`

  // ── Construir mensajes ───────────────────────────────────────
  type ClaudeMessage = {
    role: 'user' | 'assistant'
    content: string | Array<Record<string, unknown>>
  }

  const messages: ClaudeMessage[] = [
    ...history.slice(-8).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: message },
  ]

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  // ── Loop de tool use ─────────────────────────────────────────
  const acciones: string[] = []
  const MAX_ITER = 6

  for (let i = 0; i < MAX_ITER; i++) {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      TOOLS,
        messages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Assistant] Error Anthropic API:', err)
      return NextResponse.json({ error: 'Error al conectar con el asistente.' }, { status: 500 })
    }

    const data = await res.json()

    // Respuesta final de texto
    if (data.stop_reason === 'end_turn') {
      const texto = (data.content as Array<{ type: string; text?: string }>)
        ?.find(b => b.type === 'text')?.text ?? ''
      return NextResponse.json({ response: texto, acciones })
    }

    // Tool use
    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content })

      const toolResults: Array<Record<string, unknown>> = []

      for (const block of data.content as Array<{ type: string; name?: string; id?: string; input?: Record<string, unknown> }>) {
        if (block.type !== 'tool_use' || !block.name || !block.id) continue

        const resultado = await ejecutarHerramienta(
          block.name,
          block.input ?? {},
          user.id,
          supabase,
          clientes,
          tramites,
        )

        acciones.push(`${block.name}: ${resultado.slice(0, 100)}`)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultado })
      }

      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // stop_reason inesperado — salir del loop
    break
  }

  return NextResponse.json({ response: 'No pude completar la solicitud. Intentá de nuevo.', acciones })
}
