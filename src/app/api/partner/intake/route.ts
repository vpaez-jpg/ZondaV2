// POST /api/partner/intake
// El abogado describe en lenguaje natural los datos que necesita del cliente
// La IA genera los campos del formulario, crea el form y puede enviar WhatsApp
//
// body: {
//   descripcion:       string   // "necesito el DNI, CUIL y un scan del contrato de alquiler de Juan García"
//   cliente_nombre?:   string
//   cliente_whatsapp?: string
//   cliente_email?:    string
//   caso_id?:          string
//   enviar_wa?:        boolean  // si true, enviar WhatsApp automático
// }
//
// → { id, token, titulo, campos, wa_link?, preview_url }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

interface Campo {
  id:              string
  tipo:            'texto' | 'email' | 'telefono' | 'fecha' | 'numero' | 'opcion' | 'archivo' | 'textarea'
  etiqueta:        string
  descripcion?:    string
  requerido:       boolean
  acepta_archivo?: boolean   // para campos tipo 'archivo'
  opciones?:       string[]  // para campos tipo 'opcion'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner')
    return NextResponse.json({ error: 'Solo partners' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const {
    descripcion,
    cliente_nombre,
    cliente_whatsapp,
    cliente_email,
    caso_id,
    enviar_wa = false,
  } = body

  if (!descripcion?.trim())
    return NextResponse.json({ error: 'Descripción requerida' }, { status: 400 })

  // ── Generar campos con IA ───────────────────────────────────────
  const prompt = `Sos un asistente de un estudio jurídico argentino. El abogado describió los datos que necesita de su cliente:

"${descripcion}"

Generá un formulario con los campos necesarios. Para cada campo determiná:
- tipo: "texto", "email", "telefono", "fecha", "numero", "opcion", "archivo", o "textarea"
- usa tipo "archivo" cuando se pide un documento escaneado, foto o archivo
- usa tipo "textarea" para descripciones largas o información detallada
- etiqueta: nombre claro del campo en español rioplatense, en formato "Título de campo"
- descripcion: instrucción breve para el cliente (opcional, solo si clarifica el campo)
- requerido: true/false

También generá un título breve para el formulario (máximo 8 palabras).

Respondé SOLO con JSON válido, sin explicaciones, en este formato exacto:
{
  "titulo": "...",
  "campos": [
    {
      "id": "campo_1",
      "tipo": "texto",
      "etiqueta": "...",
      "descripcion": "...",
      "requerido": true
    }
  ]
}`

  let titulo  = 'Formulario de datos'
  let campos: Campo[] = []

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (res.ok) {
      const data  = await res.json()
      const texto = (data.content?.[0]?.text ?? '').trim()
      // Extraer JSON del texto
      const jsonMatch = texto.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        titulo = parsed.titulo ?? titulo
        campos = (parsed.campos ?? []).map((c: Partial<Campo>, idx: number) => ({
          id:           c.id ?? `campo_${idx + 1}`,
          tipo:         c.tipo ?? 'texto',
          etiqueta:     c.etiqueta ?? `Campo ${idx + 1}`,
          descripcion:  c.descripcion || undefined,
          requerido:    c.requerido !== false,
          acepta_archivo: c.tipo === 'archivo',
          opciones:     c.opciones || undefined,
        }))
      }
    }
  } catch (err) {
    console.error('intake IA error:', err)
    // Si falla la IA, crear un campo genérico
    campos = [{
      id:        'campo_1',
      tipo:      'textarea',
      etiqueta:  'Información requerida',
      descripcion: descripcion,
      requerido: true,
    }]
  }

  if (campos.length === 0) {
    return NextResponse.json({ error: 'No se pudieron generar los campos' }, { status: 500 })
  }

  // ── Guardar el formulario ──────────────────────────────────────
  const { data: form, error: formErr } = await supabase
    .from('intake_forms')
    .insert({
      partner_id:       user.id,
      titulo,
      descripcion:      descripcion.trim(),
      campos,
      cliente_nombre:   cliente_nombre?.trim() || null,
      cliente_whatsapp: cliente_whatsapp?.trim() || null,
      cliente_email:    cliente_email?.trim() || null,
      caso_id:          caso_id || null,
    })
    .select('id, token, titulo, campos, cliente_nombre, cliente_whatsapp')
    .single()

  if (formErr || !form) {
    console.error('intake insert:', formErr)
    return NextResponse.json({ error: 'Error creando el formulario' }, { status: 500 })
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zondalegal.com'
  const formUrl   = `${appUrl}/formulario/${form.token}`
  const nombrePar = perfil.nombre ?? 'Tu abogado/a'

  // ── WhatsApp automático ──────────────────────────────────────
  let wa_link: string | null = null

  if (form.cliente_whatsapp) {
    const nombreCliente = (form.cliente_nombre ?? 'Cliente').split(' ')[0]
    const mensajeWA = `Hola ${nombreCliente}, soy ${nombrePar}.

Para avanzar con tu caso necesito que completes este formulario con tu información:

${formUrl}

Son solo unos minutos y podés hacerlo desde el celular. Cualquier duda, avisame. Gracias.`

    const tel = form.cliente_whatsapp.replace(/\D/g, '')
    wa_link   = `https://wa.me/${tel}?text=${encodeURIComponent(mensajeWA)}`

    // Envío automático via Twilio si está configurado
    if (enviar_wa) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken  = process.env.TWILIO_AUTH_TOKEN
      const from       = process.env.TWILIO_WHATSAPP_FROM

      if (accountSid && authToken && from) {
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
                Body: mensajeWA,
              }).toString(),
            }
          )
        } catch (e) {
          console.error('WA send error:', e)
        }
      }
    }
  }

  return NextResponse.json({
    id:          form.id,
    token:       form.token,
    titulo:      form.titulo,
    campos:      form.campos,
    preview_url: formUrl,
    wa_link,
  })
}

// GET /api/partner/intake — lista todos los formularios del partner
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('intake_forms')
    .select(`
      id, token, titulo, estado, cliente_nombre, cliente_whatsapp,
      created_at, completado_at,
      intake_respuestas (id, created_at)
    `)
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Error cargando formularios' }, { status: 500 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zondalegal.com'

  return NextResponse.json(
    (data ?? []).map(f => ({
      ...f,
      preview_url: `${appUrl}/formulario/${f.token}`,
    }))
  )
}
