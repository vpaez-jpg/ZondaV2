// PATCH /api/partner/cobros/[id]
// Marca un cobro como 'cobrado' o lo revierte a 'pendiente'
// body: { estado: 'cobrado' | 'pendiente' }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { estado } = body as { estado: 'cobrado' | 'pendiente' }

  if (!['cobrado', 'pendiente'].includes(estado))
    return NextResponse.json({ error: 'estado inválido' }, { status: 400 })

  const { error } = await supabase
    .from('cobros_solicitados')
    .update({ estado })
    .eq('id', id)
    .eq('partner_id', user.id)  // seguridad: solo puede editar sus propios cobros

  if (error) return NextResponse.json({ error: 'Error actualizando cobro' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
