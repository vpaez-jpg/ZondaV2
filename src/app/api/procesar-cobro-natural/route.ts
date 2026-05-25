// procesar-cobro-natural/route.ts
// Recibe texto libre (escrito o transcripto de voz) y devuelve
// los campos del cobro ya estructurados listos para pre-llenar el form.

import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Sos un asistente de gestión legal para abogados argentinos.
Tu tarea es extraer información de cobros profesionales desde texto libre y devolverla como JSON estructurado.

Campos posibles del JSON de salida:
{
  "tipo": "directo" | "litigio",
  "concepto": string,             // descripción del servicio o litigio
  "cliente_nombre": string | null,
  "moneda": "ARS" | "USD",
  "monto_total": number | null,   // para tipo directo: monto total del honorario
  "forma_pago": "unico" | "cuotas" | null,
  "num_cuotas": number | null,
  "monto_cuota": number | null,
  "con_interes": boolean,
  "tasa_interes": number | null,  // % mensual
  "fecha_vencimiento": string | null,  // formato YYYY-MM-DD
  "estado": "pendiente" | "parcial" | "cobrado",

  // Solo para tipo "litigio":
  "parte_contraria": string | null,
  "monto_litigio": number | null,
  "porcentaje_acordado": number | null,  // 0-100
  "probabilidad": "alta" | "media" | "baja" | null,
  "etapa_litigio": string | null,
  "fecha_estimada_resolucion": string | null,

  "notas": string | null
}

Reglas:
- Si el abogado menciona un porcentaje sobre el resultado → tipo "litigio"
- Si menciona "cuotas" → forma_pago "cuotas", intentá extraer el número
- Si menciona "dólares", "USD", "usd" → moneda "USD"; sino → "ARS"
- Si no podés inferir un campo, dejalo en null
- Devolvé ÚNICAMENTE el JSON, sin texto adicional ni markdown
- Los montos siempre como número (sin símbolos ni puntos de miles)`

export async function POST(req: NextRequest) {
  try {
    const { texto } = await req.json()
    if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: texto }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? '{}'

    // Limpiar posible markdown (```json ... ```) que la IA puede incluir
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    let cobro: Record<string, unknown>
    try {
      cobro = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'La IA no devolvió JSON válido', raw }, { status: 500 })
    }

    return NextResponse.json({ cobro })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
