// POST /api/partner/casos/crear
// Crea un caso libre (no-Zonda) para el partner autenticado
// body: { clienteNombre, clienteEmail?, clienteWhatsapp?, titulo, tipoCaso? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    clienteNombre,
    clienteEmail    = null,
    clienteWhatsapp = null,
    titulo,
    tipoCaso        = 'General',
  } = body as {
    clienteNombre:    string
    clienteEmail?:    string | null
    clienteWhatsapp?: string | null
    titulo:           string
    tipoCaso?:        string
  }

  if (!clienteNombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!titulo?.trim())        return NextResponse.json({ error: 'Título requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('casos')
    .insert({
      partner_id:       user.id,
      cliente_nombre:   clienteNombre.trim(),
      cliente_email:    clienteEmail   || null,
      cliente_whatsapp: clienteWhatsapp || null,
      titulo:           titulo.trim(),
      tipo_caso:        tipoCaso.trim() || 'General',
    })
    .select('id, invitation_token')
    .single()

  if (error) {
    console.error('crear caso:', error)
    return NextResponse.json({ error: 'Error creando caso' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, invitation_token: data.invitation_token })
}
