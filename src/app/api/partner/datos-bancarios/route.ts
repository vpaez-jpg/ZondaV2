// GET /api/partner/datos-bancarios — obtiene los datos bancarios guardados del partner
// PUT /api/partner/datos-bancarios — guarda / actualiza los datos bancarios
//
// PUT body: { alias?, cbu?, banco?, titular? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('partner_datos_bancarios')
    .select('alias, cbu, banco, titular, updated_at')
    .eq('partner_id', user.id)
    .single()

  // Si no tiene datos, devolver objeto vacío (no es error)
  return NextResponse.json(data ?? { alias: null, cbu: null, banco: null, titular: null })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { alias, cbu, banco, titular } = body as {
    alias?:   string | null
    cbu?:     string | null
    banco?:   string | null
    titular?: string | null
  }

  const { error } = await supabase
    .from('partner_datos_bancarios')
    .upsert(
      {
        partner_id: user.id,
        alias:      alias?.trim()   || null,
        cbu:        cbu?.trim()     || null,
        banco:      banco?.trim()   || null,
        titular:    titular?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'partner_id' }
    )

  if (error) {
    console.error('datos-bancarios upsert:', error)
    return NextResponse.json({ error: 'Error guardando los datos' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
