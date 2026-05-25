// GET /api/generar-nda?tramiteId=...
//
// Genera el DOCX del NDA a partir de los datos del cuestionario del cliente.
// Solo accesible por usuarios con rol 'zonda'.
//
// Formato: Times New Roman 12pt · Interlineado 1,5 · Justificado · Nº página al pie

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { execSync }                  from 'child_process'
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join }                      from 'path'
import { randomUUID }                from 'crypto'
import { tmpdir }                    from 'os'

// ── Constantes de formato ──────────────────────────────────────
// Todos los valores en twips (1 pt = 20 twips) o half-points (1 pt = 2 half-pts)
const FONT      = 'Times New Roman'
const SZ_BODY   = 24   // 12 pt  (half-points)
const SZ_H1     = 28   // 14 pt
const SZ_H2     = 24   // 12 pt  (bold diferencia del body)
const SZ_SMALL  = 18   // 9 pt   (notas al pie de documento)
const LINE_15   = 360  // interlineado 1,5 (auto, 240 = simple)
const SPC_AFTER = 160  // 8 pt espaciado posterior cuerpo
const SPC_AFTER_H1 = 120  // 6 pt después de título de sección
const SPC_BEF_H1   = 320  // 16 pt antes de título de sección
const SPC_BEF_H2   = 200  // 10 pt antes de subtítulo

// ── XML helpers ────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Genera un <w:p> con Times New Roman, interlineado 1,5 y espaciado posterior.
 * Por defecto el texto va justificado; los títulos/subtítulos se pasan con center:true.
 * NO se usan párrafos vacíos para espaciar — toda la separación viene de spaceAfter.
 */
function p(text: string, opts: {
  heading?: 1 | 2
  bold?: boolean
  center?: boolean
  spaceBefore?: number
  spaceAfter?: number
  fontSize?: number
  italic?: boolean
} = {}): string {
  const {
    heading,
    bold,
    center,
    spaceBefore = 0,
    spaceAfter  = heading === 1 ? SPC_AFTER_H1 : SPC_AFTER,
    fontSize    = heading === 1 ? SZ_H1 : heading === 2 ? SZ_H2 : SZ_BODY,
    italic,
  } = opts

  const spacing = `<w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="${LINE_15}" w:lineRule="auto"/>`

  let pPr: string
  if (heading === 1) {
    pPr = `<w:pPr>
      <w:pStyle w:val="Heading1"/>
      ${spacing}
      ${center ? '<w:jc w:val="center"/>' : ''}
    </w:pPr>`
  } else if (heading === 2) {
    pPr = `<w:pPr>
      <w:pStyle w:val="Heading2"/>
      ${spacing}
    </w:pPr>`
  } else {
    pPr = `<w:pPr>
      ${spacing}
      ${center ? '<w:jc w:val="center"/>' : '<w:jc w:val="both"/>'}
    </w:pPr>`
  }

  const isBold = bold || heading === 1 || heading === 2
  const rPr = `<w:rPr>
    ${isBold  ? '<w:b/><w:bCs/>' : ''}
    ${italic  ? '<w:i/><w:iCs/>' : ''}
    <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
    <w:sz w:val="${fontSize}"/>
    <w:szCs w:val="${fontSize}"/>
  </w:rPr>`

  const runs = text.split('\n').map((line, i) => {
    const br = i > 0 ? '<w:br/>' : ''
    return `${br}<w:r>${rPr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`
  }).join('')

  return `<w:p>${pPr}${runs}</w:p>`
}

// ── Estilos ────────────────────────────────────────────────────
function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          w:latentStyleCount="0">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
        <w:sz w:val="${SZ_BODY}"/>
        <w:szCs w:val="${SZ_BODY}"/>
        <w:lang w:val="es-AR" w:eastAsia="es-AR" w:bidi="ar-SA"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="${SPC_AFTER}" w:line="${LINE_15}" w:lineRule="auto"/>
        <w:jc w:val="both"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:jc w:val="both"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
      <w:sz w:val="${SZ_BODY}"/>
      <w:szCs w:val="${SZ_BODY}"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="${SPC_BEF_H1}" w:after="${SPC_AFTER_H1}" w:line="${LINE_15}" w:lineRule="auto"/>
      <w:keepNext/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
      <w:sz w:val="${SZ_H1}"/>
      <w:szCs w:val="${SZ_H1}"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="${SPC_BEF_H2}" w:after="${SPC_AFTER_H1}" w:line="${LINE_15}" w:lineRule="auto"/>
      <w:keepNext/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
      <w:sz w:val="${SZ_H2}"/>
      <w:szCs w:val="${SZ_H2}"/>
    </w:rPr>
  </w:style>
