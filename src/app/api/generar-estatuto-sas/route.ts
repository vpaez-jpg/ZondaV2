import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

// ── Template path ──────────────────────────────────────────────
const TEMPLATE_PATH = join(process.cwd(), 'src/app/api/generar-estatuto-sas/plantilla_sas_maestra.docx')

// ── Tipos internos ─────────────────────────────────────────────
interface Socio {
  nombre: string
  dni: string
  cuit: string
  edad: number
  nacionalidad: string
  fecha_nacimiento: string
  fecha_nacimiento_formateada?: string
  profesion: string
  estado_civil: string
  domicilio: string
  email: string
  acciones_susc: number
  porcentaje: string  // e.g. "50.00%"
}

interface AdminData {
  nombre: string
  dni: string
  cuit: string
  edad: number
  nacionalidad: string
  fecha_nacimiento: string
  fecha_nacimiento_formateada?: string
  profesion: string
  estado_civil: string
  domicilio: string
  email: string
  domicilio_constituido: string
}

// ── Sustitución de variables simples {{VAR}} ───────────────────
function replaceVar(xml: string, key: string, value: string): string {
  // Escape special regex chars in key
  return xml.split(`{{${key}}}`).join(escXml(value))
}

// Escape XML special characters
function escXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── Sustitución de variables de socio {{ s.FIELD }} ────────────
function replaceSocioVars(template: string, socio: Socio): string {
  return template
    .split('{{ s.nombre }}').join(escXml(socio.nombre))
    .split('{{ s.dni }}').join(escXml(socio.dni))
    .split('{{ s.cuit }}').join(escXml(socio.cuit))
    .split('{{ s.edad }}').join(escXml(String(socio.edad)))
    .split('{{ s.nacionalidad }}').join(escXml(socio.nacionalidad))
    .split('{{ s.fecha_nacimiento }}').join(escXml(socio.fecha_nacimiento_formateada ?? socio.fecha_nacimiento))
    .split('{{ s.profesion }}').join(escXml(socio.profesion))
    .split('{{ s.estado_civil }}').join(escXml(socio.estado_civil))
    .split('{{ s.domicilio }}').join(escXml(socio.domicilio))
    .split('{{ s.email }}').join(escXml(socio.email))
    .split('{{ s.acciones_susc }}').join(escXml(String(socio.acciones_susc)))
    .split('{{ s.porcentaje }}').join(escXml(socio.porcentaje))
}

// ── Expandir condiciones if/else dentro de un loop ─────────────
// Handles: {% if not loop.last %}A{% endif %}
//          {% if not loop.last %}A{% else %}B{% endif %}
function resolveConditions(text: string, isLast: boolean): string {
  // Pattern: {% if not loop.last %}A{% else %}B{% endif %}
  text = text.replace(
    /\{%\s*if not loop\.last\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_, whenNotLast, whenLast) => isLast ? whenLast : whenNotLast
  )
  // Pattern: {% if not loop.last %}A{% endif %} (no else)
  text = text.replace(
    /\{%\s*if not loop\.last\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_, whenNotLast) => isLast ? '' : whenNotLast
  )
  return text
}

