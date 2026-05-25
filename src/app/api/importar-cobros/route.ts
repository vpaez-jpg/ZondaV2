// importar-cobros/route.ts
// Recibe el contenido textual de un Excel/CSV/Word exportado como texto
// y devuelve un array de cobros estructurados para revisión antes de guardar.

import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Sos un asistente de gestión legal para abogados argentinos.
Vas a recibir el contenido (texto) de un documento con cobros pendientes de un abogado.
Puede ser una tabla de Excel, CSV, Word, o cualquier formato.

Tu tarea es identificar cada cobro y devolverlos como un array JSON estructurado.

Cada cobro debe tener estos campos:
{
  "tipo": "directo" | "litigio",
  "concepto": string,
  "cliente_nombre": string | null,
  "moneda": "ARS" | "USD",
  "monto_total": number | null,
  "forma_pago": "unico" | "cuotas" | null,
  "num_cuotas": number | null,
  "monto_cuota": number | null,
  "con_interes": boolean,
  "tasa_interes": number | null,
  "fecha_vencimiento": string | null,
  "estado": "pendiente" | "parcial" | "cobrado",
  "parte_contraria": string | null,
  "monto_litigio": number | null,
  "porcentaje_acordado": number | null,
  "probabilidad": "alta" | "media" | "baja" | null,
  "etapa_litigio": string | null,
  "fecha_estimada_resolucion": string | null,
  "notas": string | null
}

Reglas:
- Si hay un porcentaje sobre resultado → tipo "litigio"; sino → tipo "directo"
- Moneda: si dice USD/dólares → "USD"; sino → "ARS"
- Fechas en formato YYYY-MM-DD
- Montos como número sin símbolos ni separadores de miles
- Devolvé ÚNICAMENTE el JSON array, sin texto adicional ni markdown
- Si no podés interpretar una fila, igual incluyila con los campos que puedas inferir`

export async function POST(req: NextRequest) {
  try {
    const { contenido } = await req.json()
    if (!contenido?.trim()) return NextResponse.json({ error: 'Contenido vacío' }, { status: 400 })

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
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Documento:\n\n${contenido.slice(0, 15000)}` }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? '[]'

    // Limpiar posible markdown (```json ... ```) que la IA puede incluir
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    let cobros: unknown[]
    try {
      cobros = JSON.parse(cleaned)
      if (!Array.isArray(cobros)) cobros = [cobros]
    } catch {
      return NextResponse.json({ error: 'La IA no devolvió JSON válido', raw }, { status: 500 })
    }

    return NextResponse.json({ cobros, total: cobros.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
