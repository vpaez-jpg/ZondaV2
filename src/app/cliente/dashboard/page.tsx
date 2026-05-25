export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClienteShell from './ClienteShell'

export default async function ClienteDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, rol, nombre, partner_id')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'cliente') redirect('/login')

  // Datos del partner (para la marca blanca)
  const { data: partner } = perfil.partner_id
    ? await supabase
        .from('perfiles')
        .select('nombre, logo_url, whatsapp_link, meet_link, email, telefono')
        .eq('id', perfil.partner_id)
        .single()
    : { data: null }

  // Trámites del cliente
  const { data: tramites } = await supabase
    .from('tramites')
    .select('id, tipo, etapa_numero, datos_cliente, datos_propuesta, documentos_adjuntos, created_at, updated_at')
    .eq('cliente_id', user.id)
    .order('created_at', { ascending: false })

  // Workflow etapas
  const { data: etapas } = await supabase
    .from('workflow_etapas')
    .select('tipo, numero, descripcion')
    .order('numero')

  // Caso libre (si el cliente tiene uno vinculado)
  const { data: caso } = await supabase
    .from('casos')
    .select(`
      id,
      titulo,
      tipo_caso,
      etapa_actual,
      estado,
      caso_etapas   (numero, titulo, descripcion_cliente, completada),
      caso_notas    (id, texto_cliente, created_at),
      caso_documentos (id, nombre, descripcion, url, tipo_mime, tamanio, rol_subidor, created_at)
    `)
    .eq('cliente_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Mensajes del caso (si existe)
  const { data: mensajes } = caso
    ? await supabase
        .from('caso_mensajes')
        .select('id, autor_id, autor_rol, texto, leido, created_at')
        .eq('caso_id', caso.id)
        .order('created_at', { ascending: true })
    : { data: [] }

  return (
    <ClienteShell
      perfil={{ id: perfil.id, nombre: perfil.nombre }}
      partner={partner ?? null}
      tramites={tramites ?? []}
      etapas={etapas ?? []}
      caso={caso ?? null}
      mensajesIniciales={mensajes ?? []}
    />
  )
}
