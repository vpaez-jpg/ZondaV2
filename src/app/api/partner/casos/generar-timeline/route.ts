// POST /api/partner/casos/generar-timeline
// El abogado describe el proceso y la IA genera las etapas del timeline
// NO guarda en DB — solo devuelve la propuesta para que el abogado la revise
// body: { descripcion, titulo, tipoCaso, nombrePartner? }
// → { etapas: [{ numero, titulo, descripcion_juridica, descripcion_cliente }] }

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
    descripcion,
    titulo       = 'Caso',
    tipoCaso     = 'General',
    nombrePartner = 'el/la abogado/a',
  } = body as {
    descripcion:    string
    titulo?:        string
    tipoCaso?:      string
    nombrePartner?: string
  }

  if (!descripcion?.trim())
    return NextResponse.json({ error: 'Descripción requerida' }, { status: 400 })

  const prompt = `Sos el asistente de ${nombrePartner}, un abogado argentino.
El caso se llama "${titulo}" y es de tipo "${tipoCaso}".

El abogado describió el proceso así:
"${descripcion}"

Generá una línea de tiempo clara con los hitos del proceso legal.

Para cada etapa incluí:
1. titulo: Nombre corto y claro (máximo 6 palabras, lenguaje jurídico argentino)
2. descripcion_juridica: 1-2 oraciones técnicas sobre qué ocurre en esta etapa
3. descripcion_cliente: 1-2 oraciones en español rioplatense, con "vos", amigable y tranquilizadora, explicando qué significa para el cliente. Evitá tecnicismos. Si no hay nada que el cliente deba hacer, aclaralo.

Reglas:
- Entre 4 y 8 etapas (ni más ni menos)
- Las etapas deben ser cronológicas y lógicas
- Adaptate al tipo de proceso mencionado (divorcio, sucesión, laboral, penal, etc.)

Respondé SOLO con un JSON array, sin markdown ni texto adicional:
[
  {
    "numero": 1,
    "titulo": "Presentación de la demanda",
    "descripcion_juridica": "Se inicia el proceso mediante la presentación del escrito de demanda ante el Juzgado competente junto con la documentación respaldatoria.",
    "descripcion_cliente": "Tu abogado presentó toda la documentación necesaria en el juzgado para iniciar tu caso oficialmente. Este es el primer paso y ya está hecho."
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
    console.error('generar-timeline:', e)
    return NextResponse.json({ error: 'Error generando timeline' }, { status: 500 })
  }
}
