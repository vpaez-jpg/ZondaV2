// GET  /api/partner/cobros — lista los últimos 50 cobros del partner
// POST /api/partner/cobros — registra una nueva solicitud de cobro
//
// POST body: {
//   cliente_nombre:   string
//   cliente_whatsapp?: string
//   monto:            number
//   concepto:         string
//   medio_pago:       'transferencia' | 'link'
//   link_pago?:       string
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('cobros_solicitados')
    .select('id, cliente_nombre, cliente_whatsapp, monto, concepto, medio_pago, link_pago, estado, created_at')
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Error cargando cobros' }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { cliente_nombre, cliente_whatsapp, monto, concepto, medio_pago, link_pago } = body as {
    cliente_nombre:    string
    cliente_whatsapp?: string | null
    monto:             number
    concepto:          string
    medio_pago:        'transferencia' | 'link'
    link_pago?:        string | null
  }

  if (!cliente_nombre?.trim())
    return NextResponse.json({ error: 'cliente_nombre requerido' }, { status: 400 })
  if (!monto || isNaN(Number(monto)) || Number(monto) <= 0)
    return NextResponse.json({ error: 'monto inválido' }, { status: 400 })
  if (!concepto?.trim())
    return NextResponse.json({ error: 'concepto requerido' }, { status: 400 })
  if (!['transferencia', 'link'].includes(medio_pago))
    return NextResponse.json({ error: 'medio_pago inválido' }, { status: 400 })

  const { data, error } = await supabase
    .from('cobros_solicitados')
    .insert({
      partner_id:       user.id,
      cliente_nombre:   cliente_nombre.trim(),
      cliente_whatsapp: cliente_whatsapp?.trim() || null,
      monto:            Number(monto),
      concepto:         concepto.trim(),
      medio_pago,
      link_pago:        link_pago?.trim() || null,
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('cobros insert:', error)
    return NextResponse.json({ error: 'Error guardando el cobro' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
