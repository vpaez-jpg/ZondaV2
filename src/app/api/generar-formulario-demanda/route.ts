// GET /api/generar-formulario-demanda?tramiteId=...
//
// Genera el formulario de ingreso de demandas del Poder Judicial (PDF)
// completando los datos del actor con la información aportada por el cliente.
//
// Selección de template:
//   tipo=ART9      + jurisdiccion=mendoza      → formulario_mendoza_art9.pdf
//   tipo=ART9      + jurisdiccion=san_rafael   → formulario_san_rafael_art9.pdf
//   tipo=GANANCIAS + jurisdiccion=mendoza      → formulario_mendoza_ganancias.pdf
//   tipo=GANANCIAS + jurisdiccion=san_rafael   → formulario_san_rafael_ganancias.pdf
//
// Campos completados:
//   Mendoza    → III. Apellido y Nombre, Tipo y Nº Doc/CUIT, Domicilio real
//   San Rafael → 4. Actores (Nombre + DNI), Fecha

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { execSync }                  from 'child_process'
import { writeFileSync, mkdirSync }  from 'fs'
import { join }                      from 'path'
import { randomUUID }                from 'crypto'
import { tmpdir }                    from 'os'

export const dynamic = 'force-dynamic'

const TEMPLATES_DIR = join(process.cwd(), 'public', 'formularios')
const SCRIPT_PATH   = join(process.cwd(), 'src', 'app', 'api', 'generar-formulario-demanda', 'fill_formulario.py')

function templatePath(tipo: string, jurisdiccion: string): string {
  const tipoLower = tipo.toLowerCase()          // 'art9' | 'ganancias'
  const jurLower  = jurisdiccion.toLowerCase()  // 'mendoza' | 'san_rafael'
  return join(TEMPLATES_DIR, `formulario_${jurLower}_${tipoLower}.pdf`)
}

function formType(jurisdiccion: string): 'mendoza' | 'san_rafael' {
  return jurisdiccion === 'san_rafael' ? 'san_rafael' : 'mendoza'
}

function today(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}/${mm}/${yy}`
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
    .select('id, tipo, datos_cliente, datos_propuesta')
    .eq('id', tramiteId)
    .single()

  if (tErr || !tramite) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const datos       = (tramite.datos_cliente   ?? {}) as Record<string, unknown>
  const propuesta   = (tramite.datos_propuesta ?? {}) as Record<string, unknown>
  const tipo        = String(tramite.tipo ?? '').toUpperCase()     // 'ART9' | 'GANANCIAS'
  const jurisdiccion = String(propuesta.jurisdiccion ?? '')         // 'mendoza' | 'san_rafael'

  if (!jurisdiccion) return NextResponse.json({ error: 'Jurisdicción no configurada en el trámite' }, { status: 400 })
  if (!['ART9', 'GANANCIAS'].includes(tipo)) return NextResponse.json({ error: 'Tipo de trámite no soportado' }, { status: 400 })

  const nombre    = String(datos.nombre_completo ?? '').trim().toUpperCase()
  const dni       = String(datos.dni       ?? '').trim()
  const cuitCuil  = String(datos.cuit_cuil ?? dni).trim()
  const domicilio = String(datos.domicilio ?? '').trim()
  const tipoDoc   = cuitCuil ? `DNI: ${dni} / CUIT-CUIL: ${cuitCuil}` : `DNI: ${dni}`

  const tplPath = templatePath(tipo, jurisdiccion)
  const fType   = formType(jurisdiccion)

  // Payload para el script Python
  const payload = {
    template:  tplPath,
    form_type: fType,
    nombre,
    tipo_doc:  fType === 'mendoza' ? tipoDoc : dni,
    domicilio: fType === 'mendoza' ? domicilio : '',
    fecha:     fType === 'san_rafael' ? today() : '',
  }

  try {
    const result = execSync(
      `python3 ${SCRIPT_PATH}`,
      {
        input:   JSON.stringify(payload),
        timeout: 30_000,
        maxBuffer: 20 * 1024 * 1024,
      }
    )

    const nombreLimpio = nombre.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
    const filename = `Formulario_${tipo}_${jurisdiccion}_${nombreLimpio}.pdf`

    return new NextResponse(new Uint8Array(result), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error generando PDF: ${msg}` }, { status: 500 })
  }
}
