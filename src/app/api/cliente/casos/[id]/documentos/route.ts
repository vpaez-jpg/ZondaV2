// GET  /api/cliente/casos/[id]/documentos — lista documentos del caso (vista cliente)
// POST /api/cliente/casos/[id]/documentos — cliente sube un documento
// body POST: { nombre, url, storage_path?, tipo_mime?, tamanio? }

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
    .eq('cliente_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('caso_documentos')
    .select('id, nombre, descripcion, url, storage_path, tipo_mime, tamanio, rol_subidor, created_at')
    .eq('caso_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Error cargando documentos' }, { status: 500 })

  // Generar signed read URLs para docs privados (caso-docs), válidas 1 hora
  const docs = await Promise.all(
    (data ?? []).map(async doc => {
      if (!doc.storage_path) return doc

      const { data: signed } = await supabase.storage
        .from('caso-docs')
        .createSignedUrl(doc.storage_path, 3600)

      return {
        ...doc,
        url: signed?.signedUrl ?? doc.url,
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
    .eq('cliente_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { nombre, url, storage_path, tipo_mime, tamanio } = body

  if (!nombre?.trim() || !url?.trim())
    return NextResponse.json({ error: 'nombre y url requeridos' }, { status: 400 })

  const { data, error } = await supabase
    .from('caso_documentos')
    .insert({
      caso_id:      id,
      nombre:       nombre.trim(),
      url,
      storage_path: storage_path || null,
      tipo_mime:    tipo_mime || null,
      tamanio:      tamanio || null,
      subido_por:   user.id,
      rol_subidor:  'cliente',
    })
    .select('id, nombre, descripcion, url, tipo_mime, tamanio, rol_subidor, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Error guardando documento' }, { status: 500 })

  return NextResponse.json(data)
}
