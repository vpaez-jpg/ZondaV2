// POST /api/partner/casos/importar-texto
// Recibe texto libre (WhatsApp dump, notas, etc.) y extrae clientes con Claude Haiku
// body: { texto }
// → { clientes: [{ clienteNombre, clienteWhatsapp?, clienteEmail?, titulo? }] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const { texto } = await req.json().catch(() => ({ texto: '' }))
  if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

  const prompt = `Analizá este texto de un abogado argentino y extraé la información de sus clientes o potenciales clientes.

Para cada persona o empresa identificada, extraé:
- clienteNombre: nombre completo o razón social (REQUERIDO)
- clienteWhatsapp: número de teléfono/WhatsApp sin espacios ni caracteres especiales (o null)
- clienteEmail: dirección de email (o null)
- titulo: el asunto o tipo de caso mencionado, en pocas palabras (o "Sin especificar")

Texto:
${texto}

Respondé SOLO con un JSON array válido, sin markdown, sin explicaciones:
[
  {
    "clienteNombre": "...",
    "clienteWhatsapp": null,
    "clienteEmail": null,
    "titulo": "..."
  }
]

Si no encontrás ningún cliente, respondé con [].`

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
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return NextResponse.json({ error: 'Error en IA' }, { status: 500 })

    const data  = await res.json()
    const texto = (data.content?.[0]?.text ?? '').trim()

    // Extraer JSON del texto
    const match = texto.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ clientes: [] })

    const clientes = JSON.parse(match[0]) as Array<{
      clienteNombre:    string
      clienteWhatsapp:  string | null
      clienteEmail:     string | null
      titulo:           string
    }>

    return NextResponse.json({ clientes })
  } catch (e) {
    console.error('importar-texto:', e)
    return NextResponse.json({ error: 'Error procesando texto' }, { status: 500 })
  }
}
