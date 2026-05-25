// POST /api/partner/casos/importar-lote
// Recibe un array de clientes ya parseados (desde texto IA o Excel) y los crea en bulk
// body: { clientes: [{ clienteNombre, clienteEmail?, clienteWhatsapp?, titulo?, tipoCaso? }] }
// → { creados: number, casos: [{ id, cliente_nombre, titulo }] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

interface ClienteInput {
  clienteNombre:    string
  clienteEmail?:    string | null
  clienteWhatsapp?: string | null
  titulo?:          string
  tipoCaso?:        string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { clientes } = await req.json().catch(() => ({ clientes: [] })) as { clientes: ClienteInput[] }

  if (!Array.isArray(clientes) || clientes.length === 0)
    return NextResponse.json({ error: 'Lista de clientes vacía' }, { status: 400 })

  // Filtrar y normalizar
  const rows = clientes
    .filter(c => c.clienteNombre?.trim())
    .map(c => ({
      partner_id:       user.id,
      cliente_nombre:   c.clienteNombre.trim(),
      cliente_email:    c.clienteEmail?.trim()    || null,
      cliente_whatsapp: c.clienteWhatsapp?.trim() || null,
      titulo:           (c.titulo?.trim()   || 'Sin especificar'),
      tipo_caso:        (c.tipoCaso?.trim() || 'General'),
    }))

  if (rows.length === 0)
    return NextResponse.json({ error: 'Ningún cliente válido' }, { status: 400 })

  const { data, error } = await supabase
    .from('casos')
    .insert(rows)
    .select('id, cliente_nombre, titulo')

  if (error) {
    console.error('importar-lote:', error)
    return NextResponse.json({ error: 'Error importando clientes' }, { status: 500 })
  }

  return NextResponse.json({ creados: data.length, casos: data })
}
