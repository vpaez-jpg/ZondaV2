'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Cliente con privilegios de admin (usa service role key, solo server-side)
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Crear un nuevo abogado partner ───────────────────────────
export async function crearPartner(data: {
  nombre: string
  email: string
  password: string
  telefono: string
  whatsapp: string
  meet_link: string
}) {
  const admin = getAdminClient()

  // 1. Crear usuario en Supabase Auth
  // El trigger handle_new_user crea automáticamente el perfil en public.perfiles
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,            // Confirmar email automáticamente (no envía link)
    user_metadata: {
      rol: 'partner',
      nombre: data.nombre,
    },
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { error: 'Ya existe un usuario con ese email.' }
    }
    return { error: authError.message }
  }

  const userId = authData.user.id

  // 2. Actualizar perfil con datos de contacto
  // El trigger ya creó el registro base, acá agregamos los campos adicionales
  const whatsappLink = data.whatsapp
    ? `https://wa.me/${data.whatsapp.replace(/\D/g, '')}`
    : null

  const { error: perfilError } = await admin
    .from('perfiles')
    .update({
      telefono:     data.telefono || null,
      whatsapp_link: whatsappLink,
      meet_link:    data.meet_link || null,
    })
    .eq('id', userId)

  if (perfilError) {
    return { error: 'Partner creado pero hubo un error guardando datos de contacto.' }
  }

  revalidatePath('/zonda/dashboard')
  return { success: true, partnerId: userId }
}
