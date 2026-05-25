import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ZondaShell from './ZondaShell'

export default async function ZondaDashboardPage() {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'zonda') redirect('/login')

  // ── Datos para el back-office ─────────────────────────────

  // Todos los partners
  const { data: partners } = await supabase
    .from('perfiles')
    .select('id, nombre, email, telefono, whatsapp_link, meet_link, created_at')
    .eq('rol', 'partner')
    .order('created_at', { ascending: false })

  // Todos los trámites
  const { data: tramites } = await supabase
    .from('tramites')
    .select('id, tipo, etapa_numero, datos_cliente, datos_propuesta, documentos_adjuntos, created_at, updated_at, cliente_id, partner_id')
    .order('updated_at', { ascending: false })

  // Todos los perfiles (para lookup de nombres en trámites)
  const { data: perfiles } = await supabase
    .from('perfiles')
    .select('id, nombre, email')

  // Etapas de workflow
  const { data: etapas } = await supabase
    .from('workflow_etapas')
    .select('tipo, numero, descripcion')
    .order('numero')

  return (
    <ZondaShell
      nombreAdmin={perfil.nombre}
      partners={partners ?? []}
      tramites={tramites ?? []}
      perfiles={perfiles ?? []}
      etapas={etapas ?? []}
    />
  )
}
