// /api/partner/briefing-ia
// Genera el resumen diario humanizado usando Claude (via fetch, sin SDK).
// POST body: { vencimientos: Vencimiento[], para: 'hoy' | 'manana' }
// Devuelve: BriefingPayload

import { NextRequest, NextResponse }    from 'next/server'
import { createClient }                 from '@/lib/supabase/server'
import { getValidToken, listarEventos } from '@/lib/google-calendar'
import { addDays, format, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Tipos exportados (usados por el modal y BriefingMatutino) ─────────────────
export interface BriefingItem {
  id:        string
  tipo:      'vencimiento' | 'recordatorio' | 'evento'
  titulo:    string
  hora?:     string
  link?:     string        // Zoom / Meet link si existe
  urgencia:  'roja' | 'amarilla' | 'verde'
  diasHasta: number        // 0 = hoy, 1 = mañana, etc.
}

export interface BriefingPayload {
  resumen:    string       // Párrafo humanizado generado por Claude
  items:      BriefingItem[]
  fecha:      string       // "martes 24 de junio de 2026"
  nombreDia:  string       // "Mañana" | "Hoy"
  hayAlertas: boolean
}

// ── Helper: llamar a Claude via fetch ─────────────────────────────────────────
async function claudeHaiku(prompt: string, maxTokens = 200): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json()
  return (data.content?.[0]?.text ?? '').trim()
}

