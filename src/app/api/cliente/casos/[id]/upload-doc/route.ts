// POST /api/cliente/casos/[id]/upload-doc
//
// Igual que el de partner pero verifica que el caso pertenece al cliente autenticado.
// El cliente sube sus propios documentos al caso (ej: DNI, contratos).
//
// body: { nombre: string, tipo_mime?: string, tamanio?: number }
// → { signedUrl, path, token }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const BUCKET = 'caso-docs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: casoId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Verificar que el caso pertenece al cliente
  const { data: caso } = await supabase
    .from('casos')
    .select('id')
    .eq('id', casoId)
    .eq('cliente_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { nombre, tipo_mime, tamanio } = await req.json().catch(() => ({}))
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const safeName  = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const timestamp = Date.now()
  const path      = `${casoId}/cliente/${timestamp}_${safeName}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    console.error('signed upload URL error (cliente):', error)
    return NextResponse.json(
      { error: 'No se pudo generar la URL de carga.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    path,
    token:     data.token,
    meta: {
      nombre:    nombre.trim(),
      tipo_mime: tipo_mime ?? null,
      tamanio:   tamanio   ?? null,
    },
  })
}
