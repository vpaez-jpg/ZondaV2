// GET /api/generar-tyc?tramiteId=...
//
// Genera el DOCX de Términos y Condiciones desde los datos del cuestionario.
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
const FONT         = 'Times New Roman'
const SZ_BODY      = 24   // 12 pt  (half-points)
const SZ_H1        = 28   // 14 pt
const SZ_H2        = 24   // 12 pt  (mismo tamaño, bold diferencia)
const SZ_TITLE     = 32   // 16 pt  (título principal del documento)
const SZ_SMALL     = 18   // 9 pt   (notas al final)
const LINE_15      = 360  // interlineado 1,5 (auto)
const SPC_AFTER    = 160  // 8 pt  espaciado posterior cuerpo
const SPC_AFTER_H1 = 120  // 6 pt  después de título de sección
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
 * Genera un <w:p> con TNR, interlineado 1,5 y espaciado posterior.
 * Justificado por defecto; centrado sólo cuando center:true.
 * No se usan párrafos vacíos — la separación viene de spaceAfter.
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

// ── Footer: número de página centrado al pie ──────────────────
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

// ── Documento principal (footer en sectPr) ────────────────────
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

// ── Constructor de contenido TyC ───────────────────────────────
type Datos = Record<string, unknown>

function str(v: unknown, fallback = '') { return String(v ?? fallback) }
function bool(v: unknown) { return v === true || v === 'true' }

