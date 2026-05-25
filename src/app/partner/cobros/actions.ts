'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CobroPayload } from '@/lib/cobros-types'

export async function crearCobro(payload: CobroPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase.from('cobros').insert({
    ...payload,
    partner_id: user.id,
    // Calcular expectativa si es litigio
    expectativa_cobro:
      payload.tipo === 'litigio' && payload.monto_litigio && payload.porcentaje_acordado
        ? Math.round((payload.monto_litigio * payload.porcentaje_acordado) / 100)
        : payload.expectativa_cobro,
  })

  if (error) return { error: error.message }
  revalidatePath('/partner/cobros')
  return { success: true }
}

export async function actualizarCobro(id: string, payload: Partial<CobroPayload>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('cobros')
    .update({
      ...payload,
      expectativa_cobro:
        payload.tipo === 'litigio' && payload.monto_litigio && payload.porcentaje_acordado
          ? Math.round((payload.monto_litigio * payload.porcentaje_acordado) / 100)
          : payload.expectativa_cobro,
    })
    .eq('id', id)
    .eq('partner_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/partner/cobros')
  return { success: true }
}

export async function eliminarCobro(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('cobros')
    .delete()
    .eq('id', id)
    .eq('partner_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/partner/cobros')
  return { success: true }
}

export async function marcarCobrado(id: string, montoCobrado: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Obtener el cobro para determinar el nuevo estado
  const { data: cobro } = await supabase
    .from('cobros')
    .select('monto_total')
    .eq('id', id)
    .single()

  const estado =
    montoCobrado <= 0 ? 'pendiente'
    : montoCobrado >= (cobro?.monto_total ?? 0) ? 'cobrado'
    : 'parcial'

  const { error } = await supabase
    .from('cobros')
    .update({ monto_cobrado: montoCobrado, estado })
    .eq('id', id)
    .eq('partner_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/partner/cobros')
  return { success: true }
}