</w:styles>`
}

// ── Tipos de contenido (incluye footer) ───────────────────────
function buildContentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml"
    ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml"
    ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function buildRootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
    Target="docProps/core.xml"/>
  <Relationship Id="rId3"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"
    Target="docProps/app.xml"/>
</Relationships>`
}

// ── Relaciones del documento (estilos + footer) ───────────────
function buildWordRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"
    Target="footer.xml"/>
</Relationships>`
}

// ── Footer: número de página centrado ─────────────────────────
function buildFooterXml(): string {
  const rpr = `<w:rPr>
      <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
      <w:sz w:val="${SZ_BODY}"/>
      <w:szCs w:val="${SZ_BODY}"/>
    </w:rPr>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
      <w:spacing w:before="0" w:after="0" w:line="${LINE_15}" w:lineRule="auto"/>
    </w:pPr>
    <w:r>${rpr}<w:fldChar w:fldCharType="begin"/></w:r>
    <w:r>${rpr}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r>
    <w:r>${rpr}<w:t>1</w:t></w:r>
    <w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`
}

function buildCoreXml(title: string): string {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${esc(title)}</dc:title>
  <dc:creator>Zonda Legal</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
}

function buildAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Zonda Legal</Application>
</Properties>`
}

// ── Documento principal (referencia el footer en sectPr) ──────
function buildDocumentXml(paras: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  mc:Ignorable="w14">
  <w:body>
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1418" w:right="1134" w:bottom="1701" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
    .replace('<w:sectPr>', paras.join('\n') + '\n    <w:sectPr>')
}

// ── Constructor de contenido NDA ───────────────────────────────
type Datos = Record<string, unknown>

function str(v: unknown, fallback = '') { return String(v ?? fallback) }
function bool(v: unknown) { return v === true || v === 'true' }
function num(v: unknown, fallback = 0) { return Number(v ?? fallback) }

interface Parte {
  tipo:          string
  nombre:        string
  dni_cuit:      string
  domicilio:     string
  email:         string
  telefono:      string
  rep_legal:     string
  dni_cargo_rep: string
}

