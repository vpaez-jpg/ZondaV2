// POST /api/partner/casos/[id]/avanzar
// Marca la etapa actual como completada y avanza al siguiente paso

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

  const { data: caso, error: casoErr } = await supabase
    .from('casos')
    .select('id, etapa_actual')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (casoErr || !caso)
    return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  // Contar total de etapas
  const { count } = await supabase
    .from('caso_etapas')
    .select('*', { count: 'exact', head: true })
    .eq('caso_id', id)

  const totalEtapas = count ?? 0

  // Marcar etapa actual como completada
  await supabase
    .from('caso_etapas')
    .update({ completada: true })
    .eq('caso_id', id)
    .eq('numero', caso.etapa_actual)

  const nuevaEtapa = caso.etapa_actual + 1
  const finalizado = nuevaEtapa > totalEtapas

  // Avanzar o marcar como finalizado
  await supabase
    .from('casos')
    .update({
      etapa_actual: finalizado ? totalEtapas : nuevaEtapa,
      estado:       finalizado ? 'finalizado' : 'activo',
    })
    .eq('id', id)

  return NextResponse.json({
    etapa_actual: finalizado ? totalEtapas : nuevaEtapa,
    finalizado,
  })
}
