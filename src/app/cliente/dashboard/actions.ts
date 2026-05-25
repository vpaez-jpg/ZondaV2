'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Guarda los datos del formulario y avanza la etapa de 1 → 2
// (Señal a Zonda de que el cliente completó su parte)
export async function guardarFormulario(
  tramiteId: string,
  datos: Record<string, unknown>
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('tramites')
    .update({
      datos_cliente: datos,
      etapa_numero: 2,
    })
    .eq('id', tramiteId)
    .eq('etapa_numero', 1) // Solo avanza si todavía está en etapa 1

  if (error) return { error: error.message }

  revalidatePath('/cliente/dashboard')
  return { success: true }
}

// Igual que guardarFormulario pero también actualiza documentos_adjuntos
// Usado por FormAmparo (ART9 / GANANCIAS)
export async function guardarFormularioAmparo(opts: {
  tramiteId: string
  datos_cliente: Record<string, unknown>
  documentos_adjuntos: Record<string, unknown>[]
}) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('tramites')
    .update({
      datos_cliente:       opts.datos_cliente,
      documentos_adjuntos: opts.documentos_adjuntos,
      etapa_numero:        2,
    })
    .eq('id', opts.tramiteId)
    .eq('etapa_numero', 1)

  if (error) return { error: error.message }

  revalidatePath('/cliente/dashboard')
  return { success: true }
}
