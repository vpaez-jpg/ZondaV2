export const dynamic = 'force-dynamic'

// Página raíz: detecta el rol del usuario y redirige al portal correcto.
// El middleware ya maneja la mayoría de las redirecciones,
// pero este archivo cubre el caso de la ruta exacta "/".

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Rol } from '@/types'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, primer_login')
    .eq('id', user.id)
    .single()

  if (!perfil) redirect('/login')
  if (perfil.primer_login) redirect('/primer-login')

  const destinos: Record<Rol, string> = {
    zonda:   '/zonda/dashboard',
    partner: '/partner/dashboard',
    cliente: '/cliente/dashboard',
  }

  redirect(destinos[perfil.rol as Rol] ?? '/login')
}
