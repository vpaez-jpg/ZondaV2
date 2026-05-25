// /api/cron/whatsapp-briefing
// Cron job que envía el adelanto de agenda por WhatsApp a todos los partners.
// Se ejecuta automáticamente a las 8 PM hora Argentina (= 23:00 UTC).
//
// ── Cómo configurar el cron ───────────────────────────────────────────────────
// Opción A — Vercel (si deploy en Vercel):
//   Agregar al archivo vercel.json en la raíz del proyecto:
//   {
//     "crons": [{ "path": "/api/cron/whatsapp-briefing", "schedule": "0 23 * * *" }]
//   }
//
// Opción B — Railway (si deploy en Railway):
//   En Railway → tu proyecto → añadir un "Cron Job":
//   Command: curl -X GET https://tu-dominio.com/api/cron/whatsapp-briefing \
//              -H "Authorization: Bearer $CRON_SECRET"
//   Schedule: 0 23 * * *   (= 8 PM Argentina)
//
// ── Variables de entorno necesarias ──────────────────────────────────────────
//   CRON_SECRET          = cualquier string largo y secreto (ej: openssl rand -hex 32)
//   TWILIO_ACCOUNT_SID   = ACxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN    = xxxxxxxxxxxxxxxx
//   TWILIO_WHATSAPP_FROM = whatsapp:+14155238886   (sandbox Twilio)
//   ANTHROPIC_API_KEY    = sk-ant-...
//   SUPABASE_SERVICE_ROLE_KEY = eyJxxxxxxx  (Service Role Key de Supabase)
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse }          from 'next/server'
import { createClient }                        from '@supabase/supabase-js'
import { sendWhatsApp, buildBriefingMessage }  from '@/lib/twilio'
import { getValidToken, listarEventos }         from '@/lib/google-calendar'
import { addDays, format }                      from 'date-fns'
import { es }                                   from 'date-fns/locale'

// ── Cliente Supabase con Service Role (bypass RLS) ───────────────────────────
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── Lógica principal ─────────────────────────────────────────────────────────
async function runBriefingCron() {
  const db      = getServiceClient()
  const mañana  = addDays(new Date(), 1)
  const fechaStr   = format(mañana, 'yyyy-MM-dd')
  const fechaLabel = format(mañana, "EEEE d 'de' MMMM", { locale: es })

  // 1. Obtener todos los partners que tienen WhatsApp activo
  const { data: partners, error } = await db
    .from('partners_con_whatsapp')
    .select('*')
    .eq('whatsapp_activo', true)

  if (error || !partners) {
    console.error('[Cron] Error obteniendo partners:', error)
    return { enviados: 0, errores: 1 }
  }

  let enviados = 0
  let erroresCnt = 0

  for (const partner of partners) {
    try {
      // 2. Obtener vencimientos del partner para mañana
      // Los vencimientos están en localStorage del cliente, pero el cron corre en servidor.
      // Si migramos los vencimientos a Supabase, aquí haríamos la query.
      // Por ahora, enviamos solo los eventos de Google Calendar.
      // TODO: migrar vencimientos a Supabase para que el cron los lea.

      const eventos: Array<{ titulo: string; hora?: string; link?: string }> = []
      const vencimientos: Array<{ titulo: string; hora?: string; urgente?: boolean }> = []

      // 3. Obtener eventos de Google Calendar del partner
      const token = await getValidToken(partner.user_id)
      if (token) {
        try {
          const eventsRaw = await listarEventos(token, mañana, mañana)
          const events = eventsRaw as Array<{
            summary?: string;
            start?: { date?: string; dateTime?: string };
            hangoutLink?: string; description?: string; location?: string
          }>

          for (const ev of events) {
            let hora: string | undefined
            if (ev.start?.dateTime) {
              hora = format(new Date(ev.start.dateTime), 'HH:mm')
            }
            const rawText   = [ev.hangoutLink, ev.description, ev.location].filter(Boolean).join(' ')
            const linkMatch = rawText.match(/https?:\/\/(meet\.google\.com|zoom\.us)\S+/)
            eventos.push({
              titulo: ev.summary ?? '(sin título)',
              hora,
              link: linkMatch ? linkMatch[0] : undefined,
            })
          }
        } catch {
          // Google no disponible para este partner — continuar
        }
      }

      // 4. Generar resumen IA (Haiku, rápido y económico)
      let resumenIA: string | undefined
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (apiKey && (vencimientos.length > 0 || eventos.length > 0)) {
          const nombreCorto = partner.nombre.split(' ')[0]
          const vDesc = vencimientos.map(v => `• ${v.titulo}`).join('\n') || 'Ninguno'
          const eDesc = eventos.map(e => `• ${e.hora ? e.hora + ' — ' : ''}${e.titulo}`).join('\n') || 'Ninguno'

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 120,
              messages: [{
                role: 'user',
                content: `Generá una sola oración de consejo práctico para el abogado ${nombreCorto} sobre su agenda de mañana. Usá "vos" y sé directo.
Vencimientos: ${vDesc}
Reuniones: ${eDesc}
Responde SOLO la oración.`
              }],
            }),
          })
          if (aiRes.ok) {
            const aiData = await aiRes.json()
            resumenIA = aiData.content?.[0]?.text?.trim()
          }
        }
      } catch {
        // IA no disponible — continuar sin resumen
      }

      // 5. Construir y enviar mensaje WhatsApp
      const mensaje = buildBriefingMessage({
        nombrePartner: partner.nombre,
        fechaMañana:   fechaLabel,
        vencimientos,
        eventos,
        resumenIA,
      })

      const result = await sendWhatsApp(partner.whatsapp_link, mensaje)

      if (result.ok) {
        enviados++
        console.log(`[Cron] ✓ Enviado a ${partner.nombre} (${partner.whatsapp_link}) — SID: ${result.sid}`)
      } else {
        erroresCnt++
        console.error(`[Cron] ✗ Error enviando a ${partner.nombre}:`, result.error)
      }
    } catch (err) {
      erroresCnt++
      console.error(`[Cron] ✗ Error procesando partner ${partner.nombre}:`, err)
    }
  }

  return { enviados, errores: erroresCnt, total: partners.length }
}

// ── Handler GET (llamado por el cron scheduler) ───────────────────────────────
export async function GET(req: NextRequest) {
  // Verificar secreto de autorización para que nadie pueda triggerearlo manualmente
  const secret     = req.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  console.log('[Cron] Iniciando briefing nocturno WhatsApp...')
  const resultado = await runBriefingCron()
  console.log('[Cron] Finalizado:', resultado)

  return NextResponse.json({
    ok:    true,
    ...resultado,
    timestamp: new Date().toISOString(),
  })
}
