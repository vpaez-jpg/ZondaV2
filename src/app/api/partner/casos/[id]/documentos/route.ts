// GET  /api/partner/casos/[id]/documentos — lista documentos del caso
// POST /api/partner/casos/[id]/documentos — registra un documento subido
// body POST: { nombre, descripcion?, url, storage_path?, tipo_mime?, tamanio? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos')
    .select('id')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('caso_documentos')
    .select('id, nombre, descripcion, url, storage_path, tipo_mime, tamanio, rol_subidor, subido_por, created_at')
    .eq('caso_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Error cargando documentos' }, { status: 500 })

  // Para docs privados (caso-docs), generar signed read URLs que duran 1 hora
  const docs = await Promise.all(
    (data ?? []).map(async doc => {
      if (!doc.storage_path) return doc  // URL externa o pública, devolver tal cual

      const { data: signed } = await supabase.storage
        .from('caso-docs')
        .createSignedUrl(doc.storage_path, 3600)  // 1 hora de validez

      return {
        ...doc,
        url: signed?.signedUrl ?? doc.url,  // fallback a la URL guardada si falla
      }
    })
  )

  return NextResponse.json(docs)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: caso } = await supabase
    .from('casos')
    .select('id')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { nombre, descripcion, url, storage_path, tipo_mime, tamanio } = body

  if (!nombre?.trim() || !url?.trim())
    return NextResponse.json({ error: 'nombre y url requeridos' }, { status: 400 })

  const { data, error } = await supabase
    .from('caso_documentos')
    .insert({
      caso_id:      id,
      nombre:       nombre.trim(),
      descripcion:  descripcion?.trim() || null,
      url,
      storage_path: storage_path || null,
      tipo_mime:    tipo_mime || null,
      tamanio:      tamanio || null,
      subido_por:   user.id,
      rol_subidor:  'partner',
    })
    .select('id, nombre, descripcion, url, tipo_mime, tamanio, rol_subidor, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Error guardando documento' }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const docId = searchParams.get('docId')
  if (!docId) return NextResponse.json({ error: 'docId requerido' }, { status: 400 })

  // Verificar que el doc pertenece al caso del partner
  const { data: doc } = await supabase
    .from('caso_documentos')
    .select('id, storage_path')
    .eq('id', docId)
    .eq('caso_id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  // Si tiene storage_path, eliminarlo de Supabase Storage
  if (doc.storage_path) {
    await supabase.storage.from('caso-docs').remove([doc.storage_path])
  }

  await supabase.from('caso_documentos').delete().eq('id', docId)

  return NextResponse.json({ ok: true })
}
