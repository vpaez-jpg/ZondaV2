// GET  /api/formulario/[token] — obtiene el formulario público por token
// POST /api/formulario/[token] — cliente envía sus respuestas

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase  = await createClient()

  const { data: form, error } = await supabase
    .from('intake_forms')
    .select('id, titulo, descripcion, campos, cliente_nombre, estado')
    .eq('token', token)
    .single()

  if (error || !form)
    return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })

  // Info básica del partner (para marca blanca en la página del form)
  const { data: partnerInfo } = await supabase
    .from('intake_forms')
    .select('partner_id')
    .eq('token', token)
    .single()

  let partnerNombre = 'Tu estudio jurídico'
  if (partnerInfo?.partner_id) {
    const { data: p } = await supabase
      .from('perfiles')
      .select('nombre')
      .eq('id', partnerInfo.partner_id)
      .single()
    if (p?.nombre) partnerNombre = p.nombre
  }

  return NextResponse.json({
    id:             form.id,
    titulo:         form.titulo,
    descripcion:    form.descripcion,
    campos:         form.campos,
    cliente_nombre: form.cliente_nombre,
    estado:         form.estado,
    partner_nombre: partnerNombre,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase  = await createClient()

  const { data: form, error: formErr } = await supabase
    .from('intake_forms')
    .select('id, estado, partner_id, titulo')
    .eq('token', token)
    .single()

  if (formErr || !form)
    return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })

  if (form.estado === 'completado')
    return NextResponse.json({ error: 'Este formulario ya fue completado' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const { respuestas, archivos } = body

  if (!respuestas || typeof respuestas !== 'object')
    return NextResponse.json({ error: 'Respuestas requeridas' }, { status: 400 })

  // Registrar la IP (para auditoría)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? null

  const { error: insertErr } = await supabase
    .from('intake_respuestas')
    .insert({
      form_id:    form.id,
      respuestas,
      archivos:   archivos ?? null,
      ip,
    })

  if (insertErr) {
    console.error('intake_respuestas insert:', insertErr)
    return NextResponse.json({ error: 'Error guardando respuestas' }, { status: 500 })
  }

  // Marcar el formulario como completado
  await supabase
    .from('intake_forms')
    .update({ estado: 'completado', completado_at: new Date().toISOString() })
    .eq('id', form.id)

  // Notificar al partner via WhatsApp (si tiene Twilio configurado)
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_WHATSAPP_FROM

  if (accountSid && authToken && from && form.partner_id) {
    const { data: partnerPerfil } = await supabase
      .from('perfiles')
      .select('whatsapp_link')
      .eq('id', form.partner_id)
      .single()

    if (partnerPerfil?.whatsapp_link) {
      const tel = partnerPerfil.whatsapp_link.replace(/\D/g, '')
      const msg = `✅ *Formulario completado*\n\n"${form.titulo}" fue completado por el cliente. Ingresá al panel para ver las respuestas.`

      try {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: from,
              To:   `whatsapp:+${tel}`,
              Body: msg,
            }).toString(),
          }
        )
      } catch { /* silent */ }
    }
  }

  return NextResponse.json({ ok: true })
}
