// PATCH /api/partner/casos/[id]/etapas/[numero]
// Marca o desmarca una etapa individual como completada
// body: { completada: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; numero: string }> }
) {
  const { id: casoId, numero } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar ownership
  const { data: caso, error: casoErr } = await supabase
    .from('casos')
    .select('id, cliente_id, titulo, etapa_actual, cliente_whatsapp')
    .eq('id', casoId)
    .eq('partner_id', user.id)
    .single()

  if (casoErr || !caso)
    return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { completada } = await req.json().catch(() => ({}))
  if (typeof completada !== 'boolean')
    return NextResponse.json({ error: 'completada requerido (boolean)' }, { status: 400 })

  // Actualizar la etapa
  const { error: updateErr } = await supabase
    .from('caso_etapas')
    .update({ completada })
    .eq('caso_id', casoId)
    .eq('numero', parseInt(numero, 10))

  if (updateErr) {
    console.error('etapa toggle:', updateErr)
    return NextResponse.json({ error: 'Error actualizando etapa' }, { status: 500 })
  }

  // Si se completó la etapa: actualizar etapa_actual al siguiente número
  if (completada) {
    const { data: etapas } = await supabase
      .from('caso_etapas')
      .select('numero, completada')
      .eq('caso_id', casoId)
      .order('numero')

    if (etapas) {
      // La siguiente etapa incompleta
      const siguiente = etapas.find(e => !e.completada)
      const nuevaActual = siguiente?.numero ?? parseInt(numero, 10)
      await supabase.from('casos').update({ etapa_actual: nuevaActual }).eq('id', casoId)

      // Enviar WhatsApp al cliente si tiene teléfono y hay un cliente registrado
      if (caso.cliente_whatsapp && caso.cliente_id) {
        const perfil = await supabase
          .from('perfiles')
          .select('nombre')
          .eq('id', user.id)
          .single()

        const etapaCompletada = etapas.find(e => e.numero === parseInt(numero, 10))
        const { data: etapaDetalle } = await supabase
          .from('caso_etapas')
          .select('titulo, descripcion_cliente')
          .eq('caso_id', casoId)
          .eq('numero', parseInt(numero, 10))
          .single()

        const nombreAbogado = perfil.data?.nombre ?? 'Tu abogado/a'
        const tituloEtapa   = etapaDetalle?.titulo ?? `Etapa ${numero}`
        const descCliente   = etapaDetalle?.descripcion_cliente ?? ''

        const mensaje = `*Actualización en tu caso "${caso.titulo}"*\n\nSe completó: *${tituloEtapa}*${descCliente ? `\n\n${descCliente}` : ''}\n\n_— ${nombreAbogado}_`

        // Intentar enviar vía Twilio (si está configurado)
        const accountSid = process.env.TWILIO_ACCOUNT_SID
        const authToken  = process.env.TWILIO_AUTH_TOKEN
        const from       = process.env.TWILIO_WHATSAPP_FROM

        if (accountSid && authToken && from) {
          const tel = caso.cliente_whatsapp.replace(/\D/g, '')
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
                  Body: mensaje,
                }).toString(),
              }
            )
          } catch { /* silent — no bloquear la respuesta si falla */ }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, completada })
}
