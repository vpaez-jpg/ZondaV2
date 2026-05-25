// POST /api/partner/casos/[id]/nota
// El abogado escribe una actualización en lenguaje jurídico; la IA la traduce para el cliente
// body: { texto_juridico }
// → { id, texto_juridico, texto_cliente }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  const { data: caso, error: casoErr } = await supabase
    .from('casos')
    .select('id, titulo, tipo_caso')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (casoErr || !caso)
    return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { texto_juridico } = await req.json().catch(() => ({}))
  if (!texto_juridico?.trim())
    return NextResponse.json({ error: 'Texto requerido' }, { status: 400 })

  // Traducir con IA
  let texto_cliente: string | null = null
  try {
    const prompt = `Sos el "traductor" de un estudio jurídico argentino.
El abogado escribió esta actualización del caso "${caso.titulo}" (${caso.tipo_caso}):

"${texto_juridico}"

Reescribí esto como un mensaje amigable para el cliente (que no conoce lenguaje jurídico).
El mensaje debe:
- Ser positivo, claro y tranquilizador
- Usar español rioplatense, tuteo con "vos"
- Explicar qué significa este avance para el cliente en términos prácticos
- Indicar si el cliente necesita hacer algo o no
- Tener entre 2 y 4 oraciones

Respondé SOLO con el texto del mensaje para el cliente, sin comillas ni explicaciones.`

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
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (res.ok) {
      const data = await res.json()
      texto_cliente = (data.content?.[0]?.text ?? '').trim() || null
    }
  } catch { /* si falla la traducción, igual guardamos el texto jurídico */ }

  const { data, error } = await supabase
    .from('caso_notas')
    .insert({
      caso_id:       id,
      texto_juridico,
      texto_cliente,
      created_by:    user.id,
    })
    .select('id, texto_juridico, texto_cliente, created_at')
    .single()

  if (error) {
    console.error('nota insert:', error)
    return NextResponse.json({ error: 'Error guardando nota' }, { status: 500 })
  }

  return NextResponse.json(data)
}
