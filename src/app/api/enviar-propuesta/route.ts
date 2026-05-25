import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarPropuestaEmail, type DatosPropuesta } from '@/lib/propuesta'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { tramiteId, clienteEmail, clienteNombre, clientePassword } = body

  if (!tramiteId || !clienteEmail || !clienteNombre || !clientePassword) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: tramite } = await supabase
    .from('tramites')
    .select('id, datos_propuesta, partner_id')
    .eq('id', tramiteId)
    .single()

  if (!tramite) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const datos = tramite.datos_propuesta as DatosPropuesta | null
  if (!datos) return NextResponse.json({ error: 'No hay datos de propuesta' }, { status: 400 })

  const { data: partner } = tramite.partner_id
    ? await supabase.from('perfiles').select('nombre').eq('id', tramite.partner_id).single()
    : { data: null }

  const result = await enviarPropuestaEmail({
    datos,
    clienteNombre,
    clienteEmail,
    clientePassword,
    partnerNombre: partner?.nombre ?? 'Estudio Jurídico',
    tramiteId,
  })

  return NextResponse.json({ success: result.enviado, emailEnviado: result.enviado, error: result.error })
}
