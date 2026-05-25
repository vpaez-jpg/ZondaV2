import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import CasosShell       from './CasosShell'

export default async function CasosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner') redirect('/login')

  const { data: casos } = await supabase
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
      caso_etapas (numero, completada)
    `)
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <CasosShell
      casosIniciales={casos ?? []}
      nombrePartner={perfil.nombre}
    />
  )
}
