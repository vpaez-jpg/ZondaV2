// POST /api/partner/clientes/extraer
//
// Usa IA para parsear una descripción en lenguaje natural y extraer
// los datos del cliente + uno o más casos a crear.
//
// body: { descripcion: string }
// → {
//     nombre:    string,
//     whatsapp?: string,
//     email?:    string,
//     casos: [{ titulo: string, tipo_caso?: string }]
//   }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const { descripcion } = await req.json().catch(() => ({}))
  if (!descripcion?.trim())
    return NextResponse.json({ error: 'descripcion requerida' }, { status: 400 })

  const prompt = `Sos un asistente de un estudio jurídico argentino. El abogado dictó esta instrucción:

"${descripcion}"

Extraé la información del cliente y sus casos. Respondé SOLO con JSON válido, sin explicaciones:

{
  "nombre": "nombre completo del cliente",
  "whatsapp": "número de teléfono si se menciona, sino null",
  "email": "email si se menciona, sino null",
  "tipo_caso": "área jurídica general (ej: Administrativo, Civil, Laboral, Penal, Familia), sino null",
  "casos": [
    {
      "titulo": "título conciso del caso (máx 8 palabras, en español, sin abreviaturas raras)",
      "tipo_caso": "área específica de este caso si difiere del general, sino null"
    }
  ]
}

Reglas:
- Si se mencionan múltiples causas o expedientes, creá un objeto en "casos" por cada uno
- Los títulos de los casos deben ser descriptivos pero concisos (ej: "Amparo por descuento Art. 9 en jubilación")
- Si solo hay un cliente sin casos específicos, creá un solo caso genérico con título "Caso de [nombre]"
- El campo "nombre" debe ser el nombre completo de la persona, en formato "Nombre Apellido"`

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
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error('Haiku error')

    const data  = await res.json()
    const texto = (data.content?.[0]?.text ?? '').trim()
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON encontrado')

    const parsed = JSON.parse(match[0])

    if (!parsed.nombre?.trim())
      return NextResponse.json({ error: 'No pude identificar el nombre del cliente en tu mensaje.' }, { status: 422 })

    return NextResponse.json({
      nombre:    parsed.nombre.trim(),
      whatsapp:  parsed.whatsapp  || null,
      email:     parsed.email     || null,
      tipo_caso: parsed.tipo_caso || null,
      casos:     Array.isArray(parsed.casos) && parsed.casos.length > 0
        ? parsed.casos
        : [{ titulo: `Caso de ${parsed.nombre.trim()}`, tipo_caso: null }],
    })
  } catch (err) {
    console.error('extraer cliente IA error:', err)
    return NextResponse.json({ error: 'No pude interpretar la descripción. ¿Podés reformularla?' }, { status: 500 })
  }
}