function buildNDAParagraphs(datos: Datos): string[] {
  const paras: string[] = []

  function add(para: string) { paras.push(para) }
  function h1(text: string) { add(p(text, { heading: 1, spaceBefore: SPC_BEF_H1 })) }
  function h2(text: string) { add(p(text, { heading: 2, spaceBefore: SPC_BEF_H2 })) }
  function body(text: string, spaceAfter?: number) {
    add(p(text, spaceAfter !== undefined ? { spaceAfter } : {}))
  }
  function note(text: string) { add(p(text, { italic: true })) }

  // ── Extraer datos ──
  const divulgadora = (datos.divulgadora ?? {}) as Parte
  const receptora   = (datos.receptora   ?? {}) as Parte

  const sector               = str(datos.sector, 'general')
  const tipoAcuerdo          = str(datos.tipo_acuerdo, 'unilateral')
  const incluirDescripcion   = bool(datos.incluir_descripcion)
  const descripcionProyecto  = str(datos.descripcion_proyecto)
  const propositoPermitido   = str(datos.proposito_permitido)
  const duracionConf         = str(datos.duracion_confidencialidad, '5')
  const proteccionPerpetua   = bool(datos.proteccion_perpetua_secretos)
  const retroactividad       = bool(datos.retroactividad)
  const ciudadFirma          = str(datos.ciudad_firma, 'Mendoza')
  const fechaFirma           = str(datos.fecha_firma)
  const noCompete            = bool(datos.incluir_no_compete)
  const duracionNoCompete    = str(datos.duracion_no_compete, '2')
  const nonSolicitation      = bool(datos.incluir_non_solicitation)
  const cesionPI             = bool(datos.incluir_cesion_pi)
  const noResiduales         = bool(datos.incluir_no_residuales)
  const noPublicidad         = bool(datos.incluir_no_publicidad)
  const montoPenal           = num(datos.monto_penal, 20000)
  const foro                 = str(datos.foro_resolucion, 'ordinario_mendoza')
  const mediacionPrevia      = bool(datos.incluir_mediacion_previa)
  const idioma               = str(datos.idioma, 'es')

  const esBilateral = tipoAcuerdo === 'bilateral'

  const sectorLabel: Record<string, string> = {
    tecnologia:              'Tecnología / Software',
    arquitectura:            'Arquitectura / Diseño',
    salud:                   'Salud / Medtech',
    comercio:                'Comercio / Retail',
    gastronomia:             'Gastronomía / Alimentos',
    servicios_profesionales: 'Servicios profesionales',
    manufactura:             'Manufactura / Industria',
    otro:                    'General',
  }

  const duracionLabel = duracionConf === 'indefinido'
    ? 'por tiempo indefinido'
    : duracionConf === '1'
    ? 'por el plazo de un (1) año'
    : `por el plazo de ${duracionConf === '5' ? 'cinco (5)' : 'dos (2)'} años`

  const fechaLabel = fechaFirma
    ? new Date(fechaFirma + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : `____ de __________ de ${new Date().getFullYear()}`

  const montoLabel = `USD ${montoPenal.toLocaleString('es-AR')} (Dólares Estadounidenses ${
    montoPenal === 10000 ? 'diez mil' : montoPenal === 20000 ? 'veinte mil' : 'treinta mil'
  })`

  const divIsJuridica = divulgadora.tipo === 'juridica'
  const recIsJuridica = receptora.tipo   === 'juridica'

  // ── PORTADA ──────────────────────────────────────────────────
  add(p(esBilateral
    ? 'ACUERDO DE CONFIDENCIALIDAD BILATERAL'
    : 'ACUERDO DE CONFIDENCIALIDAD',
    { heading: 1, center: true, spaceBefore: 0, fontSize: 32 }))
  add(p(`(Non-Disclosure Agreement${esBilateral ? ' — Bilateral' : ''})`,
    { center: true, italic: true, fontSize: SZ_BODY }))
  add(p(`Sector: ${sectorLabel[sector] ?? 'General'}`, { center: true }))
  add(p(`Ciudad: ${ciudadFirma}  ·  Fecha: ${fechaLabel}`, { center: true, spaceAfter: 320 }))

  if (idioma === 'bilingual' || idioma === 'en') {
    note('[Nota: Este documento se entrega en su versión en español. La versión en inglés será preparada por el equipo de Zonda Legal sobre la base de este borrador.]')
  }

  // ── 1. PARTES ─────────────────────────────────────────────────
  h1('1. Partes')
  body('El presente Acuerdo de Confidencialidad (en adelante, el "Acuerdo") se celebra entre:')

  body(
    `PARTE DIVULGADORA: ${divulgadora.nombre || '[NOMBRE DIVULGADORA]'}, ` +
    `${divIsJuridica ? 'CUIT' : 'DNI'} ${divulgadora.dni_cuit || '[DNI/CUIT]'}, ` +
    `con domicilio en ${divulgadora.domicilio || '[DOMICILIO]'}` +
    (divIsJuridica && divulgadora.rep_legal
      ? `, representada por ${divulgadora.rep_legal}` +
        (divulgadora.dni_cargo_rep ? `, en su carácter de ${divulgadora.dni_cargo_rep}` : '')
      : '') +
    (divulgadora.email ? `, correo: ${divulgadora.email}` : '') +
    ` (en adelante, "Parte Divulgadora" o "la Divulgadora").`
  )

  body(
    `PARTE RECEPTORA: ${receptora.nombre || '[NOMBRE RECEPTORA]'}, ` +
    `${recIsJuridica ? 'CUIT' : 'DNI'} ${receptora.dni_cuit || '[DNI/CUIT]'}, ` +
    `con domicilio en ${receptora.domicilio || '[DOMICILIO]'}` +
    (recIsJuridica && receptora.rep_legal
      ? `, representada por ${receptora.rep_legal}` +
        (receptora.dni_cargo_rep ? `, en su carácter de ${receptora.dni_cargo_rep}` : '')
      : '') +
    (receptora.email ? `, correo: ${receptora.email}` : '') +
    ` (en adelante, "Parte Receptora" o "la Receptora").`
  )

  body('Conjuntamente denominadas "las Partes" o individualmente "la Parte".')

  // ── 2. ANTECEDENTES Y OBJETO ──────────────────────────────────
  h1('2. Antecedentes y Objeto')
  body(
    `Las Partes desean ${propositoPermitido || 'colaborar en un proyecto de mutuo interés'} ` +
    `(en adelante, el "Proyecto"), en el marco del cual ` +
    `${esBilateral ? 'ambas partes' : 'la Parte Divulgadora'} podrá${esBilateral ? 'n' : ''} revelar ` +
    `a ${esBilateral ? 'la otra' : 'la Parte Receptora'} cierta información de carácter confidencial.`
  )
  if (incluirDescripcion && descripcionProyecto) {
    body(`El Proyecto consiste en: ${descripcionProyecto}`)
  }
  body(
    `El presente Acuerdo tiene por objeto establecer las condiciones bajo las cuales la Información Confidencial ` +
    `será divulgada, recibida y protegida, a fin de preservar los legítimos intereses de ` +
    `${esBilateral ? 'ambas Partes' : 'la Parte Divulgadora'} y garantizar el uso exclusivamente autorizado de dicha información.`
  )

  // ── 3. DEFINICIÓN DE INFORMACIÓN CONFIDENCIAL ─────────────────
  h1('3. Definición de Información Confidencial')
  body(
    `A los efectos del presente Acuerdo, se entiende por "Información Confidencial" toda información de naturaleza técnica, ` +
    `comercial, financiera, legal, estratégica u operativa que ${esBilateral ? 'una Parte (en su carácter de Divulgadora)' : 'la Parte Divulgadora'} ` +
    `revele a ${esBilateral ? 'la otra (en su carácter de Receptora)' : 'la Parte Receptora'}, en cualquier forma o medio ` +
    `—oral, escrito, electrónico, magnético, visual u otro—, ya sea de manera directa o a través de sus representantes, empleados, asesores o agentes.`
  )
  body('Se considerará Información Confidencial, sin carácter taxativo:')
  body('a) Planes de negocio, estrategias y proyecciones financieras.')
  body('b) Información técnica, algoritmos, código fuente, diseños y metodologías.')
  body('c) Listas de clientes, proveedores, socios y datos comerciales.')
  body('d) Secretos industriales y comerciales, procesos y know-how.')
  body('e) Toda información marcada como "Confidencial", "Reservado" o similar, o que por su naturaleza resulte razonablemente entendida como confidencial.')

  // ── 4. EXCLUSIONES ────────────────────────────────────────────
  h1('4. Exclusiones')
  body('No será considerada Información Confidencial aquella que:')
  body('a) Sea o se convierta en información de dominio público por causas ajenas al incumplimiento de la Parte Receptora.')
  body('b) Fuera conocida por la Parte Receptora con anterioridad a su divulgación, sin restricción alguna de confidencialidad.')
  body('c) Sea divulgada a la Parte Receptora por un tercero con derecho legítimo a hacerlo y sin restricción de confidencialidad.')
  body('d) Sea desarrollada de manera independiente por la Parte Receptora, sin uso de la Información Confidencial de la Parte Divulgadora.')
  body('e) Deba ser divulgada por exigencia de la ley o resolución judicial o administrativa, siempre que la Parte Receptora notifique de inmediato a la Parte Divulgadora y colabore en la obtención de una orden de protección.')

  // ── 5. OBLIGACIONES DE LA PARTE RECEPTORA ────────────────────
  h1('5. Obligaciones de la Parte Receptora')
  body('La Parte Receptora se compromete a:')
  body('a) Mantener la Información Confidencial en estricta reserva y no divulgarla a terceros sin el previo consentimiento escrito de la Parte Divulgadora.')
  body('b) Utilizar la Información Confidencial exclusivamente para los fines del Proyecto descripto en la Cláusula 2 y para ningún otro fin.')
  body('c) Adoptar las mismas medidas de seguridad y protección que aplica para resguardar su propia información confidencial, con un estándar mínimo de diligencia razonable.')
  body('d) Limitar el acceso a la Información Confidencial a aquellos empleados, directivos, asesores o subcontratistas que la necesiten estrictamente para los fines del Proyecto, quienes estarán sujetos a obligaciones de confidencialidad no menos restrictivas que las del presente Acuerdo.')
  body('e) Notificar de inmediato a la Parte Divulgadora ante cualquier acceso no autorizado, pérdida o divulgación accidental de Información Confidencial, y cooperar para mitigar las consecuencias.')
  body('f) Devolver o destruir toda la Información Confidencial, incluyendo copias, en el plazo de cinco (5) días hábiles contados desde la solicitud de la Parte Divulgadora o la terminación del Acuerdo, lo que ocurra primero.')

  if (esBilateral) {
    body(
      `En el caso del Acuerdo Bilateral, las obligaciones establecidas en esta cláusula son de aplicación recíproca: ` +
      `cada Parte actúa simultáneamente como Divulgadora y como Receptora respecto de la Información Confidencial que revele a la otra.`
    )
  }

  // ── 6. DURACIÓN ───────────────────────────────────────────────
  h1('6. Duración de la Confidencialidad')
  body(
    `Las obligaciones de confidencialidad establecidas en el presente Acuerdo serán exigibles ${duracionLabel} ` +
    `contados desde la fecha de celebración del Acuerdo o desde la fecha en que la Información Confidencial sea revelada, lo que ocurra primero.`
  )
  if (proteccionPerpetua) {
    body(
      `No obstante lo anterior, la obligación de confidencialidad respecto de los secretos comerciales, secretos industriales, ` +
      `información técnica estratégica y todo otro dato que constituya un secreto en los términos del Código Civil y Comercial de la Nación ` +
      `y la legislación complementaria, subsistirá de forma indefinida y sin limitación temporal alguna, ` +
      `aun con posterioridad a la extinción del presente Acuerdo.`
    )
  }
  if (retroactividad) {
    body(
      `El presente Acuerdo también protege toda Información Confidencial que haya sido revelada entre las Partes con anterioridad ` +
      `a la fecha de su celebración, en el marco de las tratativas vinculadas al Proyecto, como si hubiera sido divulgada bajo la vigencia de este Acuerdo.`
    )
  }
  body(
    `La finalización de la relación entre las Partes —por cualquier causa— no extingue las obligaciones de confidencialidad asumidas, ` +
    `las cuales continuarán vigentes por el plazo pactado en esta cláusula.`
  )

  // ── CLÁUSULAS OPCIONALES ──────────────────────────────────────
  if (noCompete) {
    const durNCLabel = { '1': 'un (1) año', '2': 'dos (2) años', '3': 'tres (3) años', '5': 'cinco (5) años', '7': 'siete (7) años' }[duracionNoCompete] ?? 'dos (2) años'
    h1('7. Restricción de Competencia')
    body(
      `Durante la vigencia del presente Acuerdo y por el plazo de ${durNCLabel} contados desde su terminación, la Parte Receptora ` +
      `se compromete a no desarrollar, financiar, integrar, asesorar ni participar —de manera directa o indirecta, por sí o por terceros— ` +
      `en ninguna actividad, proyecto o emprendimiento que compita directamente con el Proyecto o con el negocio principal de la Parte Divulgadora, ` +
      `en el territorio de la República Argentina.`
    )
    body(
      `La Parte Receptora reconoce que la restricción prevista en esta cláusula es razonable en cuanto a su alcance, duración y ámbito territorial, ` +
      `y que resulta necesaria para proteger los legítimos intereses comerciales de la Parte Divulgadora.`
    )
    body(`El incumplimiento de esta cláusula habilitará a la Parte Divulgadora a reclamar el pago de la cláusula penal prevista en el presente Acuerdo, sin perjuicio de los demás remedios legales disponibles.`)
  }

  if (nonSolicitation) {
    const secNS = noCompete ? '8' : '7'
    h1(`${secNS}. Protección de Recursos Humanos, Clientes y Proveedores`)
    body('La Parte Receptora se obliga, durante la vigencia del Acuerdo y por el plazo de dos (2) años contados desde su terminación, a:')
    body('a) No contratar, incorporar ni solicitar —directa o indirectamente— a ningún empleado, consultor o colaborador de la Parte Divulgadora que haya tenido acceso a la Información Confidencial o que haya participado en el Proyecto, sin el previo consentimiento escrito de la Parte Divulgadora.')
    body('b) No contactar, captar ni intentar desviar a ningún cliente, proveedor o socio comercial de la Parte Divulgadora de cuya existencia haya tomado conocimiento en el marco del presente Acuerdo o del Proyecto.')
    body('Esta obligación se aplica de igual modo a las personas jurídicas vinculadas a la Parte Receptora, incluyendo sus sociedades controladas, controlantes o con participación accionaria significativa.')
  }

  if (cesionPI) {
    const secPI = [noCompete, nonSolicitation].filter(Boolean).length + 7
    h1(`${secPI}. Propiedad Intelectual sobre Materiales Derivados`)
    body(
      `Todo material, trabajo, invención, mejora, obra o desarrollo que la Parte Receptora genere, total o parcialmente, con base en o a partir ` +
      `de la Información Confidencial de la Parte Divulgadora (en adelante, los "Materiales Derivados") será considerado de titularidad exclusiva ` +
      `de la Parte Divulgadora desde el momento de su creación.`
    )
    body(
      `La Parte Receptora cede y transfiere a la Parte Divulgadora, de forma irrevocable, con carácter exclusivo, en forma gratuita y para todo el mundo, ` +
      `todos los derechos de propiedad intelectual e industrial que pudieran corresponderle sobre los Materiales Derivados, ` +
      `incluyendo los derechos de reproducción, distribución, transformación, comunicación pública y explotación en cualquier forma.`
    )
    body('La Parte Receptora colaborará con la Parte Divulgadora en todos los trámites que sean necesarios para documentar y formalizar dicha cesión.')
  }

  if (noResiduales) {
    const secR = [noCompete, nonSolicitation, cesionPI].filter(Boolean).length + 7
    h1(`${secR}. Restricción sobre Conocimiento Residual`)
    body(
      `La Parte Receptora se compromete a no utilizar el conocimiento, ideas, conceptos o información técnica que haya incorporado en su memoria ` +
      `como resultado de su acceso a la Información Confidencial (conocimiento "residual"), para desarrollar productos, servicios o soluciones ` +
      `que compitan con los de la Parte Divulgadora o que deriven sustancialmente de la Información Confidencial recibida.`
    )
    body(
      `Esta restricción no impide a la Parte Receptora el uso de conocimiento técnico general y no específico adquirido en el ejercicio habitual ` +
      `de su actividad profesional, siempre que no implique el uso deliberado de la Información Confidencial de la Parte Divulgadora.`
    )
  }

  if (noPublicidad) {
    const secP = [noCompete, nonSolicitation, cesionPI, noResiduales].filter(Boolean).length + 7
    h1(`${secP}. Reserva sobre la Existencia del Acuerdo y la Relación`)
    body(
      `Las Partes acuerdan mantener en estricta confidencialidad la existencia del presente Acuerdo, así como la naturaleza y el alcance de la relación ` +
      `entre ellas derivada del Proyecto, salvo que medie consentimiento escrito de ambas Partes o resulte obligatorio por imperativo legal.`
    )
    body(
      `Ninguna de las Partes podrá utilizar el nombre, la marca, el logotipo ni ninguna referencia identificatoria de la otra Parte en comunicaciones públicas, ` +
      `materiales de marketing, presentaciones a inversores u otros documentos, sin la autorización previa y por escrito de la otra Parte.`
    )
  }

  // ── CLÁUSULA PENAL ───────────────────────────────────────────
  const totalOptional = [noCompete, nonSolicitation, cesionPI, noResiduales, noPublicidad].filter(Boolean).length
  const secPenal = totalOptional + 7
  h1(`${secPenal}. Cláusula Penal por Incumplimiento`)
  body(
    `En caso de incumplimiento de cualquiera de las obligaciones establecidas en el presente Acuerdo, la Parte infractora deberá abonar ` +
    `a la Parte afectada, en concepto de cláusula penal, la suma de ${montoLabel} (la "Pena"), sin necesidad de acreditar daño alguno ` +
    `y sin perjuicio del derecho de la Parte afectada a reclamar los daños y perjuicios que excedan dicho importe.`
  )
  body('El pago de la Pena no extingue las obligaciones de confidencialidad ni las demás obligaciones asumidas en el presente Acuerdo, las cuales permanecerán plenamente vigentes.')
  body('Las Partes reconocen que el monto de la Pena ha sido fijado de mutuo acuerdo y resulta una estimación razonable de los daños que el incumplimiento podría ocasionar.')

  // ── RESOLUCIÓN DE CONFLICTOS ──────────────────────────────────
  const secResol = secPenal + 1
  h1(`${secResol}. Resolución de Conflictos`)
  if (foro === 'arbitraje_bcm') {
    if (mediacionPrevia) {
      body(
        `Ante cualquier controversia derivada del presente Acuerdo o relacionada con su interpretación, validez, ejecución o incumplimiento, ` +
        `las Partes se comprometen a intentar resolverla primeramente mediante mediación voluntaria, conforme a las disposiciones de la Ley N° 26.589 de Mediación y Conciliación.`
      )
      body(
        `Si la mediación no arroja resultado satisfactorio en el plazo de treinta (30) días corridos contados desde la notificación de inicio del proceso mediatorio, ` +
        `la controversia será sometida a arbitraje privado ante la Bolsa de Comercio de Mendoza, de conformidad con su Reglamento de Arbitraje vigente. ` +
        `El laudo arbitral será definitivo e inapelable para las Partes.`
      )
    } else {
      body(
        `Toda controversia derivada del presente Acuerdo o relacionada con su interpretación, validez, ejecución o incumplimiento será resuelta ` +
        `mediante arbitraje privado ante la Bolsa de Comercio de Mendoza, de conformidad con su Reglamento de Arbitraje vigente al momento de la controversia. ` +
        `El laudo arbitral será definitivo e inapelable para las Partes.`
      )
    }
    body('El arbitraje se desarrollará en idioma español y tendrá lugar en la ciudad de Mendoza, República Argentina, salvo acuerdo en contrario de las Partes.')
  } else {
    body(
      `Las controversias que se susciten entre las Partes con motivo del presente Acuerdo, su interpretación, validez, ejecución o incumplimiento ` +
      `serán sometidas a la jurisdicción de los Tribunales Ordinarios de la Provincia de Mendoza, República Argentina, ` +
      `con renuncia expresa a cualquier otro fuero o jurisdicción que pudiera corresponder.`
    )
  }

  // ── LEY APLICABLE ────────────────────────────────────────────
  const secLey = secResol + 1
  h1(`${secLey}. Ley Aplicable`)
  body(
    `El presente Acuerdo se rige e interpreta de conformidad con la legislación de la República Argentina, y en particular por las disposiciones del ` +
    `Código Civil y Comercial de la Nación, la Ley N° 24.766 de Confidencialidad sobre información y productos que estén legítimamente bajo control ` +
    `de una persona, y demás normas complementarias aplicables.`
  )

  // ── DISPOSICIONES GENERALES ───────────────────────────────────
  const secGen = secLey + 1
  h1(`${secGen}. Disposiciones Generales`)
  body('a) Integralidad: El presente Acuerdo constituye el entendimiento completo entre las Partes con relación a su objeto y reemplaza cualquier acuerdo, negociación o entendimiento previo, oral o escrito, sobre la misma materia.')
  body('b) Modificaciones: Cualquier modificación al presente Acuerdo deberá constar por escrito y ser suscripta por representantes autorizados de ambas Partes.')
  body('c) Renuncia: El hecho de que una Parte no ejerza o no exija el cumplimiento de cualquier derecho o disposición del presente Acuerdo en un momento determinado no implica la renuncia a su derecho de hacerlo en el futuro.')
  body('d) Divisibilidad: Si alguna cláusula del presente Acuerdo fuera declarada nula, inválida o inaplicable, dicha cláusula se tendrá por no escrita y las restantes disposiciones del Acuerdo continuarán en plena vigencia y efecto.')
  body('e) Ausencia de sociedad: El presente Acuerdo no crea ninguna sociedad, joint venture, relación de agencia, empleo ni representación entre las Partes.')
  body('f) Notificaciones: Toda comunicación entre las Partes derivada del presente Acuerdo deberá realizarse por escrito al correo electrónico o domicilio indicado por cada Parte en la Cláusula 1.')

  // ── FIRMAS ────────────────────────────────────────────────────
  const secFirma = secGen + 1
  h1(`${secFirma}. Firmas`)
  body(`En prueba de conformidad, las Partes suscriben el presente Acuerdo en la ciudad de ${ciudadFirma}, con fecha ${fechaLabel}.`)

  // Bloque firma Divulgadora
  add(p('PARTE DIVULGADORA', { bold: true, spaceBefore: 320 }))
  add(p('Firma: ___________________________'))
  add(p(`Nombre: ${divulgadora.nombre || '___________________________'}`))
  if (divIsJuridica && divulgadora.rep_legal) {
    add(p(`Representante: ${divulgadora.rep_legal}`))
    if (divulgadora.dni_cargo_rep) add(p(`Cargo: ${divulgadora.dni_cargo_rep}`))
  }
  add(p(`DNI/CUIT: ${divulgadora.dni_cuit || '___________________________'}`))
  // Espaciado generoso antes del segundo bloque de firma
  add(p('Fecha: ___________________________', { spaceAfter: 560 }))

  // Bloque firma Receptora
  add(p('PARTE RECEPTORA', { bold: true }))
  add(p('Firma: ___________________________'))
  add(p(`Nombre: ${receptora.nombre || '___________________________'}`))
  if (recIsJuridica && receptora.rep_legal) {
    add(p(`Representante: ${receptora.rep_legal}`))
    if (receptora.dni_cargo_rep) add(p(`Cargo: ${receptora.dni_cargo_rep}`))
  }
  add(p(`DNI/CUIT: ${receptora.dni_cuit || '___________________________'}`))
  add(p('Fecha: ___________________________', { spaceAfter: 480 }))

  // Cierre
  add(p('—', { center: true }))
  add(p('Documento generado por Zonda Legal.', { center: true, italic: true, fontSize: SZ_SMALL }))
  add(p('Este borrador debe ser revisado por el abogado responsable antes de su firma.', { center: true, italic: true, fontSize: SZ_SMALL }))

  return paras
}

// ── Route handler ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autenticado', { status: 401 })

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

  if (!perfil || perfil.rol !== 'zonda')
    return new NextResponse('Acceso denegado', { status: 403 })

  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  if (!tramiteId)
    return new NextResponse('tramiteId requerido', { status: 400 })

  const { data: tramite, error: dbError } = await supabase
    .from('tramites')
    .select('datos_cliente, datos_propuesta, tipo')
    .eq('id', tramiteId)
    .single()

  if (dbError || !tramite)
    return new NextResponse('Trámite no encontrado', { status: 404 })

  if (tramite.tipo !== 'NDA')
    return new NextResponse('El trámite no es de tipo NDA', { status: 400 })

  const datos = tramite.datos_cliente as Datos | null
  if (!datos)
    return new NextResponse('El cliente aún no completó el cuestionario', { status: 422 })

  const tmpDir = join(tmpdir(), `nda_${randomUUID()}`)
  try {
    mkdirSync(tmpDir, { recursive: true })
    mkdirSync(join(tmpDir, '_rels'),         { recursive: true })
    mkdirSync(join(tmpDir, 'word', '_rels'), { recursive: true })
    mkdirSync(join(tmpDir, 'docProps'),      { recursive: true })

    const divulgadoraNombre = String((datos.divulgadora as Datos)?.nombre ?? 'partes')
    const tipoAcuerdo       = String(datos.tipo_acuerdo ?? 'unilateral')
    const titleDoc          = tipoAcuerdo === 'bilateral'
      ? 'Acuerdo de Confidencialidad Bilateral'
      : 'Acuerdo de Confidencialidad'

    const paras = buildNDAParagraphs(datos)

    writeFileSync(join(tmpDir, '[Content_Types].xml'),              buildContentTypes(),    'utf8')
    writeFileSync(join(tmpDir, '_rels', '.rels'),                   buildRootRels(),        'utf8')
    writeFileSync(join(tmpDir, 'word', 'document.xml'),             buildDocumentXml(paras),'utf8')
    writeFileSync(join(tmpDir, 'word', 'styles.xml'),               buildStylesXml(),       'utf8')
    writeFileSync(join(tmpDir, 'word', 'footer.xml'),               buildFooterXml(),       'utf8')
    writeFileSync(join(tmpDir, 'word', '_rels', 'document.xml.rels'),buildWordRels(),       'utf8')
    writeFileSync(join(tmpDir, 'docProps', 'core.xml'),             buildCoreXml(`${titleDoc} — ${divulgadoraNombre}`), 'utf8')
    writeFileSync(join(tmpDir, 'docProps', 'app.xml'),              buildAppXml(),          'utf8')

    const outputPath = join(tmpdir(), `nda_${randomUUID()}.docx`)
    execSync(`cd "${tmpDir}" && zip -r -q "${outputPath}" .`)

    const buf      = readFileSync(outputPath)
    const safeName = divulgadoraNombre.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase()
    const fileName = `nda_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`

    try { rmSync(outputPath) } catch { /* ignore */ }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })

  } catch (err) {
    console.error('[generar-nda] Error:', err)
    return new NextResponse(`Error generando el documento: ${String(err)}`, { status: 500 })
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
