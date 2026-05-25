'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { enviarPropuestaEmail, type DatosPropuesta } from '@/lib/propuesta'
import { enviarPropuestaDNDAEmail, type DatosPropuestaDNDA } from '@/lib/propuesta-dnda'
import { enviarPropuestaSASEmail, type DatosPropuestaSAS } from '@/lib/propuesta-sas'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function crearCliente(data: {
  nombre: string
  email: string
  password: string
  tipo: 'MARCAS' | 'DNDA' | 'SAS'
  partnerId: string
  datosPropuesta?: DatosPropuesta
  datosPropuestaDNDA?: DatosPropuestaDNDA
  datosPropuestaSAS?: DatosPropuestaSAS
}) {
  const admin = getAdminClient()

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      rol: 'cliente',
      nombre: data.nombre,
      partner_id: data.partnerId,
    },
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { error: 'Ya existe un usuario con ese email.' }
    }
    return { error: authError.message }
  }

  const clienteId = authData.user.id

  // 2. Crear el trámite
  const supabase = await createClient()
  const tramiteInsert: Record<string, unknown> = {
    cliente_id: clienteId,
    partner_id: data.partnerId,
    tipo: data.tipo,
    etapa_numero: 1,
  }

  if (data.tipo === 'MARCAS' && data.datosPropuesta) {
    tramiteInsert.datos_propuesta = data.datosPropuesta
  }
  if (data.tipo === 'DNDA' && data.datosPropuestaDNDA) {
    tramiteInsert.datos_propuesta = data.datosPropuestaDNDA
  }
  if (data.tipo === 'SAS' && data.datosPropuestaSAS) {
    tramiteInsert.datos_propuesta = data.datosPropuestaSAS
  }

  const { data: tramiteData, error: tramiteError } = await supabase
    .from('tramites')
    .insert(tramiteInsert)
    .select('id')
    .single()

  if (tramiteError || !tramiteData) {
    return { error: 'Cliente creado pero hubo un error al iniciar el trámite.' }
  }

  // 3. Enviar email con propuesta (MARCAS, DNDA o SAS)
  let emailEnviado = false
  let emailError: string | undefined

  if ((data.tipo === 'MARCAS' && data.datosPropuesta) || (data.tipo === 'DNDA' && data.datosPropuestaDNDA) || (data.tipo === 'SAS' && data.datosPropuestaSAS)) {
    const { data: partnerPerfil } = await supabase
      .from('perfiles')
      .select('nombre')
      .eq('id', data.partnerId)
      .single()

    const partnerNombre = partnerPerfil?.nombre ?? 'Tu Estudio Jurídico'

    if (data.tipo === 'MARCAS' && data.datosPropuesta) {
      const result = await enviarPropuestaEmail({
        datos: data.datosPropuesta,
        clienteNombre: data.nombre,
        clienteEmail: data.email,
        clientePassword: data.password,
        partnerNombre,
        tramiteId: tramiteData.id,
      })
      emailEnviado = result.enviado
      emailError = result.error
    }

    if (data.tipo === 'DNDA' && data.datosPropuestaDNDA) {
      const result = await enviarPropuestaDNDAEmail({
        datos: data.datosPropuestaDNDA,
        clienteNombre: data.nombre,
        clienteEmail: data.email,
        clientePassword: data.password,
        partnerNombre,
        tramiteId: tramiteData.id,
      })
      emailEnviado = result.enviado
      emailError = result.error
    }

    if (data.tipo === 'SAS' && data.datosPropuestaSAS) {
      const result = await enviarPropuestaSASEmail({
        datos: data.datosPropuestaSAS,
        clienteNombre: data.nombre,
        clienteEmail: data.email,
        clientePassword: data.password,
        partnerNombre,
        tramiteId: tramiteData.id,
      })
      emailEnviado = result.enviado
      emailError = result.error
    }
  }

  revalidatePath('/partner/dashboard')
  return {
    success: true,
    tramiteId: tramiteData.id,
    emailEnviado,
    emailError,
  }
}
