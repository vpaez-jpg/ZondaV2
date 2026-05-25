// GET /api/generar-pp?tramiteId=...
//
// Genera el DOCX de Políticas de Privacidad desde los datos del cuestionario.
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
const SZ_TITLE     = 32   // 16 pt  (título principal)
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

// ── Content Types ──────────────────────────────────────────────
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

// ── Constructor de contenido PP ───────────────────────────────
type Datos = Record<string, unknown>

function str(v: unknown, fallback = '') { return String(v ?? fallback) }
function bool(v: unknown) { return v === true || v === 'true' }
function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(String)
}
function has(v: unknown, key: string) { return arr(v).includes(key) }

function buildPPParagraphs(datos: Datos): string[] {
  const paras: string[] = []

  function add(para: string) { paras.push(para) }
  function h1(text: string) { add(p(text, { heading: 1, spaceBefore: SPC_BEF_H1 })) }
  function h2(text: string) { add(p(text, { heading: 2, spaceBefore: SPC_BEF_H2 })) }
  function body(text: string, spaceAfter?: number) {
    add(p(text, spaceAfter !== undefined ? { spaceAfter } : {}))
  }

  // ── Datos extraídos ──
  const nombreDocumento = str(datos.nombre_documento, 'politica')
  const tituloDoc = nombreDocumento === 'aviso'
    ? 'AVISO DE PRIVACIDAD'
    : nombreDocumento === 'declaracion'
    ? 'DECLARACIÓN DE PRIVACIDAD'
    : 'POLÍTICA DE PRIVACIDAD'

  const nombreLegal     = str(datos.nombre_legal,     '[NOMBRE LEGAL]')
  const nombreComercial = str(datos.nombre_comercial) || nombreLegal
  const tipoPersona     = str(datos.tipo_persona,     'juridica')
  const cuit            = str(datos.cuit,             '[CUIT]')
  const domicilio       = str(datos.domicilio,        '[DOMICILIO]')
  const emailContacto   = str(datos.email_contacto,   '[EMAIL]')
  const emailPrivacidad = str(datos.email_privacidad) || emailContacto
  const telefono        = str(datos.telefono_contacto)

  const tipoPlatform    = str(datos.tipo_plataforma,  'website')
  const urlWebsite      = str(datos.url_website)
  const nombreApp       = str(datos.nombre_app)
  const descripcion     = str(datos.descripcion_servicio, `${nombreComercial} presta servicios a través de su plataforma digital.`)
  const usuariosUE      = bool(datos.usuarios_ue)
  const paisHosting     = str(datos.pais_hosting, 'Argentina')
  const tieneMinores    = bool(datos.tiene_menores)
  const edadMinima      = str(datos.edad_minima, '18')
  const cuentasUsuarios = bool(datos.cuentas_usuarios)
  const eliminacionCuenta = str(datos.eliminacion_cuenta, 'soporte')

  const datosPersonales      = arr(datos.datos_personales)
  const tieneDatosSensibles  = bool(datos.tiene_datos_sensibles)
  const datosSensibles       = arr(datos.datos_sensibles)
  const datosAutomaticos     = arr(datos.datos_automaticos)
  const recopilaDatosPago    = bool(datos.recopila_datos_pago)
  const procesadorPago       = str(datos.procesador_pago)
  const loginSocial          = bool(datos.login_social)
  const loginSocialOpts      = arr(datos.login_social_opts)
  const tieneApp             = bool(datos.tiene_app) || tipoPlatform !== 'website'
  const permisosApp          = arr(datos.permisos_app)

  const finalidades          = arr(datos.finalidades)
  const enviaMarketing       = bool(datos.envia_marketing)
  const canalMarketing       = arr(datos.canal_marketing)
  const analyticsUsados      = arr(datos.analytics)
  const publicidadTerceros   = bool(datos.publicidad_terceros)
  const usaIA                = bool(datos.usa_ia)
  const proveedoresIA        = str(datos.proveedores_ia)
  const transferenciaIntl    = bool(datos.transferencia_intl)
  const periodoRetencion     = str(datos.periodo_retencion)

  const medidasSeguridad     = str(datos.medidas_seguridad)
  const notificaCambios      = str(datos.notifica_cambios, 'email')
  const jurisdiccion         = str(datos.jurisdiccion, 'Mendoza')

  const fechaVigencia        = str(datos.fecha_vigencia)
  const infoAdicional        = str(datos.info_adicional)

  // helpers locales
  const entidadLabel = tipoPersona === 'fisica' ? 'el titular' : 'la empresa'
  const pronombre    = tipoPersona === 'fisica' ? '"nosotros" o "el Titular"' : '"nosotros" o "la Empresa"'
  const hoy = fechaVigencia
    ? new Date(fechaVigencia).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Determinar plataforma/canal ──
  let canalDescripcion = 'nuestro sitio web'
  if (tipoPlatform === 'app') canalDescripcion = `nuestra aplicación móvil ${nombreApp ? `"${nombreApp}"` : ''}`
  else if (tipoPlatform === 'ambas') canalDescripcion = `nuestro sitio web${urlWebsite ? ` (${urlWebsite})` : ''}${nombreApp ? ` y nuestra aplicación móvil "${nombreApp}"` : ' y nuestra aplicación móvil'}`
  else if (urlWebsite) canalDescripcion = `nuestro sitio web (${urlWebsite})`

  // Nombre del documento
  const docNombreCorto = nombreDocumento === 'aviso' ? 'Aviso de Privacidad' : nombreDocumento === 'declaracion' ? 'Declaración de Privacidad' : 'Política de Privacidad'

  // ── PORTADA ──────────────────────────────────────────────────
  add(p(`${tituloDoc} DE ${nombreComercial.toUpperCase()}`, {
    bold: true, center: true, fontSize: SZ_TITLE,
    spaceBefore: 0, spaceAfter: 120,
  }))
  add(p(`Última actualización: ${hoy}`, { center: true, italic: true, spaceAfter: 240 }))

  // ── 1. PREÁMBULO Y RESPONSABLE DEL TRATAMIENTO ───────────────
  h1('1. Preámbulo y Responsable del Tratamiento')

  h2('1.1. Alcance y compromiso')
  body(`Esta ${docNombreCorto} describe cómo ${nombreLegal} (${pronombre}) recopila, utiliza, almacena y protege la información personal de los usuarios que acceden o utilizan ${canalDescripcion}. ${descripcion}`)
  body(`En ${nombreComercial} consideramos que su privacidad es fundamental. Nos comprometemos a tratar sus datos personales con transparencia, seguridad y en cumplimiento de la Ley N° 25.326 de Protección de Datos Personales de la República Argentina y demás normativa aplicable${usuariosUE ? ', así como del Reglamento General de Protección de Datos (RGPD) de la Unión Europea' : ''}.`)

  h2('1.2. Voluntariedad del tratamiento')
  body('Usted no está legalmente obligado a proporcionarnos sus datos personales. Al utilizar nuestros servicios y proporcionarnos su información, usted confirma que lo hace de forma libre y voluntaria, con pleno conocimiento de esta Política de Privacidad.')

  h2('1.3. Identidad del responsable del tratamiento')
  body(`El responsable del tratamiento de sus datos personales es:`)
  body(`Nombre: ${nombreLegal}`)
  body(`${tipoPersona === 'juridica' ? 'CUIT' : 'CUIL'}: ${cuit}`)
  body(`Domicilio: ${domicilio}`)
  body(`Email de contacto: ${emailContacto}`)
  if (emailPrivacidad && emailPrivacidad !== emailContacto) {
    body(`Email de privacidad: ${emailPrivacidad}`)
  }
  if (telefono) body(`Teléfono: ${telefono}`)

  // ── 2. INFORMACIÓN QUE RECOPILAMOS ───────────────────────────
  h1('2. Información que recopilamos')
  body(`Recopilamos información personal de distintas maneras, según cómo usted interactúa con ${canalDescripcion}. A continuación detallamos los tipos de información que podemos recopilar.`)

  if (datosPersonales.length > 0) {
    h2('2.1. Datos que usted nos proporciona directamente')
    const nombresDatos: Record<string, string> = {
      nombre:             'nombre y apellido',
      email:              'correo electrónico',
      telefono:           'número de teléfono',
      domicilio:          'domicilio o dirección postal',
      cuit_dni:           tipoPersona === 'juridica' ? 'CUIT / número de identificación tributaria' : 'DNI / CUIT / CUIL',
      fecha_nacimiento:   'fecha de nacimiento',
      foto_perfil:        'fotografía de perfil',
      titulo_profesional: 'cargo o título profesional',
    }
    const listaPersonales = datosPersonales.map(k => nombresDatos[k] ?? k).join(', ')
    body(`Cuando usted se registra, completa formularios o interactúa con nuestros servicios, podemos recopilar la siguiente información personal: ${listaPersonales}.`)
    body('Esta información nos es proporcionada por usted de forma activa y voluntaria al utilizar nuestros servicios.')
  }

  if (datosAutomaticos.length > 0) {
    const seccion = datosPersonales.length > 0 ? '2.2.' : '2.1.'
    h2(`${seccion} Datos recopilados automáticamente`)
    const nombresAuto: Record<string, string> = {
      logs_actividad:   'registros de actividad e historial de uso',
      ip_dispositivo:   'dirección IP e información del dispositivo (modelo, sistema operativo, identificadores únicos)',
      cookies:          'cookies y tecnologías de seguimiento similares',
      ubicacion_precisa:'datos de geolocalización precisa (GPS)',
      datos_uso:        'datos de navegación y comportamiento dentro de la plataforma',
    }
    const listaAuto = datosAutomaticos.map(k => nombresAuto[k] ?? k).join(', ')
    body(`De manera automática, al utilizar ${canalDescripcion}, podemos recopilar: ${listaAuto}. Esta información se recopila mediante tecnologías estándar de rastreo y análisis de uso.`)
  }

  if (tieneDatosSensibles && datosSensibles.length > 0) {
    const idxSec = (datosPersonales.length > 0 ? 1 : 0) + (datosAutomaticos.length > 0 ? 1 : 0) + 1
    h2(`2.${idxSec}. Datos sensibles`)
    const nombresSensibles: Record<string, string> = {
      salud:               'datos relativos a la salud',
      biometricos:         'datos biométricos',
      origen_racial:       'origen racial o étnico',
      orientacion_sexual:  'orientación sexual o identidad de género',
      religion:            'creencias religiosas o filosóficas',
      opiniones_politicas: 'opiniones políticas',
    }
    const listaSensibles = datosSensibles.map(k => nombresSensibles[k] ?? k).join(', ')
    body(`En ciertos casos, y únicamente con su consentimiento expreso o cuando lo autorice la legislación aplicable, podemos procesar las siguientes categorías de datos sensibles: ${listaSensibles}. Tratamos estos datos con especial cuidado y las medidas de seguridad reforzadas que exige la Ley 25.326.`)
  }

  if (loginSocial && loginSocialOpts.length > 0) {
    const redesLabel: Record<string, string> = { google: 'Google', facebook: 'Facebook / Meta', apple: 'Apple ID', otro: 'otros proveedores' }
    const redesStr = loginSocialOpts.map(k => redesLabel[k] ?? k).join(', ')
    h2(`2.${[datosPersonales.length > 0, datosAutomaticos.length > 0, tieneDatosSensibles && datosSensibles.length > 0].filter(Boolean).length + 2}. Datos provenientes de redes sociales`)
    body(`Si usted elige registrarse o iniciar sesión mediante ${redesStr}, recibiremos información de perfil básica de dichos proveedores, como su nombre, correo electrónico y foto de perfil, de acuerdo con los permisos que usted haya otorgado. No accedemos a su contraseña ni a información que no haya autorizado expresamente.`)
  }

  if (tieneApp && permisosApp.length > 0) {
    const permisosLabel: Record<string, string> = {
      camara:                   'acceso a la cámara (para tomar fotos o videos)',
      microfono:                'acceso al micrófono (para grabación de audio)',
      contactos:                'acceso a la lista de contactos',
      ubicacion_primer_plano:   'acceso a la ubicación mientras la app está en uso (primer plano)',
      ubicacion_segundo_plano:  'acceso a la ubicación en segundo plano (pantalla bloqueada)',
      notificaciones:           'envío de notificaciones push',
    }
    const permisosStr = permisosApp.map(k => permisosLabel[k] ?? k).join('; ')
    h2('2.5. Permisos de la aplicación móvil')
    body(`Nuestra aplicación móvil puede solicitar los siguientes permisos de su dispositivo: ${permisosStr}. Cada permiso se solicita únicamente cuando es necesario para la funcionalidad correspondiente y puede ser revocado en cualquier momento desde la configuración de su dispositivo.`)
  }

  if (recopilaDatosPago) {
    h2('2.6. Datos de pago')
    if (procesadorPago) {
      body(`Si usted realiza pagos a través de nuestra plataforma, los datos financieros son procesados de forma segura por ${procesadorPago}. ${nombreComercial} no almacena números completos de tarjetas de crédito ni datos bancarios en sus propios servidores. Toda la información de pago se transmite directamente al procesador mediante protocolos de cifrado seguros.`)
    } else {
      body(`Los datos de pago son procesados a través de un proveedor externo certificado. ${nombreComercial} no almacena datos bancarios completos en sus propios servidores; la información se transmite directamente al procesador de pagos mediante protocolos de cifrado seguros.`)
    }
  }

  // ── 3. CÓMO Y POR QUÉ UTILIZAMOS SU INFORMACIÓN ─────────────
  h1('3. Cómo y por qué utilizamos su información')
  body(`Solo procesamos sus datos personales cuando contamos con una base legal válida para hacerlo. A continuación detallamos las finalidades principales del tratamiento:`)

  if (has(finalidades, 'proveer_servicio')) {
    h2('3.1. Para proveer el servicio')
    body(`Utilizamos su información para gestionar su cuenta, autenticar su identidad, proveerle acceso a las funcionalidades de ${canalDescripcion} y cumplir con las obligaciones derivadas del uso de nuestros servicios.`)
  }

  if (has(finalidades, 'mejorar_producto')) {
    h2('3.2. Para mejorar nuestros servicios')
    body(`Analizamos datos de uso de forma agregada y, en la medida de lo posible, anonimizada, para detectar errores, optimizar el rendimiento, desarrollar nuevas funcionalidades y mejorar la experiencia del usuario.`)
  }

  if (has(finalidades, 'comunicaciones_transaccionales')) {
    h2('3.3. Para comunicarnos con usted')
    body(`Le enviamos comunicaciones relacionadas con el servicio, como confirmaciones de registro, actualizaciones importantes, alertas de seguridad y respuestas a sus consultas. Estas comunicaciones son necesarias para el funcionamiento del servicio y no requieren su consentimiento adicional.`)
  }

  if (has(finalidades, 'marketing') || enviaMarketing) {
    h2('3.4. Para comunicaciones de marketing')
    const canalesStr = canalMarketing.length > 0
      ? canalMarketing.map(c => c === 'email' ? 'correo electrónico' : c === 'sms' ? 'SMS' : 'notificaciones push').join(', ')
      : 'los canales disponibles'
    body(`Solo si usted nos ha dado su consentimiento expreso (opt-in), le enviaremos comunicaciones comerciales sobre novedades, promociones y servicios de ${nombreComercial} a través de ${canalesStr}. Puede revocar este consentimiento en cualquier momento utilizando el enlace de cancelación de suscripción incluido en nuestras comunicaciones o contactándonos directamente.`)
  }

  if (has(finalidades, 'seguridad_fraude')) {
    h2('3.5. Para seguridad y prevención de fraude')
    body(`Monitoreamos patrones de uso para detectar actividades sospechosas, prevenir fraudes, proteger la integridad de la plataforma y garantizar la seguridad de todos nuestros usuarios.`)
  }

  if (has(finalidades, 'cumplimiento_legal')) {
    h2('3.6. Para el cumplimiento legal')
    body(`Procesamos y conservamos ciertos datos cuando es necesario para cumplir con obligaciones legales, fiscales o regulatorias, o cuando debemos responder a requerimientos de autoridades competentes.`)
  }

  // ── 4. CÓMO COMPARTIMOS SU INFORMACIÓN ───────────────────────
  h1('4. Cómo compartimos su información')
  body(`${nombreComercial} no vende ni alquila su información personal a terceros con fines de marketing. Solo compartimos su información en las circunstancias limitadas que se describen a continuación.`)

  h2('4.1. Proveedores de servicios de confianza')
  let proveedoresTexto = `Compartimos datos con proveedores externos seleccionados que nos asisten en la operación de la plataforma. Estos proveedores tienen acceso limitado a su información, únicamente en la medida necesaria para realizar los servicios encomendados, y están obligados a protegerla conforme a esta Política y a la normativa aplicable.`
  if (analyticsUsados.length > 0) {
    const analiticsLabel: Record<string, string> = {
      google_analytics: 'Google Analytics',
      facebook_pixel: 'Meta Pixel / Facebook',
      hotjar: 'Hotjar',
      otro: 'otras herramientas de análisis',
    }
    const analStr = analyticsUsados.map(k => analiticsLabel[k] ?? k).join(', ')
    proveedoresTexto += ` Entre nuestros proveedores de servicios se incluyen herramientas de análisis de uso como ${analStr}, infraestructura de servidores${paisHosting && paisHosting !== 'Argentina' ? ` (alojada en ${paisHosting})` : ''}, y servicios de envío de comunicaciones.`
  }
  body(proveedoresTexto)

  if (usaIA) {
    h2('4.2. Servicios de inteligencia artificial')
    const iaText = proveedoresIA
      ? `Utilizamos servicios de inteligencia artificial provistos por ${proveedoresIA}. `
      : 'Utilizamos servicios de inteligencia artificial de terceros. '
    body(`${iaText}Ciertos datos pueden ser procesados por estos proveedores de IA para brindarle funcionalidades avanzadas. Los datos se transmiten mediante conexiones cifradas y los proveedores están sujetos a compromisos de confidencialidad y protección de datos.`)
  }

  if (publicidadTerceros) {
    h2('4.3. Redes publicitarias')
    body(`Nuestra plataforma puede mostrar publicidad de terceros. Dichas redes publicitarias pueden utilizar cookies y tecnologías similares para mostrarle anuncios personalizados según sus intereses. Le recomendamos revisar las políticas de privacidad de dichas redes para comprender cómo manejan su información.`)
  }

  h2('4.4. Obligaciones legales y seguridad')
  body(`Podemos divulgar su información si así lo exige la ley o si creemos de buena fe que es necesario para: (i) cumplir con una obligación legal o requerimiento judicial válido; (ii) proteger la seguridad de cualquier persona; (iii) prevenir fraudes o abusos; o (iv) proteger los derechos y la propiedad de ${nombreComercial}.`)

  h2('4.5. Transferencias comerciales')
  body(`En caso de fusión, adquisición, reorganización o venta de activos de ${nombreLegal}, sus datos personales podrían ser transferidos como parte de dicha operación. En tal caso, le notificaremos con antelación razonable y le informaremos sus opciones al respecto.`)

  if (transferenciaIntl) {
    h2('4.6. Transferencias internacionales de datos')
    body(`Su información puede ser transferida y almacenada en servidores ubicados fuera de la República Argentina. En tales casos, adoptamos las medidas contractuales y técnicas necesarias para garantizar que sus datos reciban un nivel de protección adecuado, conforme a los estándares establecidos por la Ley 25.326 y sus normas complementarias.`)
  }

  // ── 5. SEGURIDAD Y RETENCIÓN DE DATOS ────────────────────────
  h1('5. Seguridad y retención de datos')

  h2('5.1. Medidas de seguridad')
  if (medidasSeguridad) {
    body(`La seguridad de sus datos es una prioridad para ${nombreComercial}. Implementamos medidas técnicas, administrativas y organizativas para proteger su información contra accesos no autorizados, pérdida, alteración o divulgación. Entre las medidas que aplicamos se incluyen: ${medidasSeguridad}.`)
  } else {
    body(`La seguridad de sus datos es una prioridad para ${nombreComercial}. Implementamos medidas técnicas, administrativas y organizativas comercialmente razonables para proteger su información personal contra accesos no autorizados, pérdida, alteración o divulgación indebida.`)
  }
  body(`No obstante, ningún sistema de transmisión o almacenamiento de datos es completamente infalible. Si bien nos esforzamos por utilizar los mejores métodos disponibles, no podemos garantizar la seguridad absoluta de la información transmitida a través de Internet.`)

  h2('5.2. Retención de datos')
  if (periodoRetencion) {
    body(`Conservamos su información personal durante el tiempo necesario para cumplir con las finalidades establecidas en esta Política de Privacidad. En particular: ${periodoRetencion}. Transcurrido dicho plazo, procederemos a eliminar o anonimizar su información, salvo que una obligación legal nos exija conservarla por un período mayor.`)
  } else {
    body(`Conservamos su información personal durante el tiempo que sea necesario para los fines establecidos en esta Política de Privacidad, o por el período que exija la legislación aplicable. Una vez cumplida la finalidad del tratamiento, procederemos a eliminar o anonimizar sus datos de forma segura.`)
  }

  if (cuentasUsuarios) {
    h2('5.3. Eliminación de cuenta y datos')
    let elimText = ''
    if (eliminacionCuenta === 'cuenta') {
      elimText = 'Puede solicitar la eliminación de su cuenta y de sus datos personales en cualquier momento directamente desde la configuración de su cuenta en la plataforma.'
    } else if (eliminacionCuenta === 'soporte') {
      elimText = `Puede solicitar la eliminación de su cuenta y de sus datos personales en cualquier momento contactándose con nuestro equipo de soporte en ${emailPrivacidad}.`
    } else {
      elimText = `Puede solicitar la eliminación de su cuenta y de sus datos personales en cualquier momento, ya sea directamente desde la configuración de su cuenta o contactándose con nuestro equipo en ${emailPrivacidad}.`
    }
    body(`${elimText} Una vez recibida su solicitud, desactivaremos su cuenta y eliminaremos sus datos personales de nuestros sistemas activos en un plazo razonable. Tenga en cuenta que podemos conservar cierta información cuando sea necesario para cumplir obligaciones legales o para la resolución de disputas pendientes.`)
  }

  // ── 6. SUS DERECHOS DE PRIVACIDAD ────────────────────────────
  h1('6. Sus derechos de privacidad')
  body(`De conformidad con la Ley N° 25.326 de Protección de Datos Personales y las normas concordantes, usted tiene derecho a acceder, rectificar, cancelar y oponerse al tratamiento de sus datos personales (derechos ARCO).`)

  h2('6.1. Sus derechos')
  body(`Acceso: Tiene derecho a solicitar una copia de los datos personales que tenemos sobre usted y conocer cómo los utilizamos.`)
  body(`Rectificación: Puede solicitar la corrección de cualquier dato inexacto, incompleto u obsoleto directamente desde su perfil o contactándonos.`)
  body(`Cancelación (eliminación): Puede solicitar la eliminación de sus datos personales cuando ya no sean necesarios para los fines para los que fueron recopilados, o cuando retire su consentimiento.`)
  body(`Oposición: Puede oponerse al tratamiento de sus datos para determinadas finalidades, en particular para el envío de comunicaciones de marketing.`)
  body(`Portabilidad: Tiene derecho a recibir sus datos en un formato estructurado y de uso común.`)
  body(`Retiro del consentimiento: En los casos en que el tratamiento se base en su consentimiento, puede retirarlo en cualquier momento sin que ello afecte la licitud del tratamiento previo.`)

  h2('6.2. Cómo ejercer sus derechos')
  body(`Para ejercer cualquiera de los derechos anteriores, o si tiene alguna consulta sobre el tratamiento de sus datos personales, puede contactarnos en: ${emailPrivacidad}. Daremos respuesta a su solicitud en un plazo razonable y conforme a los plazos establecidos por la normativa aplicable.`)
  body(`La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.`)

  // ── 7. PRIVACIDAD DE LOS MENORES ─────────────────────────────
  if (tieneMinores) {
    h1('7. Privacidad de los menores de edad')
    if (edadMinima === '18') {
      body(`Nuestros servicios están dirigidos exclusivamente a personas mayores de 18 años. No recopilamos intencionalmente información personal de menores de 18 años. Si usted es padre, madre o tutor y cree que su hijo/a nos ha proporcionado datos sin autorización, por favor contáctenos en ${emailPrivacidad} para proceder a su eliminación.`)
    } else {
      body(`Nuestros servicios permiten el acceso a mayores de ${edadMinima} años. Los menores de ${edadMinima} años no pueden utilizar la plataforma sin el consentimiento previo y verificable de sus padres o tutores legales. Si usted es padre, madre o tutor y cree que su hijo/a nos ha proporcionado datos sin autorización, por favor contáctenos en ${emailPrivacidad}.`)
    }
  } else {
    h1('7. Privacidad de los menores de edad')
    body(`Nuestros servicios están dirigidos exclusivamente a personas mayores de 18 años. No recopilamos intencionalmente información personal de menores de edad. Si usted es padre, madre o tutor y cree que su hijo/a nos ha proporcionado datos sin autorización, por favor contáctenos en ${emailPrivacidad} para proceder a su eliminación inmediata.`)
  }

  // ── 8. COOKIES Y TECNOLOGÍAS DE SEGUIMIENTO ──────────────────
  if (has(datosAutomaticos, 'cookies') || analyticsUsados.length > 0 || publicidadTerceros) {
    h1('8. Cookies y tecnologías de seguimiento')
    body(`Utilizamos cookies y tecnologías similares (como píxeles de seguimiento y scripts de análisis) para mejorar su experiencia de navegación, analizar el tráfico y, en su caso, mostrarle publicidad relevante.`)
    body(`Puede configurar su navegador para rechazar todas las cookies, aceptar solo algunas o eliminar las existentes. Tenga en cuenta que deshabilitar las cookies puede afectar la funcionalidad de ciertos aspectos de nuestra plataforma.`)
    if (usuariosUE) {
      body(`Para los usuarios ubicados en la Unión Europea, solicitamos su consentimiento explícito antes de instalar cookies no esenciales, conforme a los requisitos del RGPD y la Directiva ePrivacy.`)
    }
  }

  // ── 9. INTELIGENCIA ARTIFICIAL (si aplica, solo si no se incluyó antes como sección especial) ──
  if (usaIA) {
    h1('9. Inteligencia artificial')
    body(`Nuestra plataforma utiliza tecnologías de inteligencia artificial${proveedoresIA ? ` provistas por ${proveedoresIA}` : ''} para brindarle funcionalidades avanzadas. El uso de estas tecnologías puede implicar el procesamiento de sus datos para generar respuestas personalizadas, recomendaciones o automatizaciones.`)
    body(`Nos comprometemos a utilizar estas tecnologías de manera responsable, garantizando la privacidad de sus datos y adoptando medidas para minimizar los riesgos asociados al procesamiento automatizado.`)
  }

  // ── 10. CAMBIOS A ESTA POLÍTICA ──────────────────────────────
  const secCambios = usaIA ? '10' : (has(datosAutomaticos, 'cookies') || analyticsUsados.length > 0 || publicidadTerceros) ? '9' : '8'
  h1(`${secCambios}. Cambios a esta Política`)
  let notifTexto = ''
  if (notificaCambios === 'email') notifTexto = 'le notificaremos por correo electrónico'
  else if (notificaCambios === 'plataforma') notifTexto = 'publicaremos un aviso destacado en la plataforma'
  else notifTexto = 'le notificaremos por correo electrónico y publicaremos un aviso en la plataforma'
  body(`Podemos actualizar esta ${docNombreCorto} ocasionalmente para reflejar cambios en nuestras prácticas, en los servicios que ofrecemos, o por razones legales o regulatorias. Cuando realicemos cambios materiales, ${notifTexto} con antelación razonable, indicando la fecha de entrada en vigencia de la nueva versión.`)
  body(`Le recomendamos revisar esta Política periódicamente. El uso continuado de nuestros servicios después de la publicación de los cambios implica su aceptación de la Política actualizada.`)

  // ── 11. CÓMO CONTACTARNOS ─────────────────────────────────────
  const secContacto = (parseInt(secCambios) + 1).toString()
  h1(`${secContacto}. Cómo contactarnos`)
  body(`Si tiene preguntas, dudas o comentarios sobre esta ${docNombreCorto}, o si desea ejercer alguno de sus derechos, puede contactarnos en:`)
  body(`${nombreLegal}\n${domicilio}\nEmail: ${emailPrivacidad}${telefono ? `\nTeléfono: ${telefono}` : ''}`)

  if (infoAdicional) {
    h1('Información adicional')
    body(infoAdicional)
  }

  return paras
}