// ── POST /api/partner/briefing-ia ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, meet_link')
    .eq('id', user.id)
    .single()

  const body = await req.json().catch(() => ({}))
  const vencimientosRaw: Array<{
    id: string; titulo: string; fecha: string; fechaRecordatorio?: string; nota?: string
  }> = body.vencimientos ?? []
  const para = (body.para as string) ?? 'manana'

  const fechaBase  = para === 'hoy' ? new Date() : addDays(new Date(), 1)
  const fechaStr   = format(fechaBase, 'yyyy-MM-dd')
  const fechaLabel = format(fechaBase, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  const nombreDia  = para === 'hoy' ? 'Hoy' : 'Mañana'
  const hoyStr     = format(new Date(), 'yyyy-MM-dd')

  // ── 1. Vencimientos y recordatorios ──────────────────────────
  const items: BriefingItem[] = []

  for (const v of vencimientosRaw) {
    const diasVenc = differenceInCalendarDays(new Date(v.fecha), new Date(hoyStr))
    const diasRec  = v.fechaRecordatorio
      ? differenceInCalendarDays(new Date(v.fechaRecordatorio), new Date(hoyStr))
      : null

    if (v.fecha === fechaStr) {
      items.push({
        id:        `venc-${v.id}`,
        tipo:      'vencimiento',
        titulo:    v.titulo,
        urgencia:  diasVenc === 0 ? 'roja' : diasVenc === 1 ? 'amarilla' : 'verde',
        diasHasta: diasVenc,
      })
    }
    if (diasRec !== null && v.fechaRecordatorio === fechaStr) {
      items.push({
        id:        `rec-${v.id}`,
        tipo:      'recordatorio',
        titulo:    `Recordatorio: ${v.titulo}`,
        urgencia:  diasRec === 0 ? 'roja' : diasRec === 1 ? 'amarilla' : 'verde',
        diasHasta: diasRec,
      })
    }
  }

  // ── 2. Eventos de Google Calendar ────────────────────────────
  const token = await getValidToken(user.id)
  if (token) {
    try {
      const eventsRaw = await listarEventos(token, fechaBase, fechaBase) as Array<{
        id?: string; summary?: string;
        start?: { date?: string; dateTime?: string };
        hangoutLink?: string; description?: string; location?: string
      }>

      for (const ev of eventsRaw) {
        let hora: string | undefined
        if (ev.start?.dateTime) {
          hora = format(new Date(ev.start.dateTime), 'HH:mm')
        }

        const rawText   = [ev.hangoutLink, ev.description, ev.location].filter(Boolean).join(' ')
        const linkMatch = rawText.match(/https?:\/\/(meet\.google\.com|zoom\.us|teams\.microsoft\.com)\S+/)
        const link      = linkMatch?.[0] ?? (perfil?.meet_link ?? undefined) ?? undefined

        const diasHasta = differenceInCalendarDays(fechaBase, new Date(hoyStr))

        items.push({
          id:        `google-${ev.id ?? Math.random()}`,
          tipo:      'evento',
          titulo:    ev.summary ?? '(sin título)',
          hora,
          link:      link || undefined,
          urgencia:  diasHasta === 0 ? 'roja' : diasHasta === 1 ? 'amarilla' : 'verde',
          diasHasta,
        })
      }
    } catch {
      // Google no disponible — continuar
    }
  }

  // Ordenar: más urgentes primero, luego por hora
  items.sort((a, b) => {
    const orden = { roja: 0, amarilla: 1, verde: 2 }
    if (a.urgencia !== b.urgencia) return orden[a.urgencia] - orden[b.urgencia]
    return (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99')
  })

  // ── 3. Resumen IA con Claude ─────────────────────────────────
  const nombreCorto = (perfil?.nombre ?? 'Dr/a.').split(' ')[0]
  let resumen = ''

  try {
    const vencDesc = items.filter(i => i.tipo === 'vencimiento')
      .map(i => `• ${i.titulo} (urgencia: ${i.urgencia})`).join('\n') || 'Ninguno'
    const evDesc = items.filter(i => i.tipo === 'evento')
      .map(i => `• ${i.hora ? i.hora + ' — ' : ''}${i.titulo}`).join('\n') || 'Ninguno'
    const recDesc = items.filter(i => i.tipo === 'recordatorio')
      .map(i => `• ${i.titulo}`).join('\n') || 'Ninguno'

    resumen = await claudeHaiku(
      `Sos el asistente virtual de un estudio jurídico argentino. Escribí UN párrafo corto (máx. 2 oraciones) y profesional para el "adelanto del día" del abogado ${nombreCorto}. El párrafo debe:
- Sonar como un paralegal humano y experimentado, no como un robot
- Destacar lo más importante del día
- Terminar con una sugerencia práctica concreta
- Usar "vos" (tuteo rioplatense) y ser directo
- NO usar markdown ni bullets

Datos de ${nombreDia === 'Hoy' ? 'hoy' : 'mañana'} (${fechaLabel}):
Vencimientos procesales: ${vencDesc}
Reuniones/eventos: ${evDesc}
Recordatorios: ${recDesc}

Responde SOLO el párrafo, sin saludo ni título.`,
      200
    )
  } catch {
    // Fallback si Claude falla
  }

  // Fallback template
  if (!resumen) {
    const totalVenc = items.filter(i => i.tipo === 'vencimiento').length
    const totalEv   = items.filter(i => i.tipo === 'evento').length
    if (totalVenc === 0 && totalEv === 0) {
      resumen = `${nombreDia} la agenda está despejada. Buen momento para avanzar con redacciones pendientes.`
    } else if (totalVenc > 0) {
      resumen = `${nombreDia} tenés ${totalVenc} vencimiento${totalVenc !== 1 ? 's' : ''} procesal${totalVenc !== 1 ? 'es' : ''}.${totalEv > 0 ? ` También ${totalEv} reunión${totalEv !== 1 ? 'es' : ''}.` : ''} Revisá los expedientes con anticipación.`
    } else {
      resumen = `${nombreDia} la agenda está centrada en reuniones. Revisá los materiales previo a cada una.`
    }
  }

  const payload: BriefingPayload = {
    resumen,
    items,
    fecha:      fechaLabel,
    nombreDia,
    hayAlertas: items.some(i => i.urgencia === 'roja' || i.urgencia === 'amarilla'),
  }

  return NextResponse.json(payload)
}

// GET no usado — redirigir a POST
export async function GET() {
  return NextResponse.json({ error: 'Usar POST con body { vencimientos, para }' }, { status: 405 })
}
