// generar-reserva-sas/route.ts
// Genera la Reserva de Denominación Social para una SAS.
// Acepta: GET ?tramiteId=xxx
//
// Variables simples:   {{DIA}}, {{MES}}, {{ANIO}},
//                      {{DENOMINACION_1}}, {{DENOMINACION_2}}, {{DENOMINACION_3}},
//                      {{FRASE_SOCIOS_FUNDADORES}}, {{FRASE_SALUDO}}
// Variables de socio:  {{ s.nombre }}, {{ s.doc_string }}, {{ s.edad }},
//                      {{ s.nacido_a }}, {{ s.nacionalidad }}, {{ s.fecha_nacimiento }},
//                      {{ s.profesion }}, {{ s.estado_civil }}, {{ s.domicilio }},
//                      {{ s.email }}, {{ s.porcentaje }}
// Mecanismo de loop:   multi-párrafo {%for s in socios %}...{% endfor %}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

const TEMPLATE_PATH = join(
  process.cwd(),
  'src/app/api/generar-reserva-sas/plantilla_reserva_sas.docx'
)

// ── Tipos ──────────────────────────────────────────────────────
interface SocioRaw {
  nombre?: unknown
  dni?: unknown
  cuit?: unknown
  fecha_nacimiento?: unknown
  fecha_nacimiento_formateada?: unknown
  nacionalidad?: unknown
  estado_civil?: unknown
  profesion?: unknown
  domicilio?: unknown
  email?: unknown
  cantidad_acciones?: unknown
  acciones_susc?: unknown
}

interface Socio {
  nombre: string
  doc_string: string
  edad: string
  nacido_a: string
  nacionalidad: string
  fecha_nacimiento: string
  profesion: string
  estado_civil: string
  domicilio: string
  email: string
  porcentaje: string
}

// ── Helpers ────────────────────────────────────────────────────
function escXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function replaceVar(xml: string, key: string, value: string): string {
  return xml.split(`{{${key}}}`).join(escXml(value))
}

