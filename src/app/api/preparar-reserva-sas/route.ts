// preparar-reserva-sas/route.ts
// Genera el PDF unificado de presentación de Reserva de Denominación SAS.
//
// POST ?tramiteId=xxx
// Body: multipart/form-data
//   comprobante  — archivo PDF del comprobante de pago (opcional)
//   firma_b64    — firma en base64 PNG (opcional, desde localStorage del cliente)
//
// Responde: application/pdf con el PDF unificado:
//   Pág 1: Formulario DPJ
//   Págs 2+: Nota de Reserva de Denominación (con firma en última pág)
//   Págs finales: Comprobante de pago

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

const SCRIPT_PATH = join(
  process.cwd(),
  'src/app/api/preparar-reserva-sas/generar_reserva_pdf.py'
)

export async function POST(req: NextRequest) {
  // 1. Auth — solo Zonda
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const adminDb = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: perfil } = await adminDb
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'zonda')
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  // 2. Parámetros
  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  if (!tramiteId) return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })

  // 3. Parsear multipart
  let comprobanteFile: File | null = null
  let firmab64 = ''

  try {
    const formData = await req.formData()
    comprobanteFile = formData.get('comprobante') as File | null
    firmab64        = (formData.get('firma_b64') as string) ?? ''
  } catch {
    return NextResponse.json({ error: 'Error al leer el formulario multipart' }, { status: 400 })
  }

  // 4. Obtener datos del trámite
  const { data: tramite, error: dbError } = await supabase
    .from('tramites').select('datos_cliente').eq('id', tramiteId).single()
  if (dbError || !tramite)
    return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const datos = tramite.datos_cliente as Record<string, unknown>
  if (!datos)
    return NextResponse.json({ error: 'El cliente aún no completó sus datos' }, { status: 422 })

  // 5. Preparar archivos temporales
  const tmpDir = join(tmpdir(), `reserva_pdf_${randomUUID()}`)
  mkdirSync(tmpDir, { recursive: true })

  const datosPath      = join(tmpDir, 'datos.json')
  const firmaPath      = join(tmpDir, 'firma.png')
  const comprobantePath = join(tmpDir, 'comprobante.pdf')
  const outputPath     = join(tmpDir, 'presentacion.pdf')

  try {
    // Escribir datos como JSON
    writeFileSync(datosPath, JSON.stringify(datos), 'utf8')

    // Escribir firma (si se proveyó)
    if (firmab64) {
      const base64Data = firmab64.replace(/^data:image\/\w+;base64,/, '')
      writeFileSync(firmaPath, Buffer.from(base64Data, 'base64'))
    }

    // Escribir comprobante (si se proveyó)
    if (comprobanteFile && comprobanteFile.size > 0) {
      const buf = await comprobanteFile.arrayBuffer()
      writeFileSync(comprobantePath, Buffer.from(buf))
    }

    const firmaArg       = existsSync(firmaPath)       ? firmaPath       : ''
    const comprobanteArg = existsSync(comprobantePath) ? comprobantePath : ''

    execSync(
      `python3 "${SCRIPT_PATH}" "${datosPath}" "${firmaArg}" "${comprobanteArg}" "${outputPath}"`,
      { timeout: 90_000 }
    )

    if (!existsSync(outputPath)) {
      throw new Error('El script Python no generó el archivo de salida')
    }

    const resultBuf = readFileSync(outputPath)
    const denominaciones = (datos.denominaciones as string[] | undefined) ?? []
    const slug = (denominaciones[0] ?? 'reserva')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
    const fileName = `presentacion_reserva_${slug}.pdf`

    return new NextResponse(resultBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    console.error('[preparar-reserva-sas] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
