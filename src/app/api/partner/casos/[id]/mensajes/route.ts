// GET  /api/partner/casos/[id]/mensajes — lista mensajes del caso
// POST /api/partner/casos/[id]/mensajes — envía un mensaje como partner

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar ownership
  const { data: caso } = await supabase
    .from('casos')
    .select('id')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { data: mensajes, error } = await supabase
    .from('caso_mensajes')
    .select('id, autor_id, autor_rol, texto, leido, created_at')
    .eq('caso_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Error cargando mensajes' }, { status: 500 })

  // Marcar como leídos los mensajes del cliente que el partner no leyó
  await supabase
    .from('caso_mensajes')
    .update({ leido: true })
    .eq('caso_id', id)
    .eq('autor_rol', 'cliente')
    .eq('leido', false)

  return NextResponse.json(mensajes ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos')
    .select('id')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { texto } = await req.json().catch(() => ({}))
  if (!texto?.trim()) return NextResponse.json({ error: 'Texto requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('caso_mensajes')
    .insert({
      caso_id:   id,
      autor_id:  user.id,
      autor_rol: 'partner',
      texto:     texto.trim(),
    })
    .select('id, autor_id, autor_rol, texto, leido, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Error enviando mensaje' }, { status: 500 })

  return NextResponse.json(data)
}
