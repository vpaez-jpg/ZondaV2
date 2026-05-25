// lib/twilio.ts
// Helper para envío de mensajes WhatsApp vía Twilio.
//
// ── Setup (hacerlo una sola vez) ──────────────────────────────────────────────
// 1. Ir a https://www.twilio.com y crear una cuenta gratuita.
// 2. En el dashboard de Twilio, copiar:
//    - Account SID (empieza con "AC...")
//    - Auth Token
// 3. Ir a: Messaging → Try it out → Send a WhatsApp message → Sandbox
//    (El Sandbox es gratis y sirve para probar. Para producción se necesita
//     un número WhatsApp Business aprobado por Meta, pero el sandbox funciona igual.)
// 4. El número del Sandbox de Twilio es: whatsapp:+14155238886
// 5. Para que vos puedas recibir mensajes del sandbox, enviá el código de
//    opt-in que te da Twilio al número del sandbox desde tu propio WhatsApp.
// 6. Agregar al .env.local (y a Railway/Vercel en producción):
//    TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
// ──────────────────────────────────────────────────────────────────────────────

const TWILIO_API = 'https://api.twilio.com/2010-04-01'

export interface WhatsAppResult {
  ok:    boolean
  sid?:  string
  error?: string
}

/**
 * Envía un mensaje de WhatsApp usando la API REST de Twilio (sin SDK).
 * @param to  Número en formato internacional sin "+", ej: "5492614001234"
 * @param body Texto del mensaje (hasta 1600 caracteres)
 */
export async function sendWhatsApp(to: string, body: string): Promise<WhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'

  if (!accountSid || !authToken) {
    console.error('[Twilio] Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en el entorno.')
    return { ok: false, error: 'Twilio no configurado' }
  }

  // Normalizar número destino: agregar prefijo whatsapp: si no lo tiene
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:+${to.replace(/\D/g, '')}`

  const params = new URLSearchParams({
    From: from,
    To:   toFormatted,
    Body: body,
  })

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  try {
    const res = await fetch(
      `${TWILIO_API}/Accounts/${accountSid}/Messages.json`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      console.error('[Twilio] Error al enviar mensaje:', data)
      return { ok: false, error: data.message ?? 'Error desconocido' }
    }

    return { ok: true, sid: data.sid }
  } catch (err) {
    console.error('[Twilio] Error de red:', err)
    return { ok: false, error: String(err) }
  }
}

/**
 * Construye el mensaje de WhatsApp del "cierre de jornada" (adelanto para mañana).
 * Formato limpio y directo, optimizado para lectura en móvil.
 */
export function buildBriefingMessage({
  nombrePartner,
  fechaMañana,
  vencimientos,
  eventos,
  resumenIA,
}: {
  nombrePartner: string
  fechaMañana:   string  // "Martes 24 de junio"
  vencimientos:  Array<{ titulo: string; hora?: string; urgente?: boolean }>
  eventos:       Array<{ titulo: string; hora?: string; link?: string }>
  resumenIA?:    string
}): string {
  const nombre = nombrePartner.split(' ')[0]
  const lines: string[] = []

  lines.push(`Hola Dr/a. ${nombre} 👋`)
  lines.push(`Este es el adelanto de tu agenda para mañana, *${fechaMañana}*:`)
  lines.push('')

  if (vencimientos.length > 0) {
    lines.push(`⚖️ *Vencimientos procesales (${vencimientos.length}):*`)
    for (const v of vencimientos) {
      const hora    = v.hora ? ` — ${v.hora}` : ''
      const urgente = v.urgente ? ' ⚠️' : ''
      lines.push(`  • ${v.titulo}${hora}${urgente}`)
    }
    lines.push('')
  }

  if (eventos.length > 0) {
    lines.push(`📅 *Reuniones y audiencias (${eventos.length}):*`)
    for (const e of eventos) {
      const hora = e.hora ? `${e.hora} — ` : ''
      lines.push(`  • ${hora}${e.titulo}`)
    }
    lines.push('')
  }

  if (vencimientos.length === 0 && eventos.length === 0) {
    lines.push('✅ Mañana tenés la agenda despejada. Buen momento para ponerse al día con expedientes.')
    lines.push('')
  }

  if (resumenIA) {
    lines.push(`💡 ${resumenIA}`)
    lines.push('')
  }

  lines.push('Que tengas un buen descanso. Tu asistente virtual de *Zonda Legal* 🏛️')

  return lines.join('\n')
}
