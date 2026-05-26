// GET /api/generar-anexo-bonos?tramiteId=...
//
// Descarga todos los bonos de sueldo del trámite (Supabase Storage),
// los escribe en archivos temporales y ejecuta generar_anexo.py para
// producir un PDF unificado con portada "Anexo I".
//
// Solo accesible para usuarios con rol='zonda'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { execSync }                  from 'child_process'
import { writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname }             from 'path'
import { randomUUID }                from 'crypto'
import { tmpdir }                    from 'os'

export const dynamic = 'force-dynamic'

const SCRIPT_PATH = join(
  process.cwd(),
  'src', 'app', 'api', 'generar-anexo-bonos', 'generar_anexo.py'
)

interface DocumentoAdjunto {
  tipo:   string
  nombre: string
  url:    string
}

export async function GET(req: NextRequest) {
  const supabase  = await createClient()
  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  if (!tramiteId) return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })

  // Auth: solo zonda
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'zonda') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Obtener trámite
  const { data: tramite, error: tErr } = await supabase
    .from('tramites')
    .select('id, documentos_adjuntos, datos_cliente')
    .eq('id', tramiteId)
    .single()

  if (tErr || !tramite) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const documentos = (tramite.documentos_adjuntos ?? []) as DocumentoAdjunto[]
  const bonos = documentos.filter(d => d.tipo === 'bono_sueldo')

  if (bonos.length === 0) {
    return NextResponse.json({ error: 'El trámite no tiene bonos de sueldo adjuntos' }, { status: 400 })
  }

  // Descargar cada bono a un archivo temporal
  const tmpDir    = join(tmpdir(), `bonos-${randomUUID()}`)
  const tmpFiles: string[] = []

  try {
    mkdirSync(tmpDir, { recursive: true })

    for (const bono of bonos) {
      const ext  = extname(bono.nombre).toLowerCase() || '.pdf'
      const dest = join(tmpDir, `${randomUUID()}${ext}`)

      // Descargar desde la URL pública del Storage
      const fetchRes = await fetch(bono.url)
      if (!fetchRes.ok) {
        return NextResponse.json(
          { error: `No se pudo descargar el bono "${bono.nombre}": ${fetchRes.statusText}` },
          { status: 502 }
        )
      }
      const buf = Buffer.from(await fetchRes.arrayBuffer())
      writeFileSync(dest, buf)
      tmpFiles.push(dest)
    }

    // Llamar al script Python
    const payload = { files: tmpFiles }
    const result  = execSync(
      `python3 ${SCRIPT_PATH}`,
      {
        input:     JSON.stringify(payload),
        timeout:   60_000,
        maxBuffer: 50 * 1024 * 1024,
      }
    )

    const datos         = (tramite.datos_cliente ?? {}) as Record<string, unknown>
    const nombreCliente = String(datos.nombre_completo ?? 'cliente')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 30)
    const filename = `Anexo_I_Bonos_${nombreCliente}.pdf`

    return new NextResponse(new Uint8Array(result), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error generando Anexo I: ${msg}` }, { status: 500 })
  } finally {
    // Limpiar archivos temporales
    for (const f of tmpFiles) {
      try { unlinkSync(f) } catch { /* ignorar */ }
    }
    try {
      const { rmdirSync } = await import('fs')
      rmdirSync(tmpDir)
    } catch { /* ignorar */ }
  }
}
