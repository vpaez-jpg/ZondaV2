import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import CasoDetalleShell from './CasoDetalleShell'

export default async function CasoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner') redirect('/login')

  const { data: caso, error } = await supabase
    .from('casos')
    .select(`
      id,
      titulo,
      tipo_caso,
      cliente_nombre,
      cliente_email,
      cliente_whatsapp,
      cliente_id,
      estado,
      etapa_actual,
      invitation_token,
      created_at,
      caso_etapas ( numero, titulo, descripcion_juridica, descripcion_cliente, completada ),
      caso_notas  ( id, texto_juridico, texto_cliente, created_at ),
      caso_documentos ( id, nombre, descripcion, url, tipo_mime, tamanio, rol_subidor, created_at )
    `)
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (error || !caso) redirect('/partner/casos')

  // Mensajes del caso
  const { data: mensajes } = await supabase
    .from('caso_mensajes')
    .select('id, autor_id, autor_rol, texto, leido, created_at')
    .eq('caso_id', id)
    .order('created_at', { ascending: true })

  // Intake forms asociados al caso
  const { data: intakeForms } = await supabase
    .from('intake_forms')
    .select('id, titulo, estado, cliente_nombre, created_at, completado_at')
    .eq('caso_id', id)
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <CasoDetalleShell
      caso={caso}
      mensajes={mensajes ?? []}
      intakeForms={intakeForms ?? []}
      partnerId={user.id}
      nombrePartner={perfil.nombre}
    />
  )
}
