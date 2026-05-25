// generar-edicto-sas/route.ts
// Genera el texto del Edicto para publicación de una SAS.
// Acepta: GET ?tramiteId=xxx&fechaActa=DD/MM/AAAA
//
// Variables simples:    {{DENOMINACION_SAS}}, {{TITULO_SOCIOS}}, {{FRASE_SUSCRIPTORES}},
//                       {{FECHA_ACTA}}, {{SEDE_SOCIAL}}, {{OBJETO_SOCIAL}},
//                       {{CAPITAL_SOCIAL}}, {{CANTIDAD_ACCIONES}},
//                       {{ADMINISTRADOR_TITULAR}}, {{ADMINISTRADOR_SUPLENTE}}
// Variables de socio:   {{ s.nombre }}, {{ s.doc_string }}, {{ s.edad }},
//                       {{ s.nacionalidad }}, {{ s.nacido_a }}, {{ s.fecha_nacimiento }},
//                       {{ s.profesion }}, {{ s.estado_civil }}, {{ s.domicilio }},
//                       {{ s.email }}, {{ s.acciones_letras }}, {{ s.acciones_susc }}

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
  'src/app/api/generar-edicto-sas/plantilla_edicto_sas.docx'
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
  porcentaje?: unknown
}

interface Socio {
  nombre: string
  doc_string: string       // "DNI Nº 34.567.890, CUIT Nº 20-..." ó "CDI 27-..."
  edad: string
  nacido_a: string         // "nacido" / "nacida"
  nacionalidad: string
  fecha_nacimiento: string
  profesion: string
  estado_civil: string
  domicilio: string
  email: string
  acciones_susc: string    // número de acciones (entero)
  acciones_letras: string  // letras femeninas: "siete mil", "tres mil quinientas"
  porcentaje: string       // "50.00%" (para reserva, reutilizable)
}

interface AdminData {
  nombre: string
  fecha_nacimiento_formateada?: string
  fecha_nacimiento: string
}

// ── Helpers de texto ───────────────────────────────────────────
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

/** Formatea DNI con puntos: "34567890" → "34.567.890" */
function formatDNI(dni: string): string {
  const digits = dni.replace(/\D/g, '')
  if (digits.length === 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  return dni
}

/** Nacido/nacida según prefijo CUIT/CDI (27 = femenino) */
function nacidoA(cuit: string): string {
  const prefix = cuit.replace(/\D/g, '').substring(0, 2)
  return prefix === '27' ? 'nacida' : 'nacido'
}

/** String de documento: argentinos tienen DNI + CUIT, extranjeros solo CDI */
function buildDocString(dni: string, cuit: string, nacionalidad: string): string {
  const esArgentino = /argentin/i.test(nacionalidad)
  if (esArgentino && dni) {
    return `DNI Nº ${formatDNI(dni)}, CUIT Nº ${cuit}`
  }
  return `CDI ${cuit}`
}

/** Edad a partir de fecha ISO (YYYY-MM-DD) */
function calcularEdad(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const hoy = new Date()
  let edad = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--
  return edad
}

// ── Número en letras (femenino — para "acciones") ──────────────
function numeroEnLetras(n: number): string {
  if (n === 0) return 'cero'
  if (n < 0) return 'menos ' + numeroEnLetras(-n)
  return convertirPositivo(n)
}

function convertirPositivo(n: number): string {
  if (n >= 1_000_000) {
    const mill = Math.floor(n / 1_000_000)
    const resto = n % 1_000_000
    const millStr = mill === 1 ? 'un millón' : convertirPositivo(mill) + ' millones'
    return resto > 0 ? millStr + ' ' + convertirPositivo(resto) : millStr
  }
  if (n >= 1_000) {
    const miles = Math.floor(n / 1_000)
    const resto = n % 1_000
    const milesStr = miles === 1 ? 'mil' : menosMil(miles, false) + ' mil'
    return resto > 0 ? milesStr + ' ' + menosMil(resto, true) : milesStr
  }
  return menosMil(n, true)
}

/** Convierte 1-999 a texto. femenino=true para concordar con "acciones" */
function menosMil(n: number, femenino: boolean): string {
  if (n === 0) return ''

  const uniF = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
    'dieciocho', 'diecinueve', 'veinte']
  const uniM = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
    'dieciocho', 'diecinueve', 'veinte']
  const dec  = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa']
  const centF = ['', 'cien', 'doscientas', 'trescientas', 'cuatrocientas', 'quinientas',
    'seiscientas', 'setecientas', 'ochocientas', 'novecientas']
  const centM = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

  if (n <= 20) return femenino ? uniF[n] : uniM[n]

  if (n < 30) {
    const veintiF = ['', 'veintiuna', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
      'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
    const veintiM = ['', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
      'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
    return femenino ? veintiF[n - 20] : veintiM[n - 20]
  }

  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10
    if (u === 0) return dec[d]
    return dec[d] + ' y ' + (femenino ? uniF[u] : uniM[u])
  }

  const c = Math.floor(n / 100), resto = n % 100
  const centStr = femenino ? centF[c] : centM[c]
  const base = c === 1 && resto > 0 ? 'ciento' : centStr
  return resto === 0 ? base : base + ' ' + menosMil(resto, femenino)
}

