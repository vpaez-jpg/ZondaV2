// POST /api/formulario/[token]/upload
//
// Endpoint para usuarios NO autenticados que completan un formulario de intake.
// Genera una signed upload URL para el bucket público "intake-archivos".
//
// body: { nombre: string, tipo_mime?: string, campo_id: string }
// → { signedUrl, path, publicUrl }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const BUCKET = 'intake-archivos'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase  = await createClient()

  // Verificar que el formulario existe y está pendiente
  const { data: form, error: formErr } = await supabase
    .from('intake_forms')
    .select('id, estado')
    .eq('token', token)
    .single()

  if (formErr || !form)
    return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })

  if (form.estado === 'completado')
    return NextResponse.json({ error: 'Formulario ya completado' }, { status: 409 })

  const { nombre, tipo_mime, campo_id } = await req.json().catch(() => ({}))
  if (!nombre?.trim() || !campo_id)
    return NextResponse.json({ error: 'nombre y campo_id requeridos' }, { status: 400 })

  const safeName  = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const timestamp = Date.now()
  const path      = `${form.id}/${campo_id}/${timestamp}_${safeName}`

  // Generar signed upload URL — el archivo sube directo desde el browser
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    console.error('signed upload URL error (intake):', error)
    return NextResponse.json(
      { error: 'No se pudo generar la URL de carga. Verificá que el bucket "intake-archivos" exista.' },
      { status: 500 }
    )
  }

  // Como el bucket es público, la URL de lectura es permanente y no expira
  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    path,
    publicUrl: publicUrlData.publicUrl,
    // tipo_mime devuelto para que el cliente lo incluya en los metadatos
    tipo_mime: tipo_mime ?? null,
  })
}
