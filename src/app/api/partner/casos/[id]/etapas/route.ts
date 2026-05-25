// PATCH /api/partner/casos/[id]/etapas
// Reemplaza todas las etapas del caso con el array aprobado por el abogado
// body: { etapas: [{ numero, titulo, descripcion_juridica, descripcion_cliente }] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

interface EtapaInput {
  numero:               number
  titulo:               string
  descripcion_juridica: string
  descripcion_cliente:  string
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: casoId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar que el caso pertenece al partner
  const { data: caso, error: casoErr } = await supabase
    .from('casos')
    .select('id, etapa_actual')
    .eq('id', casoId)
    .eq('partner_id', user.id)
    .single()

  if (casoErr || !caso)
    return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { etapas } = await req.json().catch(() => ({ etapas: [] })) as { etapas: EtapaInput[] }

  if (!Array.isArray(etapas) || etapas.length === 0)
    return NextResponse.json({ error: 'Etapas requeridas' }, { status: 400 })

  // Borrar etapas existentes
  await supabase.from('caso_etapas').delete().eq('caso_id', casoId)

  // Insertar nuevas etapas
  const rows = etapas.map(e => ({
    caso_id:             casoId,
    numero:              e.numero,
    titulo:              e.titulo,
    descripcion_juridica: e.descripcion_juridica || null,
    descripcion_cliente:  e.descripcion_cliente  || null,
    completada:          false,
  }))

  const { error: insertErr } = await supabase.from('caso_etapas').insert(rows)

  if (insertErr) {
    console.error('etapas insert:', insertErr)
    return NextResponse.json({ error: 'Error guardando etapas' }, { status: 500 })
  }

  // Resetear etapa_actual a 1
  await supabase.from('casos').update({ etapa_actual: 1 }).eq('id', casoId)

  return NextResponse.json({ ok: true, etapas: rows.length })
}
