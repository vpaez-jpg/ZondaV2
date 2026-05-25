// /api/partner/update-perfil
// Permite al partner actualizar su propio número de WhatsApp, teléfono y meet link.

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Solo estos campos son editables por el partner
  const campos: Record<string, string | null> = {}
  if (typeof body.telefono    === 'string') campos.telefono    = body.telefono.trim()    || null
  if (typeof body.whatsapp    === 'string') campos.whatsapp_link = body.whatsapp.trim()  || null
  if (typeof body.meet_link   === 'string') campos.meet_link   = body.meet_link.trim()   || null

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await supabase
    .from('perfiles')
    .update(campos)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
