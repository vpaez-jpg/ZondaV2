import { NextRequest, NextResponse } from 'next/server'
import { TIPOS_OBRA_DNDA } from '@/lib/propuesta-dnda'

export async function POST(req: NextRequest) {
  const { descripcion } = await req.json()

  if (!descripcion || descripcion.trim().length < 5) {
    return NextResponse.json({ error: 'Descripción demasiado corta' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ tipo: null, sinApiKey: true })
  }

  const tiposStr = TIPOS_OBRA_DNDA
    .map(t => `- ${t.id}: ${t.label} (${t.sublabel})`)
    .join('\n')

  const prompt = `Sos un especialista en derechos de autor argentino. Analizá la siguiente descripción de una obra o creación y clasificala en uno de los 8 tipos disponibles.

DESCRIPCIÓN: "${descripcion}"

TIPOS DISPONIBLES:
${tiposStr}

Respondé ÚNICAMENTE con un JSON válido sin texto adicional:
{
  "tipo": "software",
  "motivo": "Razón breve de por qué corresponde este tipo"
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error clasificar-obra:', await response.text())
      return NextResponse.json({ tipo: null, error: 'Error al clasificar' })
    }

    const data = await response.json()
    const texto = data.content?.[0]?.text ?? ''
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ tipo: null })

    const parsed = JSON.parse(match[0])
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Error clasificando obra:', err)
    return NextResponse.json({ tipo: null })
  }
}
