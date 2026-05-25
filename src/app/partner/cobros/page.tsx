export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CobrosShell from './CobrosShell'

export default async function CobrosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, rol, nombre, logo_url, whatsapp_link')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner') redirect('/login')

  // Clientes del partner (para el selector en el formulario)
  const { data: clientes } = await supabase
    .from('perfiles')
    .select('id, nombre')
    .eq('partner_id', user.id)
    .eq('rol', 'cliente')
    .order('nombre')

  // Cobros del partner
  const { data: cobros } = await supabase
    .from('cobros')
    .select('*')
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <CobrosShell
      perfil={perfil}
      clientes={clientes ?? []}
      cobros={cobros ?? []}
    />
  )
}