// ── Route handler ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autenticado', { status: 401 })

  const { data: perfil } = await supabase
    .from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'zonda')
    return new NextResponse('Acceso denegado', { status: 403 })

  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  if (!tramiteId) return new NextResponse('tramiteId requerido', { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: tramite } = await admin
    .from('tramites')
    .select('datos_cliente, datos_propuesta, tipo')
    .eq('id', tramiteId)
    .single()

  if (!tramite || tramite.tipo !== 'PP')
    return new NextResponse('Trámite PP no encontrado', { status: 404 })

  const datos: Record<string, unknown>        = tramite.datos_cliente   ?? {}
  const nombreComercial = String(datos.nombre_comercial || datos.nombre_legal || 'Empresa')
  const docNombre = String(datos.nombre_documento ?? 'politica')
  const tituloArchivo = docNombre === 'aviso' ? 'Aviso_Privacidad' : docNombre === 'declaracion' ? 'Declaracion_Privacidad' : 'Politica_Privacidad'

  // ── Construir el XML ──
  const paras  = buildPPParagraphs(datos)
  const docXml = buildDocumentXml(paras)
  const title  = `${docNombre === 'aviso' ? 'Aviso de Privacidad' : docNombre === 'declaracion' ? 'Declaración de Privacidad' : 'Política de Privacidad'} — ${nombreComercial}`

  // ── Ensamblar DOCX en tmpdir ──
  const tmpDir = join(tmpdir(), `pp-${randomUUID()}`)
  try {
    mkdirSync(join(tmpDir, 'word', '_rels'), { recursive: true })
    mkdirSync(join(tmpDir, '_rels'),         { recursive: true })
    mkdirSync(join(tmpDir, 'docProps'),      { recursive: true })

    writeFileSync(join(tmpDir, '[Content_Types].xml'),        buildContentTypes(), 'utf8')
    writeFileSync(join(tmpDir, '_rels', '.rels'),             buildRootRels(),    'utf8')
    writeFileSync(join(tmpDir, 'word', 'document.xml'),       docXml,            'utf8')
    writeFileSync(join(tmpDir, 'word', 'styles.xml'),         buildStylesXml(),  'utf8')
    writeFileSync(join(tmpDir, 'word', 'footer.xml'),         buildFooterXml(),  'utf8')
    writeFileSync(join(tmpDir, 'word', '_rels', 'document.xml.rels'), buildWordRels(), 'utf8')
    writeFileSync(join(tmpDir, 'docProps', 'core.xml'),       buildCoreXml(title), 'utf8')
    writeFileSync(join(tmpDir, 'docProps', 'app.xml'),        buildAppXml(),     'utf8')

    const outFile = join(tmpdir(), `${tituloArchivo}_${tramiteId.slice(0, 8)}.docx`)
    execSync(`cd "${tmpDir}" && zip -r "${outFile}" . -x "*.DS_Store"`)

    const buffer = readFileSync(outFile)
    rmSync(outFile, { force: true })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${tituloArchivo}_${tramiteId.slice(0, 8)}.docx"`,
      },
    })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