// ── Expandir loop inline dentro de un <w:t> ───────────────────
// Finds {% for s in socios %}...{% endfor %} and expands it
function expandInlineLoop(wt: string, socios: Socio[]): string {
  // Find for-endfor block inside a text node value
  return wt.replace(
    /\{%\s*for s in socios\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (_, innerTemplate) => {
      return socios.map((socio, i) => {
        const isLast = i === socios.length - 1
        let expanded = replaceSocioVars(innerTemplate, socio)
        expanded = resolveConditions(expanded, isLast)
        return expanded
      }).join('')
    }
  )
}

// ── Expandir loop multi-párrafo ────────────────────────────────
// Finds <w:p> containing {%for s in socios %}, the content paragraphs,
// and <w:p> containing {% endfor %}, then repeats content paras for each socio
function expandMultiParaLoop(xml: string, socios: Socio[]): string {
  // Find paragraph that contains the for marker
  const forMarker = '{%for s in socios %}'
  const endMarker = '{% endfor %}'

  const posFor    = xml.indexOf(forMarker)
  const posEndfor = xml.indexOf(endMarker, posFor)
  if (posFor < 0 || posEndfor < 0) return xml  // no loop found

  // Find full <w:p>...</w:p> boundaries
  const paraStartFor    = xml.lastIndexOf('<w:p ', posFor)
  const paraEndFor      = xml.indexOf('</w:p>', posFor) + '</w:p>'.length
  const paraStartEndfor = xml.lastIndexOf('<w:p ', posEndfor)
  const paraEndEndfor   = xml.indexOf('</w:p>', posEndfor) + '</w:p>'.length

  // Content paragraphs sit between the for-para and the endfor-para
  const contentBlock = xml.slice(paraEndFor, paraStartEndfor)

  // For each socio, replace {{ s.FIELD }} in a copy of contentBlock
  const expanded = socios.map((socio) => {
    return replaceSocioVars(contentBlock, socio)
  }).join('')

  // Replace the entire for-block (for-para + content + endfor-para) with expanded
  const fullBlock = xml.slice(paraStartFor, paraEndEndfor)
  return xml.replace(fullBlock, expanded)
}

// ── Route principal ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // 1. Auth: solo Zonda — usamos service role para el lookup de perfiles (evita RLS)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const adminDb = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: perfil } = await adminDb
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()
  if (!perfil || perfil.rol !== 'zonda') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  // 2. Obtener tramiteId y datos
  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  if (!tramiteId) return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })

  const { data: tramite, error: dbError } = await supabase
    .from('tramites')
    .select('datos_cliente')
    .eq('id', tramiteId)
    .single()

  if (dbError || !tramite) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })

  const datos = tramite.datos_cliente as Record<string, unknown>
  if (!datos) return NextResponse.json({ error: 'El cliente aún no completó sus datos' }, { status: 422 })

  // 3. Extraer datos del formulario
  const denominaciones = (datos.denominaciones as string[] | undefined) ?? []
  const denominacion   = denominaciones[0] ?? 'DENOMINACIÓN PENDIENTE'
  const sedeSocial     = String(datos.sede_social    ?? '')
  const objetoSocial   = String(datos.objeto_social  ?? '')
  const capitalNum     = Number(datos.capital_social ?? 0)
  const capital        = capitalNum.toLocaleString('es-AR')
  const cantAcciones   = String(capitalNum / 100)

  const hoy = new Date()
  const fecha = hoy.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  // Build socios array
  const rawSocios = (datos.socios as Record<string, unknown>[] | undefined) ?? []
  const socios: Socio[] = rawSocios.map(s => ({
    nombre:                String(s.nombre  ?? ''),
    dni:                   String(s.dni     ?? ''),
    cuit:                  String(s.cuit    ?? ''),
    edad:                  Number(s.edad    ?? 0),
    nacionalidad:          String(s.nacionalidad ?? 'argentina'),
    fecha_nacimiento:      String(s.fecha_nacimiento ?? ''),
    fecha_nacimiento_formateada: s.fecha_nacimiento_formateada ? String(s.fecha_nacimiento_formateada) : undefined,
    profesion:             String(s.profesion    ?? ''),
    estado_civil:          String(s.estado_civil ?? ''),
    domicilio:             String(s.domicilio    ?? ''),
    email:                 String(s.email        ?? ''),
    acciones_susc:         Number(s.acciones_susc ?? 0),
    porcentaje:            String(s.porcentaje   ?? '0%'),
  }))

  // Build admin fields helper
  function buildAdmin(raw: Record<string, unknown> | undefined): AdminData {
    return {
      nombre:                String(raw?.nombre   ?? ''),
      dni:                   String(raw?.dni      ?? ''),
      cuit:                  String(raw?.cuit     ?? ''),
      edad:                  Number(raw?.edad     ?? 0),
      nacionalidad:          String(raw?.nacionalidad ?? 'argentina'),
      fecha_nacimiento:      String(raw?.fecha_nacimiento ?? ''),
      fecha_nacimiento_formateada: raw?.fecha_nacimiento_formateada ? String(raw.fecha_nacimiento_formateada) : undefined,
      profesion:             String(raw?.profesion    ?? ''),
      estado_civil:          String(raw?.estado_civil ?? ''),
      domicilio:             String(raw?.domicilio    ?? ''),
      email:                 String(raw?.email        ?? ''),
      domicilio_constituido: String(raw?.domicilio_constituido ?? ''),
    }
  }

  const adminT = buildAdmin(datos.administrador_titular as Record<string, unknown> | undefined)
  const adminS = buildAdmin(datos.administrador_suplente as Record<string, unknown> | undefined)

  // 4. Trabajar en directorio temporal
  const tmpDir = join(tmpdir(), `sas_${randomUUID()}`)
  mkdirSync(tmpDir, { recursive: true })

  const docxPath    = join(tmpDir, 'output.docx')
  const unpackedDir = join(tmpDir, 'unpacked')
  mkdirSync(unpackedDir, { recursive: true })

  try {
    // 4a. Copiar template y descomprimir
    const templateBuf = readFileSync(TEMPLATE_PATH)
    writeFileSync(docxPath, templateBuf)
    execSync(`unzip -o -q "${docxPath}" -d "${unpackedDir}"`)

    // 4b. Leer document.xml
    const xmlPath = join(unpackedDir, 'word', 'document.xml')
    let xml = readFileSync(xmlPath, 'utf8')

    // 4c. Expansión de loops (antes de reemplazar variables simples)
    // ── Loop multi-párrafo: beneficiario final ──────────────────
    xml = expandMultiParaLoop(xml, socios)

    // ── Loops inline en <w:t> ───────────────────────────────────
    // Process each <w:t>...</w:t> node that contains for loops
    xml = xml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs, content) => {
      if (!content.includes('{% for') && !content.includes('{%for')) return match
      const expanded = expandInlineLoop(content, socios)
      return `<w:t${attrs}>${expanded}</w:t>`
    })

    // 4d. Reemplazar variables simples {{VAR}}
    xml = replaceVar(xml, 'DENOMINACION_SAS', denominacion)
    xml = replaceVar(xml, 'FECHA', fecha)
    xml = replaceVar(xml, 'CAPITAL_SOCIAL', capital)
    xml = replaceVar(xml, 'CANTIDAD_ACCIONES', cantAcciones)
    xml = replaceVar(xml, 'SEDE_SOCIAL', sedeSocial)

    // Admin Titular
    xml = replaceVar(xml, 'ADMINISTRADOR_TITULAR',            adminT.nombre)
    xml = replaceVar(xml, 'DNI_ADMINISTRADOR_TITULAR',        adminT.dni)
    xml = replaceVar(xml, 'CUIT_ADMINISTRADOR_TITULAR',       adminT.cuit)
    xml = replaceVar(xml, 'EDAD_ADMINISTRADOR_TITULAR',       String(adminT.edad))
    xml = replaceVar(xml, 'NACIONALIDAD_ADMINISTRADOR_TITULAR',     adminT.nacionalidad)
    xml = replaceVar(xml, 'FECHA_NACIMIENTO_ADMINISTRADOR_TITULAR', adminT.fecha_nacimiento_formateada ?? adminT.fecha_nacimiento)
    xml = replaceVar(xml, 'PROFESION_ADMINISTRADOR_TITULAR',  adminT.profesion)
    xml = replaceVar(xml, 'ESTADO_CIVIL_ADMINISTRADOR_TITULAR', adminT.estado_civil)
    xml = replaceVar(xml, 'DOMICILIO_ADMINISTRADOR_TITULAR',  adminT.domicilio)
    xml = replaceVar(xml, 'EMAIL_ADMINISTRADOR_TITULAR',      adminT.email)

    // Admin Suplente
    xml = replaceVar(xml, 'ADMINISTRADOR_SUPLENTE',            adminS.nombre)
    xml = replaceVar(xml, 'DNI_ADMINISTRADOR_SUPLENTE',        adminS.dni)
    xml = replaceVar(xml, 'CUIT_ADMINISTRADOR_SUPLENTE',       adminS.cuit)
    xml = replaceVar(xml, 'EDAD_ADMINISTRADOR_SUPLENTE',       String(adminS.edad))
    xml = replaceVar(xml, 'NACIONALIDAD_ADMINISTRADOR_SUPLENTE',     adminS.nacionalidad)
    xml = replaceVar(xml, 'FECHA_NACIMIENTO_ADMINISTRADOR_SUPLENTE', adminS.fecha_nacimiento_formateada ?? adminS.fecha_nacimiento)
    xml = replaceVar(xml, 'PROFESION_ADMINISTRADOR_SUPLENTE',  adminS.profesion)
    xml = replaceVar(xml, 'ESTADO_CIVIL_ADMINISTRADOR_SUPLENTE', adminS.estado_civil)
    xml = replaceVar(xml, 'DOMICILIO_ADMINISTRADOR_SUPLENTE',  adminS.domicilio)
    xml = replaceVar(xml, 'EMAIL_ADMINISTRADOR_SUPLENTE',      adminS.email)

    // 4e. Escribir document.xml modificado
    writeFileSync(xmlPath, xml, 'utf8')

    // 4f. Reempaquetar como DOCX (ZIP)
    const outputDocx = join(tmpDir, 'estatuto_sas.docx')
    execSync(`cd "${unpackedDir}" && zip -r -q "${outputDocx}" .`)

    // 4g. Leer y devolver
    const resultBuf = readFileSync(outputDocx)
    const clienteName = String(denominaciones[0] ?? 'sas').replace(/\s+/g, '_').toLowerCase()
    const fileName = `estatuto_${clienteName}_${new Date().toISOString().slice(0, 10)}.docx`

    return new NextResponse(resultBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })

  } catch (err) {
    console.error('[generar-estatuto-sas] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    // Limpiar archivos temporales
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
