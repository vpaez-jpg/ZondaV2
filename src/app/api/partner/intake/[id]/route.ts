// GET /api/partner/intake/[id]
// Devuelve el formulario completo (campos + respuestas + archivos)
// Solo accesible por el partner dueño del formulario

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

  const { data: form, error } = await supabase
    .from('intake_forms')
    .select(`
      id, token, titulo, descripcion, estado, campos,
      cliente_nombre, cliente_whatsapp, cliente_email,
      caso_id, created_at, completado_at,
      intake_respuestas (
        id, respuestas, archivos, created_at
      )
    `)
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (error || !form)
    return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zondalegal.com'

  return NextResponse.json({
    ...form,
    preview_url: `${appUrl}/formulario/${form.token}`,
  })
}
