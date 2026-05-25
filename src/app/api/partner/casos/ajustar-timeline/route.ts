// POST /api/partner/casos/ajustar-timeline
// El abogado pide ajustes al borrador del timeline por chat
// body: { mensaje, etapasActuales, titulo, tipoCaso }
// → { etapas: [...actualizadas] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

interface Etapa {
  numero:               number
  titulo:               string
  descripcion_juridica: string
  descripcion_cliente:  string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const {
    mensaje,
    etapasActuales = [],
    titulo         = 'Caso',
    tipoCaso       = 'General',
  } = body as {
    mensaje:         string
    etapasActuales:  Etapa[]
    titulo?:         string
    tipoCaso?:       string
  }

  if (!mensaje?.trim())
    return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })

  const etapasJson = JSON.stringify(etapasActuales, null, 2)

  const prompt = `Estás ayudando a un abogado argentino a ajustar la línea de tiempo de un caso.

Caso: "${titulo}" (${tipoCaso})

Timeline actual:
${etapasJson}

El abogado pide el siguiente ajuste:
"${mensaje}"

Aplicá el ajuste solicitado. Podés:
- Modificar el texto de una etapa
- Agregar nuevas etapas
- Eliminar etapas
- Reordenar etapas
- Cambiar el número total de etapas

Después del ajuste, renumerá las etapas desde 1 de forma consecutiva.
Mantendrás el mismo formato de descripcion_juridica y descripcion_cliente.
Si el ajuste no es claro, hacé lo más razonable según el contexto del caso.

Respondé SOLO con el JSON array actualizado, sin markdown ni texto adicional:
[
  {
    "numero": 1,
    "titulo": "...",
    "descripcion_juridica": "...",
    "descripcion_cliente": "..."
  }
]`

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
        max_tokens: 2048,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return NextResponse.json({ error: 'Error en IA' }, { status: 500 })

    const data  = await res.json()
    const texto = (data.content?.[0]?.text ?? '').trim()

    const match = texto.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ error: 'Respuesta inválida de IA' }, { status: 500 })

    const etapas = JSON.parse(match[0])
    return NextResponse.json({ etapas })
  } catch (e) {
    console.error('ajustar-timeline:', e)
    return NextResponse.json({ error: 'Error ajustando timeline' }, { status: 500 })
  }
}