function buildTyCParagraphs(datos: Datos, datosPropuesta: Datos): string[] {
  const paras: string[] = []

  function add(para: string) { paras.push(para) }
  function h1(text: string) { add(p(text, { heading: 1, spaceBefore: SPC_BEF_H1 })) }
  function h2(text: string) { add(p(text, { heading: 2, spaceBefore: SPC_BEF_H2 })) }
  function body(text: string, spaceAfter?: number) {
    add(p(text, spaceAfter !== undefined ? { spaceAfter } : {}))
  }
  function note(text: string) { add(p(text, { italic: true })) }

  // ── Datos extraídos ──
  const nombreDocumento  = str(datos.nombre_documento, 'tyc')
  const tituloDoc = nombreDocumento === 'servicio'
    ? 'TÉRMINOS DE SERVICIO'
    : nombreDocumento === 'uso'
    ? 'TÉRMINOS DE USO'
    : 'TÉRMINOS Y CONDICIONES'

  const nombreLegal      = str(datos.nombre_legal,     '[NOMBRE LEGAL]')
  const nombreComercial  = str(datos.nombre_comercial) || nombreLegal
  const tipoPersona      = str(datos.tipo_persona,     'juridica')
  const cuit             = str(datos.cuit,             '[CUIT]')
  const domicilio        = str(datos.domicilio,        '[DOMICILIO]')
  const emailContacto    = str(datos.email_contacto,   '[EMAIL]')
  const tipoPlatform     = str(datos.tipo_plataforma,  'website')
  const urlWebsite       = str(datos.url_website)
  const nombreApp        = str(datos.nombre_app)
  const descripcion      = str(datos.descripcion,      `${nombreComercial} ofrece servicios a través de su plataforma.`)
  const vendeProd        = bool(datos.vende_prod_serv)
  const usuariosUE       = bool(datos.usuarios_ue)
  const paisHosting      = str(datos.pais_hosting,     'Argentina')

  const cuentasUsuarios    = bool(datos.cuentas_usuarios)
  const vinculaRRSS        = bool(datos.vincula_rrss)
  const menoresPermitidos  = bool(datos.menores_permitidos)
  const edadMinima         = str(datos.edad_minima, '18')
  const contenidoUsuarios  = bool(datos.contenido_usuarios)
  const resenias           = bool(datos.resenias)
  const tieneMarketplace   = bool(datos.tiene_marketplace)
  const linksExternos      = bool(datos.links_externos)

  const tieneSubscripcion  = bool(datos.tiene_subscripcion)
  const renovAutomatica    = bool(datos.renov_automatica)
  const frecuenciaRenov    = str(datos.frecuencia_renov, 'mensual')
  const tienePrueba        = bool(datos.tiene_prueba)
  const formaCancelacion   = str(datos.forma_cancelacion, 'cuenta')
  const publicidadTerceros = bool(datos.publicidad_terceros)
  const enviaMarketing     = bool(datos.envia_marketing)
  const tiposMarketing     = (datos.tipos_marketing as string[] | undefined) ?? []
  const linkPrivacidad     = str(datos.link_privacidad)

  const resolucionConflictos = str(datos.resolucion_conflictos, 'justicia_ordinaria')
  const jurisdiccion         = str(datos.jurisdiccion,           'Mendoza')
  const notificaCambios      = str(datos.notifica_cambios,       'email')
  const idioma               = str(datos.idioma,                'es')
  const fechaVigencia        = str(datos.fecha_vigencia)

  const tipoPersonaLabel = tipoPersona === 'fisica' ? 'persona física' : 'persona jurídica'

  const plataformaDesc = tipoPlatform === 'app'
    ? `la aplicación móvil ${esc(nombreApp)}`
    : tipoPlatform === 'ambas'
    ? `el sitio web ${esc(urlWebsite)} y la aplicación móvil ${esc(nombreApp)}`
    : `el sitio web ${esc(urlWebsite)}`

  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const fechaLabel = fechaVigencia
    ? new Date(fechaVigencia + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : hoy

  // ── ENCABEZADO ───────────────────────────────────────────────
  add(p(tituloDoc,          { heading: 1, center: true, spaceBefore: 0, fontSize: SZ_TITLE }))
  add(p(nombreComercial.toUpperCase(), { center: true, bold: true, fontSize: SZ_H1 }))
  add(p(`Última actualización: ${fechaLabel}`, { center: true, italic: true, spaceAfter: 320 }))

  if (idioma === 'bilingual' || idioma === 'en') {
    note('[Nota: El presente documento se entrega en su versión en español. La versión en inglés será preparada por el equipo de Zonda Legal sobre la base de este borrador.]')
  }

  // ── 1. INTRODUCCIÓN ──────────────────────────────────────────
  h1('1. Introducción y Partes')
  body(`Los presentes ${tituloDoc} (en adelante, los "Términos") regulan el acceso y uso de ${plataformaDesc} (en adelante, la "Plataforma") operada por ${nombreLegal} (en adelante, "${nombreComercial}", "nosotros" o "la Empresa"), ${tipoPersonaLabel} con CUIT ${cuit}, con domicilio en ${domicilio}.`)
  body(`${descripcion}`)
  body('Toda persona que acceda o utilice la Plataforma (en adelante, el "Usuario" o "usted") queda sujeta a estos Términos y a todas las políticas que se incorporen por referencia.')

  // ── 2. DEFINICIONES ──────────────────────────────────────────
  h1('2. Definiciones')
  body('A los efectos de los presentes Términos, los siguientes términos tendrán el significado que se indica a continuación:')
  body(`a) "Plataforma": ${plataformaDesc} y todos los servicios, funciones y contenidos ofrecidos a través de ellos.`)
  body('b) "Usuario": toda persona física o jurídica que acceda o utilice la Plataforma, ya sea de forma registrada o como visitante.')
  if (cuentasUsuarios) {
    body('c) "Cuenta": el perfil personal creado por el Usuario para acceder a las funcionalidades disponibles de la Plataforma.')
  }
  if (contenidoUsuarios) {
    body('d) "Contenido de Usuario" o "UGC": toda información, texto, imagen, video, comentario u otro material que el Usuario publique, suba o transmita a través de la Plataforma.')
  }
  if (tieneMarketplace) {
    body('e) "Marketplace": la funcionalidad de la Plataforma que permite a los Usuarios ofrecer y adquirir productos o servicios de otros Usuarios.')
  }
  body(`f) "Contenido de la Empresa": todo el contenido publicado por ${nombreComercial} en la Plataforma, incluyendo textos, imágenes, diseños, software, marcas y logotipos.`)
  body('g) "Legislación Aplicable": la legislación argentina vigente, incluyendo la Ley N° 24.240 de Defensa del Consumidor, la Ley N° 25.326 de Protección de Datos Personales, el Código Civil y Comercial de la Nación, y toda otra norma aplicable.')

  // ── 3. ACEPTACIÓN ────────────────────────────────────────────
  h1('3. Aceptación de los Términos')
  body(`Al ingresar a la Plataforma, crear una cuenta, hacer clic en "Acepto" o cualquier botón equivalente, o simplemente al utilizar cualquier función de la Plataforma, el Usuario manifiesta haber leído, comprendido y aceptado la totalidad de estos Términos, así como la Política de Privacidad de ${nombreComercial}${linkPrivacidad ? ` (disponible en ${linkPrivacidad})` : ''}.`)
  body(`Si el Usuario no está de acuerdo con alguno de estos Términos, deberá abstenerse de acceder o utilizar la Plataforma.`)
  body(`${nombreComercial} se reserva el derecho de modificar los presentes Términos en cualquier momento. Las modificaciones entrarán en vigencia conforme a lo establecido en la Sección de Modificaciones de este documento.`)

  // ── 4. ELEGIBILIDAD ──────────────────────────────────────────
  h1('4. Elegibilidad')
  if (menoresPermitidos) {
    body(`El uso de la Plataforma está permitido a personas de ${edadMinima} años de edad o más.${edadMinima !== '18' ? ` Los menores de 18 años podrán acceder únicamente con el consentimiento expreso de sus padres o tutores legales, quienes asumirán la responsabilidad por el uso que el menor realice de la Plataforma.` : ''}`)
  } else {
    body('El uso de la Plataforma está exclusivamente destinado a personas mayores de 18 (dieciocho) años que tengan capacidad legal para celebrar contratos vinculantes de acuerdo con la legislación argentina. La Plataforma no está disponible para menores de edad bajo ninguna circunstancia.')
  }
  body(`Si el Usuario utiliza la Plataforma en nombre de una persona jurídica, declara y garantiza que cuenta con las facultades necesarias para vincular a dicha entidad a los presentes Términos.`)

  // ── 5. REGISTRO Y CUENTA (condicional) ───────────────────────
  if (cuentasUsuarios) {
    h1('5. Registro y Cuenta de Usuario')
    h2('5.1 Creación de cuenta')
    body(`Para acceder a las funcionalidades completas de la Plataforma, el Usuario deberá crear una Cuenta proporcionando información veraz, completa y actualizada. El Usuario se compromete a mantener dicha información al día durante toda la vigencia de su relación con ${nombreComercial}.`)
    body(`El Usuario no podrá: (a) crear una cuenta en nombre de otra persona sin su consentimiento expreso; (b) utilizar un nombre de usuario que induzca a confusión con otra persona o entidad; (c) registrar múltiples cuentas con el fin de eludir restricciones o sanciones.`)

    if (vinculaRRSS) {
      h2('5.2 Vinculación con servicios de terceros')
      body(`La Plataforma permite al Usuario autenticarse o vincular su Cuenta a través de servicios de terceros (por ejemplo, Google, Facebook, Apple, entre otros). Al hacerlo, el Usuario autoriza a ${nombreComercial} a acceder a la información de su perfil en dichos servicios, en los términos que se detallan en la Política de Privacidad.`)
      body(`El Usuario reconoce que la disponibilidad de dichos servicios de terceros es responsabilidad exclusiva de sus respectivos proveedores, y que ${nombreComercial} no asume responsabilidad alguna por interrupciones o cambios en dichos servicios.`)
    }

    h2(`${vinculaRRSS ? '5.3' : '5.2'} Seguridad y confidencialidad de la Cuenta`)
    body(`El Usuario es el único responsable de mantener la confidencialidad de sus credenciales de acceso (usuario y contraseña) y de toda actividad que se realice bajo su Cuenta. El Usuario deberá notificar a ${nombreComercial} de inmediato ante cualquier uso no autorizado de su Cuenta o cualquier otra violación de seguridad.`)
    body(`${nombreComercial} no será responsable por las pérdidas o daños causados por el incumplimiento de esta obligación por parte del Usuario.`)
    body('Las cuentas son personales e intransferibles y no pueden ser cedidas ni compartidas con terceros.')
  }

  // ── 6. USO PERMITIDO ─────────────────────────────────────────
  const secUso = cuentasUsuarios ? '6' : '5'
  h1(`${secUso}. Uso Permitido del Servicio`)
  body(`El Usuario se compromete a utilizar la Plataforma de conformidad con estos Términos, la Legislación Aplicable y las buenas costumbres. Queda expresamente prohibido:`)
  body(`a) Usar la Plataforma para fines ilegales, fraudulentos o contrarios a los presentes Términos.`)
  body(`b) Intentar acceder sin autorización a sistemas, servidores o datos relacionados con la Plataforma.`)
  body(`c) Realizar ingeniería inversa, descompilar o desensamblar el software de la Plataforma.`)
  body(`d) Introducir virus, malware o cualquier código malicioso que pueda dañar o alterar el funcionamiento de la Plataforma.`)
  body(`e) Utilizar robots, scrapers u otras herramientas automatizadas para extraer datos de la Plataforma sin autorización previa y por escrito de ${nombreComercial}.`)
  body(`f) Suplantar la identidad de otra persona o entidad.`)
  body(`g) Publicar, transmitir o distribuir contenido difamatorio, discriminatorio, obsceno, violento o que viole derechos de terceros.`)
  body(`h) Interferir con el funcionamiento normal de la Plataforma o sus servidores.`)

  // ── 7. PROPIEDAD INTELECTUAL ──────────────────────────────────
  const secPI = parseInt(secUso) + 1
  h1(`${secPI}. Propiedad Intelectual`)
  body(`Todos los derechos de propiedad intelectual sobre el Contenido de la Empresa, incluyendo —sin limitación— el diseño, código fuente, marcas, logotipos, textos, imágenes y cualquier otro material disponible en la Plataforma, son propiedad exclusiva de ${nombreLegal} o de sus licenciantes, y están protegidos por las leyes de propiedad intelectual de la República Argentina y los tratados internacionales aplicables.`)
  body(`Los presentes Términos no otorgan al Usuario ningún derecho sobre dicho contenido, salvo la licencia limitada, no exclusiva e intransferible de acceso y uso para fines personales y no comerciales, de conformidad con lo establecido en este documento.`)
  body(`El Usuario no podrá reproducir, modificar, distribuir, comunicar públicamente, transformar ni utilizar con fines comerciales el Contenido de la Empresa sin autorización previa y por escrito de ${nombreComercial}.`)

  // ── 8. CONTENIDO UGC (condicional) ───────────────────────────
  if (contenidoUsuarios) {
    const secUGC = secPI + 1
    h1(`${secUGC}. Contenido Generado por Usuarios`)
    body(`El Usuario es el único responsable del Contenido de Usuario que publique, suba o transmita a través de la Plataforma. Al hacerlo, el Usuario declara y garantiza que:`)
    body(`a) Cuenta con todos los derechos necesarios sobre dicho contenido o cuenta con las autorizaciones correspondientes para publicarlo.`)
    body(`b) El contenido no infringe derechos de propiedad intelectual, privacidad ni ningún otro derecho de terceros.`)
    body(`c) El contenido no es ilegal, difamatorio, discriminatorio, obsceno ni contrario a la moral o las buenas costumbres.`)
    body(`Al publicar Contenido de Usuario, el Usuario otorga a ${nombreComercial} una licencia mundial, no exclusiva, gratuita, transferible y sublicenciable para usar, reproducir, modificar, adaptar, publicar, traducir y distribuir dicho contenido en todos los medios conocidos o por conocerse, con el único fin de operar, mejorar y promover la Plataforma.`)
    body(`${nombreComercial} se reserva el derecho de eliminar, sin previo aviso, cualquier Contenido de Usuario que viole estos Términos o que, a criterio de ${nombreComercial}, resulte perjudicial para la Plataforma o terceros.`)

    if (resenias) {
      h2(`${secUGC}.1 Reseñas y Valoraciones`)
      body(`La Plataforma permite a los Usuarios publicar reseñas, valoraciones u opiniones sobre productos, servicios o proveedores. El Usuario se compromete a que sus reseñas sean verídicas, basadas en su experiencia real, y no tengan por finalidad perjudicar injustamente a terceros.`)
      body(`${nombreComercial} no asume responsabilidad alguna por el contenido de las reseñas publicadas por los Usuarios, pero se reserva el derecho de eliminar aquellas que resulten falsas, difamatorias o contrarias a estos Términos.`)
    }
  }

  // ── MARKETPLACE (condicional) ─────────────────────────────────
  if (tieneMarketplace) {
    const secMkt = contenidoUsuarios ? (secPI + 2) : (secPI + 1)
    h1(`${secMkt}. Transacciones entre Usuarios — Marketplace`)
    body(`La Plataforma incluye una función de marketplace que facilita el contacto y las transacciones entre Usuarios. ${nombreComercial} actúa como intermediario y no es parte de los contratos celebrados entre Usuarios.`)
    body(`Cada Usuario que ofrezca productos o servicios a través del marketplace es responsable exclusivo de: (a) la veracidad y exactitud de la información que publique; (b) el cumplimiento de las obligaciones legales aplicables, incluyendo impositivas y de facturación; (c) la calidad y entrega de los bienes o servicios ofrecidos.`)
    body(`${nombreComercial} no garantiza la calidad, seguridad, legalidad ni exactitud de los productos o servicios ofrecidos por los Usuarios. El Usuario reconoce que ${nombreComercial} no será responsable por los daños y perjuicios derivados de transacciones realizadas entre Usuarios a través del marketplace.`)
  }

  // ── PAGOS Y SUSCRIPCIONES (condicional) ──────────────────────
  if (vendeProd || tieneSubscripcion) {
    const secBase = secPI + (contenidoUsuarios ? 1 : 0) + (tieneMarketplace ? 1 : 0) + 1
    h1(`${secBase}. Precios, Pagos y Facturación`)
    if (vendeProd) {
      body(`Los precios de los productos o servicios disponibles en la Plataforma se expresan en pesos argentinos (ARS) e incluyen los impuestos que resulten aplicables, salvo indicación en contrario.`)
      body(`${nombreComercial} se reserva el derecho de modificar los precios en cualquier momento. Los cambios de precio no afectarán las compras o contrataciones ya perfeccionadas.`)
      body(`El pago se procesa a través de los medios habilitados en la Plataforma. El Usuario garantiza que está autorizado a utilizar el método de pago seleccionado.`)
    }
    if (tieneSubscripcion) {
      if (vendeProd) { h2('Suscripciones') }
      body(`${nombreComercial} ofrece planes de suscripción que otorgan acceso a determinadas funcionalidades de la Plataforma durante el período contratado.`)
      if (tienePrueba) {
        body(`Período de prueba gratuito: el Usuario podrá acceder a un período de prueba gratuito cuya duración se indicará al momento de la contratación. Al finalizar dicho período, la suscripción se convertirá automáticamente en una suscripción paga, salvo que el Usuario la cancele antes de su vencimiento.`)
      }
      if (renovAutomatica) {
        const freqLabel = frecuenciaRenov === 'anual' ? 'anualmente' : frecuenciaRenov === 'usuario' ? 'en el período seleccionado por el Usuario' : 'mensualmente'
        body(`Renovación automática: la suscripción se renueva automáticamente ${freqLabel}, con el correspondiente cargo al método de pago registrado, salvo que el Usuario proceda a su cancelación antes de la fecha de vencimiento del período vigente.`)
      }
      const cancelDesc = formaCancelacion === 'cuenta'
        ? 'directamente desde la configuración de su Cuenta'
        : formaCancelacion === 'soporte'
        ? 'a través del canal de soporte de la Empresa'
        : 'directamente desde la configuración de su Cuenta o a través del canal de soporte de la Empresa'
      body(`Cancelación: el Usuario puede cancelar su suscripción ${cancelDesc}. La cancelación será efectiva al final del período de facturación vigente, sin derecho a reembolso por el período no utilizado, salvo que la legislación aplicable disponga lo contrario.`)
    }
  }

  // ── PUBLICIDAD (condicional) ──────────────────────────────────
  if (publicidadTerceros) {
    h1('Publicidad de Terceros')
    body(`La Plataforma puede mostrar publicidad de terceros. ${nombreComercial} no avala ni es responsable por los productos, servicios o contenidos de los anunciantes. La interacción del Usuario con dicha publicidad es bajo su exclusivo riesgo y responsabilidad.`)
    body(`${nombreComercial} no garantiza que la publicidad mostrada se ajuste a los intereses o necesidades del Usuario.`)
  }

  // ── MARKETING (condicional) ───────────────────────────────────
  if (enviaMarketing) {
    const canalesLabel = tiposMarketing.length > 0
      ? tiposMarketing.map(c => c === 'email' ? 'correo electrónico' : c === 'sms' ? 'SMS' : 'notificaciones push').join(', ')
      : 'correo electrónico'
    h1('Comunicaciones de Marketing')
    body(`Con la aceptación de estos Términos, el Usuario consiente recibir comunicaciones promocionales de ${nombreComercial} a través de ${canalesLabel}, de conformidad con la Ley N° 26.032 y la Ley N° 25.326.`)
    body(`El Usuario podrá revocar dicho consentimiento en cualquier momento haciendo clic en el enlace de cancelación de suscripción incluido en cada comunicación comercial, o comunicándose con ${nombreComercial} a través de ${emailContacto}. La revocación no afectará la validez ni el tratamiento de datos realizados con anterioridad.`)
  }

  // ── PRIVACIDAD ────────────────────────────────────────────────
  h1('Privacidad y Protección de Datos Personales')
  body(`El tratamiento de los datos personales del Usuario se rige por la Política de Privacidad de ${nombreComercial}${linkPrivacidad ? `, disponible en ${linkPrivacidad}` : ''}, la cual forma parte integrante de los presentes Términos. Se recomienda al Usuario leerla detenidamente.`)
  body(`${nombreComercial} cumple con la Ley N° 25.326 de Protección de Datos Personales de la República Argentina${usuariosUE ? ' y con el Reglamento General de Protección de Datos (RGPD) de la Unión Europea respecto de los usuarios residentes en dicha región' : ''}.`)
  body(`El Usuario tiene derecho a solicitar el acceso, rectificación, supresión, oposición y portabilidad de sus datos personales, conforme a la legislación vigente. Para ejercer dichos derechos, el Usuario puede contactarse con ${nombreComercial} a través de ${emailContacto}.`)
  if (paisHosting !== 'Argentina') {
    body(`Los servidores de la Plataforma se encuentran alojados en ${paisHosting}. ${nombreComercial} adopta las medidas técnicas y organizativas adecuadas para garantizar la seguridad de los datos personales en sus transferencias internacionales.`)
  }

  // ── ENLACES EXTERNOS (condicional) ────────────────────────────
  if (linksExternos) {
    h1('Servicios y Sitios Web de Terceros')
    body(`La Plataforma puede contener enlaces o referencias a sitios web, servicios o aplicaciones de terceros. Dichos enlaces se proporcionan únicamente a modo informativo y no implican ningún tipo de respaldo, asociación ni responsabilidad de ${nombreComercial} respecto del contenido, políticas o prácticas de dichos terceros.`)
    body(`El acceso a sitios web de terceros se realiza bajo exclusivo riesgo del Usuario. ${nombreComercial} recomienda leer los términos y políticas de privacidad de cada sitio antes de utilizarlos.`)
  }

  // ── LIMITACIÓN DE RESPONSABILIDAD ────────────────────────────
  h1('Limitación de Responsabilidad')
  body(`En la máxima medida permitida por la Legislación Aplicable, ${nombreComercial} no será responsable por daños indirectos, incidentales, especiales, consecuentes ni punitivos, incluyendo —sin limitación— pérdida de beneficios, pérdida de datos, daño a la reputación o interrupción del negocio, derivados del uso o imposibilidad de uso de la Plataforma.`)
  body('La Plataforma se ofrece "tal cual" ("as is") y "según disponibilidad" ("as available"), sin garantías de ningún tipo, ya sean expresas o implícitas, incluyendo garantías de comerciabilidad, idoneidad para un fin determinado o ausencia de infracciones.')
  body('Lo anterior no afecta los derechos irrenunciables que corresponden al Usuario en su carácter de consumidor conforme a la Ley N° 24.240 de Defensa del Consumidor.')

  // ── SUSPENSIÓN Y TERMINACIÓN ──────────────────────────────────
  h1('Suspensión y Terminación')
  if (cuentasUsuarios) {
    body(`${nombreComercial} podrá suspender o dar de baja la Cuenta de un Usuario, sin previo aviso y sin responsabilidad alguna, en caso de incumplimiento de los presentes Términos, actividad fraudulenta, o cuando así lo requiera la legislación aplicable o una orden judicial.`)
    body(`El Usuario podrá cerrar su Cuenta en cualquier momento a través de la configuración de su perfil o comunicándose con ${nombreComercial} a través de ${emailContacto}. El cierre de la Cuenta no afecta los derechos y obligaciones devengados con anterioridad.`)
  }
  body('En caso de terminación, las disposiciones de estos Términos que por su naturaleza deban subsistir —incluyendo las relativas a propiedad intelectual, limitación de responsabilidad y jurisdicción— continuarán vigentes.')

  // ── MODIFICACIONES ────────────────────────────────────────────
  h1('Modificaciones a los Términos')
  const notifDescModif = notificaCambios === 'email'
    ? 'mediante notificación enviada a la dirección de correo electrónico registrada'
    : notificaCambios === 'plataforma'
    ? 'mediante aviso publicado en la Plataforma'
    : 'mediante notificación enviada por correo electrónico y aviso publicado en la Plataforma'
  body(`${nombreComercial} se reserva el derecho de modificar los presentes Términos en cualquier momento. Cuando se realicen cambios materiales, el Usuario será notificado ${notifDescModif} con una antelación mínima de 10 (diez) días corridos a la entrada en vigor de dichas modificaciones.`)
  body(`El uso continuado de la Plataforma una vez transcurrido dicho plazo implica la aceptación de los Términos modificados. Si el Usuario no acepta las modificaciones, deberá discontinuar el uso de la Plataforma${cuentasUsuarios ? ' y podrá solicitar la eliminación de su Cuenta' : ''} antes de la fecha de entrada en vigor.`)

  // ── RESOLUCIÓN DE CONFLICTOS ──────────────────────────────────
  h1('Resolución de Conflictos')
  if (resolucionConflictos === 'mediacion') {
    body(`Ante cualquier controversia derivada de los presentes Términos o del uso de la Plataforma, las partes se comprometen a intentar resolverla de manera amigable en primer lugar. De no alcanzarse un acuerdo, la disputa será sometida a mediación obligatoria conforme a la Ley N° 26.589 de Mediación y Conciliación.`)
    body('Si la mediación fracasa, cualquiera de las partes podrá acudir a los tribunales ordinarios con competencia en la jurisdicción indicada en la cláusula siguiente.')
  } else if (resolucionConflictos === 'arbitraje') {
    body(`Toda controversia derivada de los presentes Términos o relacionada con ellos, su interpretación, validez o cumplimiento, será resuelta mediante arbitraje privado conforme a las normas del Código Civil y Comercial de la Nación. El laudo arbitral será definitivo y vinculante para las partes.`)
    body('Lo anterior no impide al Usuario ejercer sus derechos como consumidor ante los organismos públicos competentes, conforme a la Ley N° 24.240.')
  } else {
    body(`Las controversias que se susciten entre las partes con motivo de los presentes Términos o del uso de la Plataforma se someterán a la jurisdicción de los tribunales ordinarios competentes con domicilio en la ${jurisdiccion}, República Argentina, con renuncia expresa a cualquier otro fuero que pudiera corresponder.`)
    body('Lo anterior no impide al Usuario ejercer sus derechos como consumidor ante los organismos públicos competentes, conforme a la Ley N° 24.240 de Defensa del Consumidor.')
  }

  // ── JURISDICCIÓN ──────────────────────────────────────────────
  h1('Jurisdicción y Ley Aplicable')
  body(`Los presentes Términos se rigen e interpretan de conformidad con la legislación de la República Argentina. Para todo asunto no previsto en estos Términos, se aplicarán supletoriamente las disposiciones del Código Civil y Comercial de la Nación, la Ley N° 24.240 de Defensa del Consumidor y demás normas aplicables.`)
  body(`Para la resolución de conflictos que no sean resueltos mediante el mecanismo previsto en la cláusula anterior, las partes se someten a la jurisdicción de los tribunales ordinarios de la ${jurisdiccion}, República Argentina.`)

  // ── CONTACTO ─────────────────────────────────────────────────
  h1('Contacto')
  body(`Para consultas, reclamos o cualquier comunicación relacionada con los presentes Términos, el Usuario puede contactarse con ${nombreComercial} a través de los siguientes medios:`)
  body(`• Correo electrónico: ${emailContacto}`)
  body(`• Domicilio: ${domicilio}`)
  if (str(datos.telefono_contacto)) {
    body(`• Teléfono: ${str(datos.telefono_contacto)}`)
  }
  if (tipoPlatform !== 'app' && urlWebsite) {
    body(`• Sitio web: ${urlWebsite}`)
  }

  // ── CIERRE ────────────────────────────────────────────────────
  add(p('—', { center: true, spaceBefore: 320 }))
  add(p(`Documento generado por Zonda Legal en nombre de ${nombreComercial}.`, { center: true, italic: true, fontSize: SZ_SMALL }))
  add(p('Este borrador debe ser revisado por un abogado antes de su publicación.', { center: true, italic: true, fontSize: SZ_SMALL }))

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

  if (tramite.tipo !== 'TYC')
    return new NextResponse('El trámite no es de tipo TYC', { status: 400 })

  const datos = tramite.datos_cliente as Datos | null
  if (!datos)
    return new NextResponse('El cliente aún no completó el cuestionario', { status: 422 })

  const datosPropuesta = (tramite.datos_propuesta ?? {}) as Datos

  const tmpDir = join(tmpdir(), `tyc_${randomUUID()}`)
  try {
    mkdirSync(tmpDir, { recursive: true })
    mkdirSync(join(tmpDir, '_rels'),         { recursive: true })
    mkdirSync(join(tmpDir, 'word', '_rels'), { recursive: true })
    mkdirSync(join(tmpDir, 'docProps'),      { recursive: true })

    const nombreDoc      = String(datos.nombre_documento ?? 'tyc')
    const nombreComercial = String(datos.nombre_comercial || datos.nombre_legal || 'empresa')
    const titleDoc = nombreDoc === 'servicio'
      ? 'Términos de Servicio'
      : nombreDoc === 'uso'
      ? 'Términos de Uso'
      : 'Términos y Condiciones'

    const paras = buildTyCParagraphs(datos, datosPropuesta)

    writeFileSync(join(tmpDir, '[Content_Types].xml'),               buildContentTypes(),    'utf8')
    writeFileSync(join(tmpDir, '_rels', '.rels'),                    buildRootRels(),        'utf8')
    writeFileSync(join(tmpDir, 'word', 'document.xml'),              buildDocumentXml(paras),'utf8')
    writeFileSync(join(tmpDir, 'word', 'styles.xml'),                buildStylesXml(),       'utf8')
    writeFileSync(join(tmpDir, 'word', 'footer.xml'),                buildFooterXml(),       'utf8')
    writeFileSync(join(tmpDir, 'word', '_rels', 'document.xml.rels'), buildWordRels(),       'utf8')
    writeFileSync(join(tmpDir, 'docProps', 'core.xml'),              buildCoreXml(`${titleDoc} — ${nombreComercial}`), 'utf8')
    writeFileSync(join(tmpDir, 'docProps', 'app.xml'),               buildAppXml(),          'utf8')

    const outputPath = join(tmpdir(), `tyc_${randomUUID()}.docx`)
    execSync(`cd "${tmpDir}" && zip -r -q "${outputPath}" .`)

    const buf      = readFileSync(outputPath)
    const safeName = nombreComercial.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase()
    const fileName = `${nombreDoc}_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`

    try { rmSync(outputPath) } catch { /* ignore */ }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })

  } catch (err) {
    console.error('[generar-tyc] Error:', err)
    return new NextResponse(`Error generando el documento: ${String(err)}`, { status: 500 })
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
