// POST /api/generar-propuesta-tyc
//
// Crea un trámite TYC para un nuevo cliente (o cliente existente) y envía
// el email de bienvenida con la propuesta de precios.
//
// body: {
//   nombre:          string
//   email:           string
//   telefono?:       string
//   password:        string
//   precio_24hs:     number
//   precio_3dias:    number
//   precio_5dias:    number
//   ofrece_reunion:  boolean
// }
// → { tramiteId, email, emailEnviado }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { enviarPropuestaTYCEmail, type DatosPropuestaTYC } from '@/lib/propuesta-tyc'

function getAdminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  // ── Auth: solo partners pueden llamar esto ─────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner')
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    nombre,
    email,
    telefono        = '',
    password,
    precio_24hs,
    precio_3dias,
    precio_5dias,
    ofrece_reunion  = false,
  } = body as {
    nombre:          string
    email:           string
    telefono?:       string
    password:        string
    precio_24hs:     number
    precio_3dias:    number
    precio_5dias:    number
    ofrece_reunion?: boolean
  }

  if (!nombre?.trim() || !email?.trim() || !password?.trim())
    return NextResponse.json({ error: 'nombre, email y password son requeridos' }, { status: 400 })
  if (!precio_24hs || !precio_3dias || !precio_5dias)
    return NextResponse.json({ error: 'Los tres precios son requeridos' }, { status: 400 })

  const admin = getAdminClient()

  // ── 1. Crear usuario cliente (o reusar si ya existe) ───────
  let clienteId: string

  const { data: existing } = await admin.auth.admin.listUsers()
  const existingUser = existing?.users?.find(u => u.email === email.toLowerCase().trim())

  if (existingUser) {
    await admin.auth.admin.updateUserById(existingUser.id, { password })
    clienteId = existingUser.id
  } else {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        rol:        'cliente',
        nombre:     nombre.trim(),
        partner_id: user.id,
      },
    })
    if (authError) {
      console.error('crear usuario TYC:', authError)
      return NextResponse.json({ error: authError.message }, { status: 422 })
    }
    clienteId = authData.user.id
  }

  // ── 2. Crear el trámite TYC ────────────────────────────────
  const datosPropuesta: DatosPropuestaTYC = {
    precio_24hs,
    precio_3dias,
    precio_5dias,
    ofrece_reunion,
  }

  const { data: tramite, error: tramiteError } = await supabase
    .from('tramites')
    .insert({
      cliente_id:      clienteId,
      partner_id:      user.id,
      tipo:            'TYC',
      etapa_numero:    1,
      datos_propuesta: datosPropuesta,
    })
    .select('id')
    .single()

  if (tramiteError || !tramite) {
    console.error('crear tramite TYC:', tramiteError)
    return NextResponse.json({ error: 'Error creando el trámite TYC' }, { status: 500 })
  }

  // ── 3. Enviar email con propuesta ──────────────────────────
  const { enviado, error: emailError } = await enviarPropuestaTYCEmail({
    datos:           datosPropuesta,
    clienteNombre:   nombre.trim(),
    clienteEmail:    email.trim(),
    clientePassword: password,
    partnerNombre:   perfil.nombre,
    tramiteId:       tramite.id,
  })

  if (emailError) {
    console.warn('TYC email warning:', emailError)
  }

  return NextResponse.json({
    tramiteId:    tramite.id,
    email:        email.trim(),
    emailEnviado: enviado,
  }, { status: 201 })
}