// ── Loops (idéntico al route del estatuto) ─────────────────────
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
    .split('{{ s.acciones_susc }}').join(escXml(socio.acciones_susc))
    .split('{{ s.acciones_letras }}').join(escXml(socio.acciones_letras))
    .split('{{ s.porcentaje }}').join(escXml(socio.porcentaje))
}

function resolveConditions(text: string, isLast: boolean): string {
  text = text.replace(
    /\{%\s*if not loop\.last\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_, whenNotLast, whenLast) => isLast ? whenLast : whenNotLast
  )
  text = text.replace(
    /\{%\s*if not loop\.last\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_, whenNotLast) => isLast ? '' : whenNotLast
  )
  return text
}

function expandInlineLoop(wt: string, socios: Socio[]): string {
  return wt.replace(
    /\{%\s*for s in socios\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (_, innerTemplate) => {
      return socios.map((socio, i) => {
        let expanded = replaceSocioVars(innerTemplate, socio)
        expanded = resolveConditions(expanded, i === socios.length - 1)
        return expanded
      }).join('')
    }
  )
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
  const fechaActa = req.nextUrl.searchParams.get('fechaActa') ?? ''
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
  const denominacion   = denominaciones[0] ?? 'DENOMINACIÓN PENDIENTE'
  const sedeSocial     = String(datos.sede_social   ?? '')
  const objetoSocial   = String(datos.objeto_social ?? '')
  const capitalNum     = Number(datos.capital_social ?? 0)
  const capital        = capitalNum.toLocaleString('es-AR')
  const cantAcciones   = (capitalNum / 100).toLocaleString('es-AR')

  // Socios
  const rawSocios = (datos.socios as SocioRaw[] | undefined) ?? []
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
      acciones_susc:   accionesNum.toLocaleString('es-AR'),
      acciones_letras: numeroEnLetras(accionesNum),
      porcentaje:      pct,
    }
  })

  // Variables plurales / singulares
  const tituloSocios = socios.length === 1 ? 'Socio' : 'Socios'

  let fraseSuscriptores: string
  if (socios.length === 1) {
    fraseSuscriptores = `El Socio ${socios[0].nombre} suscribe`
  } else {
    const nombres = socios.map(s => s.nombre)
    const ultimoNombre = nombres.pop()!
    fraseSuscriptores = `Los Socios ${nombres.join(', ')} y ${ultimoNombre} suscriben`
  }

  // Admin
  function buildAdmin(raw: Record<string, unknown> | undefined) {
    return {
      nombre: String(raw?.nombre ?? ''),
      fecha_nacimiento: String(raw?.fecha_nacimiento ?? ''),
      fecha_nacimiento_formateada: raw?.fecha_nacimiento_formateada
        ? String(raw.fecha_nacimiento_formateada) : undefined,
    } as AdminData
  }
  const adminT = buildAdmin(datos.administrador_titular as Record<string, unknown> | undefined)
  const adminS = buildAdmin(datos.administrador_suplente as Record<string, unknown> | undefined)

  // 4. Procesar template
  const tmpDir     = join(tmpdir(), `edicto_${randomUUID()}`)
  const docxPath   = join(tmpDir, 'output.docx')
  const unpackDir  = join(tmpDir, 'unpacked')
  mkdirSync(unpackDir, { recursive: true })

  try {
    writeFileSync(docxPath, readFileSync(TEMPLATE_PATH))
    execSync(`unzip -o -q "${docxPath}" -d "${unpackDir}"`)

    const xmlPath = join(unpackDir, 'word', 'document.xml')
    let xml = readFileSync(xmlPath, 'utf8')

    // Expandir loops inline
    xml = xml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs, content) => {
      if (!content.includes('{% for') && !content.includes('{%for')) return match
      const expanded = expandInlineLoop(content, socios)
      return `<w:t${attrs}>${expanded}</w:t>`
    })

    // Variables simples
    xml = replaceVar(xml, 'DENOMINACION_SAS',       denominacion)
    xml = replaceVar(xml, 'TITULO_SOCIOS',           tituloSocios)
    xml = replaceVar(xml, 'FRASE_SUSCRIPTORES',      fraseSuscriptores)
    xml = replaceVar(xml, 'FECHA_ACTA',              fechaActa)
    xml = replaceVar(xml, 'SEDE_SOCIAL',             sedeSocial)
    xml = replaceVar(xml, 'OBJETO_SOCIAL',           objetoSocial)
    xml = replaceVar(xml, 'CAPITAL_SOCIAL',          capital)
    xml = replaceVar(xml, 'CANTIDAD_ACCIONES',       cantAcciones)
    xml = replaceVar(xml, 'ADMINISTRADOR_TITULAR',   adminT.nombre)
    xml = replaceVar(xml, 'ADMINISTRADOR_SUPLENTE',  adminS.nombre)

    writeFileSync(xmlPath, xml, 'utf8')

    const outputDocx = join(tmpDir, 'edicto_sas.docx')
    execSync(`cd "${unpackDir}" && zip -r -q "${outputDocx}" .`)

    const resultBuf = readFileSync(outputDocx)
    const slug = denominacion.replace(/\s+/g, '_').toLowerCase()
    const fileName = `edicto_${slug}_${new Date().toISOString().slice(0, 10)}.docx`

    return new NextResponse(resultBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    console.error('[generar-edicto-sas] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
