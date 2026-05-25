// api/google/events/route.ts
// GET  → lista eventos de Google Calendar en un rango de fechas
// POST → crea un evento en Google Calendar y registra el mapping en vencimientos_google
// DELETE → elimina un evento de Google Calendar y el mapping

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getValidToken,
  crearEvento,
  eliminarEvento,
  listarEventos,
} from '@/lib/google-calendar'

// ── GET /api/google/events?desde=YYYY-MM-DD&hasta=YYYY-MM-DD ─────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desdeStr = searchParams.get('desde')
  const hastaStr = searchParams.get('hasta')

  if (!desdeStr || !hastaStr) {
    return NextResponse.json({ error: 'Parámetros desde/hasta requeridos' }, { status: 400 })
  }

  const accessToken = await getValidToken(user.id)
  if (!accessToken) {
    return NextResponse.json({ connected: false, events: [] })
  }

  const eventos = await listarEventos(
    accessToken,
    new Date(desdeStr + 'T00:00:00'),
    new Date(hastaStr + 'T23:59:59')
  )

  return NextResponse.json({ connected: true, events: eventos })
}

// ── POST /api/google/events ───────────────────────────────────────────────────
// Body: { vencimientoId: string, evento: GoogleCalendarEvent }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { vencimientoId, evento } = body

  if (!evento) return NextResponse.json({ error: 'Evento requerido' }, { status: 400 })

  const accessToken = await getValidToken(user.id)
  if (!accessToken) {
    return NextResponse.json({ connected: false, error: 'Google Calendar no conectado' }, { status: 200 })
  }

  const result = await crearEvento(accessToken, evento)
  if (!result) {
    return NextResponse.json({ error: 'Error al crear evento en Google Calendar' }, { status: 500 })
  }

  // Si se mandó vencimientoId, guardar el mapping para no duplicar
  if (vencimientoId) {
    await supabase.from('vencimientos_google').upsert(
      { user_id: user.id, vencimiento_id: vencimientoId, google_event_id: result.id },
      { onConflict: 'user_id,vencimiento_id' }
    )
  }

  return NextResponse.json({ success: true, eventId: result.id })
}

// ── DELETE /api/google/events ─────────────────────────────────────────────────
// Body: { vencimientoId?: string, googleEventId?: string }
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { vencimientoId, googleEventId } = body

  let eventIdToDelete = googleEventId

  // Si se mandó vencimientoId, buscar el googleEventId correspondiente
  if (vencimientoId && !eventIdToDelete) {
    const { data: mapping } = await supabase
      .from('vencimientos_google')
      .select('google_event_id')
      .eq('user_id', user.id)
      .eq('vencimiento_id', vencimientoId)
      .single()
    eventIdToDelete = mapping?.google_event_id
  }

  if (!eventIdToDelete) {
    return NextResponse.json({ success: true, skipped: 'No hay evento Google asociado' })
  }

  const accessToken = await getValidToken(user.id)
  if (!accessToken) {
    return NextResponse.json({ connected: false })
  }

  await eliminarEvento(accessToken, eventIdToDelete)

  // Limpiar el mapping
  if (vencimientoId) {
    await supabase
      .from('vencimientos_google')
      .delete()
      .eq('user_id', user.id)
      .eq('vencimiento_id', vencimientoId)
  }

  return NextResponse.json({ success: true })
}
