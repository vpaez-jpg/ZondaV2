// GET /api/partner/casos/[id]/invitar
// Devuelve el token de invitación, la URL y un mensaje WhatsApp listo para enviar

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: caso, error } = await supabase
    .from('casos')
    .select('id, titulo, tipo_caso, cliente_nombre, cliente_whatsapp, invitation_token, cliente_id')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (error || !caso)
    return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  // Datos del partner
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre')
    .eq('id', user.id)
    .single()

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zondalegal.com'
  const url        = `${appUrl}/invitacion/${caso.invitation_token}`
  const nombrePartner = perfil?.nombre ?? 'Tu abogado/a'
  const nombreCliente = caso.cliente_nombre.split(' ')[0] // primer nombre

  const mensaje = `Hola ${nombreCliente}, soy ${nombrePartner}.

Te comparto el acceso a tu portal donde vas a poder seguir el avance de tu caso "${caso.titulo}" en tiempo real.

${url}

Desde ahí vas a ver todas las etapas del proceso y el estado actual, sin necesidad de llamarme para saber cómo va todo.

Cualquier duda, estoy a disposición.`

  return NextResponse.json({
    token:      caso.invitation_token,
    url,
    mensaje_wa: mensaje,
    wa_link:    caso.cliente_whatsapp
      ? `https://wa.me/${caso.cliente_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`,
    ya_registrado: !!caso.cliente_id,
  })
}
