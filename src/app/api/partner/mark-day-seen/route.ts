// /api/partner/mark-day-seen
// Registra en Supabase que el partner ya vio el briefing de hoy.
// Llamado cuando el partner cierra el modal "Entendido, empezar mi día".

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { format }       from 'date-fns'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const hoy = format(new Date(), 'yyyy-MM-dd')

  // Upsert: si ya existe (por alguna razón) no falla
  const { error } = await supabase
    .from('partner_daily_sessions')
    .upsert({ user_id: user.id, seen_date: hoy }, { onConflict: 'user_id,seen_date' })

  if (error) {
    console.error('[mark-day-seen] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fecha: hoy })
}

// GET: permite que el server-side page.tsx verifique sin hacer query directa
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ yavio: false })

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const { data } = await supabase
    .from('partner_daily_sessions')
    .select('seen_at')
    .eq('user_id', user.id)
    .eq('seen_date', hoy)
    .single()

  return NextResponse.json({ yavio: !!data, seen_at: data?.seen_at ?? null })
}
