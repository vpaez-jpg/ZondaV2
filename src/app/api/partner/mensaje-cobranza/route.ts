// /api/partner/mensaje-cobranza
// Genera un mensaje de recordatorio de cobro amigable usando Claude Haiku.
// POST { clienteNombre, concepto, monto, diasVencido, nombrePartner }
// → { mensaje: string }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const {
    clienteNombre  = 'el/la cliente',
    concepto       = 'el servicio acordado',
    monto          = 0,
    diasVencido    = 0,
    nombrePartner  = 'el/la abogado/a',
  } = body as {
    clienteNombre?: string
    concepto?:      string
    monto?:         number
    diasVencido?:   number
    nombrePartner?: string
  }

  const ars  = '$' + Math.round(monto).toLocaleString('es-AR')
  const dias = diasVencido === 0
    ? 'que vence hoy'
    : diasVencido === 1
      ? 'que venció ayer'
      : `vencido hace ${diasVencido} días`

  const prompt = `Sos el asistente de redacción del estudio jurídico de ${nombrePartner}.
Redactá un único mensaje de WhatsApp para enviarle a ${clienteNombre} recordándole el pago de "${concepto}" por ${ars}, ${dias}.

El mensaje debe:
- Ser breve (máximo 5 oraciones)
- Sonar 100% humano y cálido, como si lo escribiera una persona real
- Ser extremadamente amable y respetuoso — jamás intimidatorio ni urgente
- Mencionar el concepto y el monto de forma natural, sin tablas ni formatos
- Terminar con una frase suave que invite a coordinar el pago ("cuando puedas", "a tu conveniencia", "cuando te sea posible")
- Usar español rioplatense (Argentina), tuteando con "vos"
- NO incluir saludos formales como "Estimado/a" — empezar directamente con "¡Hola [nombre]!"
- NO usar emojis en exceso (máximo 1-2 si aportan calidez)
- NO incluir firmas, nombres del estudio ni datos adicionales

Respondé SOLO con el texto del mensaje, sin comillas, sin explicaciones, sin encabezados.`

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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return NextResponse.json({ error: 'Error generando mensaje' }, { status: 500 })

    const data = await res.json()
    const mensaje = (data.content?.[0]?.text ?? '').trim()
    return NextResponse.json({ mensaje })
  } catch {
    return NextResponse.json({ error: 'Error de red' }, { status: 500 })
  }
}
