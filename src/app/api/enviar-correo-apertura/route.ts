// POST /api/enviar-correo-apertura
// Body: { tramiteId: string }
//
// Envía el correo de solicitud de apertura de expediente al juzgado federal
// correspondiente según la jurisdicción del trámite.
//
//   San Rafael → jfsanrafael.demanda@pjn.gov.ar
//   Mendoza    → jfmendoza4.demanda@pjn.gov.ar
//
// Solo accesible para usuarios con rol='zonda'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EMAILS_JUZGADO: Record<string, string> = {
  san_rafael: 'jfsanrafael.demanda@pjn.gov.ar',
  mendoza:    'jfmendoza4.demanda@pjn.gov.ar',
}

const ASUNTO  = 'Solicita apertura de expediente'
const CUERPO  = `Estimados,

Por medio del presente, acompaño el formulario de demanda correspondiente a fin de solicitar la creación del expediente en el sistema.

Quedo a disposición y agradezco de antemano su atención.

Sin otro particular, saludo atentamente.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth: solo zonda
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'zonda') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let tramiteId: string
  try {
    const body = await req.json()
    tramiteId  = body.tramiteId
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!tramiteId) return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })

  // Obtener trámite
  const { data: tramite, error: tErr } = await supabase
    .from('tramites')
    .select('id, tipo, datos_propuesta, datos_cliente')
    .eq('id', tramiteId)
    .single()

  if (tErr || !tramite) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const propuesta   = (tramite.datos_propuesta ?? {}) as Record<string, unknown>
  const jurisdiccion = String(propuesta.jurisdiccion ?? '').toLowerCase()

  if (!jurisdiccion) {
    return NextResponse.json({ error: 'Jurisdicción no configurada en el trámite' }, { status: 400 })
  }

  const destinatario = EMAILS_JUZGADO[jurisdiccion]
  if (!destinatario) {
    return NextResponse.json({ error: `Jurisdicción desconocida: ${jurisdiccion}` }, { status: 400 })
  }

  const apiKey   = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'demandas@zondalegal.com'

  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurado' }, { status: 500 })
  }

  const datos         = (tramite.datos_cliente ?? {}) as Record<string, unknown>
  const nombreCliente = String(datos.nombre_completo ?? '').trim()

  const bodyText = CUERPO

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from:    fromEmail,
        to:      [destinatario],
        subject: ASUNTO,
        text:    bodyText,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[enviar-correo-apertura] Resend error', res.status, errText)
      return NextResponse.json({ error: `Error al enviar: ${errText}` }, { status: 502 })
    }

    const resData = await res.json()
    console.log('[enviar-correo-apertura] Enviado a', destinatario, 'id:', resData.id, '| cliente:', nombreCliente)

    return NextResponse.json({
      ok:          true,
      destinatario,
      jurisdiccion,
      resendId:    resData.id,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error de red: ${msg}` }, { status: 500 })
  }
}