function formatDNI(dni: string): string {
  const digits = dni.replace(/\D/g, '')
  if (digits.length === 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  return dni
}

function nacidoA(cuit: string): string {
  return cuit.replace(/\D/g, '').substring(0, 2) === '27' ? 'nacida' : 'nacido'
}

function buildDocString(dni: string, cuit: string, nacionalidad: string): string {
  return /argentin/i.test(nacionalidad) && dni
    ? `DNI Nº ${formatDNI(dni)}, CUIT Nº ${cuit}`
    : `CDI ${cuit}`
}

function calcularEdad(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const hoy = new Date()
  let edad = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--
  return edad
}

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

// ── Reemplazar variables de socio en bloque de párrafo ─────────
function replaceSocioVars(template: string, socio: Socio): string {
  return template
    .split('{{ s.nombre }}').join(escXml(socio.nombre))
    .split('{{ s.doc_string }}').join(escXml(socio.doc_string))
    .split('{{ s.edad }}').join(escXml(socio.edad))
    .split('{{ s.nacido_a }}').join(escXml(socio.nacido_a))
    .split('{{ s.nacionalidad }}').join(escXml(socio.nacionalidad))
    .split('{{ s.fecha_nacimiento }}').join(escXml(socio.fecha_nacimiento))
    .split('{{ s.profesion }}').join(escXml(socio.profesion))
    .split('{{ s.estado_civil }}').join(escXml(socio.estado_civil))
    .split('{{ s.domicilio }}').join(escXml(socio.domicilio))
    .split('{{ s.email }}').join(escXml(socio.email))
    .split('{{ s.porcentaje }}').join(escXml(socio.porcentaje))
}

// ── Loop multi-párrafo (mismo patrón que estatuto) ─────────────
// Busca el párrafo con {%for s in socios %}, repite el bloque de párrafos
// intermedios para cada socio, y elimina los párrafos marcadores.
function expandMultiParaLoop(xml: string, socios: Socio[]): string {
  const forMarker = '{%for s in socios %}'
  const endMarker = '{% endfor %}'

  const posFor    = xml.indexOf(forMarker)
  const posEnd    = xml.indexOf(endMarker, posFor)
  if (posFor < 0 || posEnd < 0) return xml

  const paraStartFor  = xml.lastIndexOf('<w:p ', posFor)
  const paraEndFor    = xml.indexOf('</w:p>', posFor) + '</w:p>'.length
  const paraStartEnd  = xml.lastIndexOf('<w:p ', posEnd)
  const paraEndEnd    = xml.indexOf('</w:p>', posEnd) + '</w:p>'.length

  const contentBlock = xml.slice(paraEndFor, paraStartEnd)

  const expanded = socios.map(socio => replaceSocioVars(contentBlock, socio)).join('')

  const fullBlock = xml.slice(paraStartFor, paraEndEnd)
  return xml.replace(fullBlock, expanded)
}

// ── Route principal ────────────────────────────────────────────
export async function GET(req: NextRequest) {
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

  const { data: tramite, error: dbError } = await supabase
    .from('tramites').select('datos_cliente').eq('id', tramiteId).single()
  if (dbError || !tramite)
    return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const datos = tramite.datos_cliente as Record<string, unknown>
  if (!datos)
    return NextResponse.json({ error: 'El cliente aún no completó sus datos' }, { status: 422 })

  // 3. Extraer datos
  const denominaciones = (datos.denominaciones as string[] | undefined) ?? []
  const den1 = denominaciones[0] ?? 'DENOMINACIÓN 1'
  const den2 = denominaciones[1] ?? 'DENOMINACIÓN 2'
  const den3 = denominaciones[2] ?? 'DENOMINACIÓN 3'

  const capitalNum = Number(datos.capital_social ?? 0)
  const rawSocios  = (datos.socios as SocioRaw[] | undefined) ?? []

  const socios: Socio[] = rawSocios.map(s => {
    const nombre       = String(s.nombre ?? '')
    const dni          = String(s.dni    ?? '')
    const cuit         = String(s.cuit   ?? '')
    const nacionalidad = String(s.nacionalidad ?? 'argentina')
    const fechaRaw     = String(s.fecha_nacimiento ?? '')
    const fechaFmt     = s.fecha_nacimiento_formateada
      ? String(s.fecha_nacimiento_formateada)
      : fechaRaw
    const accionesNum  = Number(s.cantidad_acciones ?? s.acciones_susc ?? 0)
    const totalAcc     = capitalNum / 100
    const pct          = totalAcc > 0
      ? ((accionesNum / totalAcc) * 100).toFixed(2) + '%'
      : '0%'

    return {
      nombre,
      doc_string:      buildDocString(dni, cuit, nacionalidad),
      edad:            fechaRaw ? String(calcularEdad(fechaRaw)) : '',
      nacido_a:        nacidoA(cuit),
      nacionalidad,
      fecha_nacimiento: fechaFmt,
      profesion:       String(s.profesion    ?? ''),
      estado_civil:    String(s.estado_civil ?? ''),
      domicilio:       String(s.domicilio    ?? ''),
      email:           String(s.email        ?? ''),
      porcentaje:      pct,
    }
  })

  // Frases singular/plural
  const fraseSocios = socios.length === 1
    ? 'cuyo socio fundador será la siguiente persona'
    : 'cuyos socios fundadores serán las siguientes personas'

  const fraseSaludo = socios.length === 1 ? 'saluda' : 'saludan'

  // Fecha de hoy
  const hoy = new Date()
  const dia  = String(hoy.getDate()).padStart(2, '0')
  const mes  = MESES[hoy.getMonth()]
  const anio = String(hoy.getFullYear())

  // 4. Procesar template
  const tmpDir    = join(tmpdir(), `reserva_${randomUUID()}`)
  const docxPath  = join(tmpDir, 'output.docx')
  const unpackDir = join(tmpDir, 'unpacked')
  mkdirSync(unpackDir, { recursive: true })

  try {
    writeFileSync(docxPath, readFileSync(TEMPLATE_PATH))
    execSync(`unzip -o -q "${docxPath}" -d "${unpackDir}"`)

    const xmlPath = join(unpackDir, 'word', 'document.xml')
    let xml = readFileSync(xmlPath, 'utf8')

    // Loop multi-párrafo de socios
    xml = expandMultiParaLoop(xml, socios)

    // Variables simples
    xml = replaceVar(xml, 'DIA',                  dia)
    xml = replaceVar(xml, 'MES',                  mes)
    xml = replaceVar(xml, 'ANIO',                 anio)
    xml = replaceVar(xml, 'DENOMINACION_1',       den1)
    xml = replaceVar(xml, 'DENOMINACION_2',       den2)
    xml = replaceVar(xml, 'DENOMINACION_3',       den3)
    xml = replaceVar(xml, 'FRASE_SOCIOS_FUNDADORES', fraseSocios)
    xml = replaceVar(xml, 'FRASE_SALUDO',         fraseSaludo)

    writeFileSync(xmlPath, xml, 'utf8')

    const outputDocx = join(tmpDir, 'reserva_sas.docx')
    execSync(`cd "${unpackDir}" && zip -r -q "${outputDocx}" .`)

    const resultBuf = readFileSync(outputDocx)
    const slug = den1.replace(/\s+/g, '_').toLowerCase()
    const fileName = `reserva_${slug}_${new Date().toISOString().slice(0, 10)}.docx`

    return new NextResponse(resultBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    console.error('[generar-reserva-sas] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
