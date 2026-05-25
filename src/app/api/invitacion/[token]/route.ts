// GET /api/invitacion/[token]
// Devuelve info pública de un caso por token de invitación (sin auth requerida)
// Usa service_role para bypassear RLS

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !serviceKey)
    return NextResponse.json({ error: 'Configuración faltante' }, { status: 500 })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: caso, error } = await supabase
    .from('casos')
    .select(`
      id,
      titulo,
      tipo_caso,
      cliente_nombre,
      cliente_id,
      partner_id,
      caso_etapas (numero, titulo, completada)
    `)
    .eq('invitation_token', token)
    .single()

  if (error || !caso)
    return NextResponse.json({ error: 'Invitación no válida' }, { status: 404 })

  // Nombre del partner (sin exponer datos sensibles)
  const { data: partner } = await supabase
    .from('perfiles')
    .select('nombre')
    .eq('id', caso.partner_id)
    .single()

  return NextResponse.json({
    casoId:         caso.id,
    titulo:         caso.titulo,
    tipoCaso:       caso.tipo_caso,
    clienteNombre:  caso.cliente_nombre,
    yaRegistrado:   !!caso.cliente_id,
    partnerNombre:  partner?.nombre ?? 'Tu abogado/a',
    totalEtapas:    (caso.caso_etapas as { numero: number }[])?.length ?? 0,
  })
}

// POST /api/invitacion/[token] — vincula la cuenta del cliente recién registrado
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase    = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { userId } = await req.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const { error } = await supabase
    .from('casos')
    .update({ cliente_id: userId })
    .eq('invitation_token', token)
    .is('cliente_id', null)   // solo si todavía no está vinculado

  if (error) return NextResponse.json({ error: 'Error vinculando' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
