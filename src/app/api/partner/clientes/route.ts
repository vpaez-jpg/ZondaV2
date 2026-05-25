// GET  /api/partner/clientes — lista liviana de clientes (para búsqueda en modales)
// POST /api/partner/clientes — crea un nuevo caso/cliente a partir de datos provistos
//
// POST body: { nombre, whatsapp?, email?, tipo_caso?, desde_intake_id? }
// → { id, titulo, cliente_nombre, created_at }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

// GET — devuelve id, cliente_nombre, cliente_whatsapp de todos los casos del partner
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('casos')
    .select('id, cliente_nombre, cliente_whatsapp')
    .eq('partner_id', user.id)
    .order('cliente_nombre', { ascending: true })

  if (error) return NextResponse.json({ error: 'Error cargando clientes' }, { status: 500 })

  return NextResponse.json(data ?? [])
}

// POST — crea un caso con los datos del cliente
// body: { nombre, titulo?, whatsapp?, email?, tipo_caso?, desde_intake_id? }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { nombre, titulo, whatsapp, email, tipo_caso, desde_intake_id } = body as {
    nombre:           string
    titulo?:          string | null
    whatsapp?:        string | null
    email?:           string | null
    tipo_caso?:       string | null
    desde_intake_id?: string | null
  }

  if (!nombre?.trim())
    return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const { data: caso, error } = await supabase
    .from('casos')
    .insert({
      partner_id:       user.id,
      titulo:           titulo?.trim() || `Caso de ${nombre.trim()}`,
      cliente_nombre:   nombre.trim(),
      cliente_whatsapp: whatsapp?.trim()  || null,
      cliente_email:    email?.trim()     || null,
      tipo_caso:        tipo_caso?.trim() || null,
      estado:           'activo',
      etapa_actual:     0,
    })
    .select('id, titulo, cliente_nombre, created_at')
    .single()

  if (error) {
    console.error('crear cliente:', error)
    return NextResponse.json({ error: 'Error creando el caso' }, { status: 500 })
  }

  // Vincular el intake form al caso recién creado (si corresponde)
  if (desde_intake_id) {
    await supabase
      .from('intake_forms')
      .update({ caso_id: caso.id })
      .eq('id', desde_intake_id)
      .eq('partner_id', user.id)
  }

  return NextResponse.json(caso, { status: 201 })
}
