// POST /api/partner/casos/[id]/upload-doc
//
// Arquitectura de upload sin pasar archivos por el servidor:
//   1. Cliente pide una signed upload URL a este endpoint
//   2. Servidor verifica ownership y genera la URL firmada en Supabase Storage
//   3. Cliente sube el archivo DIRECTO a Supabase con un PUT a esa URL
//   4. Cliente llama POST /api/partner/casos/[id]/documentos para registrar en DB
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

  // Verificar que el caso pertenece al partner
  const { data: caso } = await supabase
    .from('casos')
    .select('id')
    .eq('id', casoId)
    .eq('partner_id', user.id)
    .single()

  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 })

  const { nombre, tipo_mime, tamanio } = await req.json().catch(() => ({}))
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  // Sanitizar el nombre del archivo y construir el path
  const ext        = nombre.split('.').pop() ?? 'bin'
  const safeName   = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const timestamp  = Date.now()
  const path       = `${casoId}/partner/${timestamp}_${safeName}`

  // Generar la signed upload URL (el archivo nunca pasa por nuestro servidor)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    console.error('signed upload URL error:', error)
    return NextResponse.json(
      { error: 'No se pudo generar la URL de carga. Verificá que el bucket "caso-docs" exista en Supabase Storage.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    path,
    token:     data.token,
    // Metadatos para que el cliente los pase al registrar el doc en la DB
    meta: {
      nombre:    nombre.trim(),
      tipo_mime: tipo_mime ?? null,
      tamanio:   tamanio   ?? null,
    },
  })
}
