import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Apoderados fijos ───────────────────────────────────────────
const APODERADOS = [
  { nombre: 'Valentín Nehuen Páez',    mat: '2682' },
  { nombre: "Franco Sileoni D'Angelo", mat: '2950' },
  { nombre: 'Hugo Matías Bindelli',    mat: '3094' },
]

const TEXTO_PODER = `poder amplio para que en su nombre y representación inicie, entienda e intervenga hasta su total terminación en los procesos administrativos frente al Instituto Nacional de la Propiedad Industrial y la Dirección Nacional de Derechos de Autor, necesarios para la obtención de patentes de invención, modelos de utilidad, marcas, modelos y diseños industriales, derechos de autor y conexos; la renovación de todos ellos, pudiendo presentarse ante las autoridades que corresponda, ya sean nacionales, provinciales o municipales, con intervenciones, solicitudes, declaraciones, descripciones, apelaciones y otros recursos; formular, limitar, modificar y retirar oposiciones, reclamos y llamados de atención; justificar explotaciones y usos; efectuar modificaciones; solicitar testimonios; pedir plazos; retirar, inspeccionar, presentar y recibir documentos; desistir y hacer cuanto fuere menester ante las autoridades administrativas de cualquier orden.\n\nAl efecto, lo faculta para que se presente ante las autoridades o terceros particulares que corresponda, con escritos, documentos y cuantos justificativos creyera necesario, como así también a constituir domicilio electrónico y recibir las notificaciones que a su nombre allí se diligencien, y toda cuanta otra facultad más le fuera necesaria, para mejor desempeño de este mandato y hasta su completa terminación.`

// ── Normalizar titulares (compatibilidad formato viejo/nuevo) ──
type Titular = Record<string, string>

function normalizarTitulares(datos: Record<string, unknown>): Titular[] {
  // Formato nuevo: titulares[]
  if (Array.isArray(datos.titulares) && datos.titulares.length > 0) {
    return datos.titulares as Titular[]
  }
  // Formato viejo: titular (objeto único)
  if (datos.titular && typeof datos.titular === 'object') {
    const t = datos.titular as Record<string, unknown>
    if (t.tipo === 'juridica') {
      return [{
        tipo: 'juridica',
        razon_social:       String(t.razon_social ?? ''),
        cuit:               String(t.cuit ?? ''),
        domicilio:          String(t.domicilio ?? ''),
        representante:      String(t.representante_legal ?? t.representante ?? ''),
        dni_representante:  String(t.dni_representante ?? ''),
        email:              String(t.email ?? ''),
        telefono:           String(t.telefono ?? ''),
        porcentaje:         '100',
      }]
    } else {
      return [{
        tipo:       'fisica',
        nombre:     String(t.nombre ?? ''),
        dni:        String(t.dni ?? ''),
        cuit:       String(t.cuit ?? ''),
        domicilio:  String(t.domicilio ?? ''),
        email:      String(t.email ?? ''),
        telefono:   String(t.telefono ?? ''),
        porcentaje: '100',
      }]
    }
  }
  return []
}

// ── Construir el párrafo inicial de la carta ───────────────────
function buildIntroPárrafo(titulares: Titular[]): string {
  const partes = titulares.map(t => {
    if (t.tipo === 'juridica') {
      return `El Sr. ${t.representante}, DNI N° ${t.dni_representante}, en representación de la sociedad ${t.razon_social} -conforme surge de los documentos adjuntos en Anexo I-`
    } else {
      let texto = `El Sr./La Sra. ${t.nombre}`
      if (t.dni)  texto += `, DNI N° ${t.dni}`
      if (t.cuit) texto += `, CUIT N° ${t.cuit}`
      if (t.domicilio) texto += `, con domicilio en ${t.domicilio}`
      return texto
    }
  })

  const otorga = titulares.length > 1 ? 'otorgan' : 'otorga'
  const intro = partes.length === 1
    ? partes[0]
    : partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1]

  const apoderadosTexto = APODERADOS.map((a, i) => {
    const prefijo = i === 0 ? `del Sr. ${a.nombre}` : `al Sr. ${a.nombre}`
    return `${prefijo}, Mat. INPI N° ${a.mat}`
  }).join(', ')

  return `${intro}, por la presente ${otorga} a favor ${apoderadosTexto} ${TEXTO_PODER}`
}

// ── Bloques de firma por titular ───────────────────────────────
interface BloquesFirma {
  aclaracion: string
  dni: string
  representaDe?: string
}

function buildBloquesFirma(titulares: Titular[]): BloquesFirma[] {
  return titulares.map(t => {
    if (t.tipo === 'juridica') {
      return {
        aclaracion:  t.representante,
        dni:         t.dni_representante,
        representaDe: t.razon_social,
      }
    } else {
      return {
        aclaracion: t.nombre,
        dni:        t.dni,
      }
    }
  })
}

// ── Generar PDF con pdfkit ─────────────────────────────────────
async function generarPDF(titulares: Titular[], nombreMarca: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdfkit')
  const PDFDocument = mod.default ?? mod

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 85, bottom: 85, left: 85, right: 85 },
      info: { Title: `Carta Poder — ${nombreMarca}`, Author: 'Zonda Legal' },
    })

    const chunks: Buffer[] = []
    doc.on('data',  (c: Buffer) => chunks.push(c))
    doc.on('end',   () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageWidth = doc.page.width - 170 // márgenes izq + der

    // ── Título ────────────────────────────────────────────────
    doc
      .font('Times-Roman')
      .fontSize(14)
      .text('CARTA PODER', { align: 'center', underline: true })
      .moveDown(1.5)

    // ── Cuerpo ────────────────────────────────────────────────
    const cuerpo = buildIntroPárrafo(titulares)
    doc
      .font('Times-Roman')
      .fontSize(12)
      .text(cuerpo, { align: 'justify', lineGap: 4 })
      .moveDown(2)

    // ── Bloques de firma ──────────────────────────────────────
    const bloques = buildBloquesFirma(titulares)

    bloques.forEach((b, i) => {
      if (i > 0) doc.moveDown(1.5)

      if (b.representaDe) {
        doc.font('Times-Bold').fontSize(11)
           .text(`En representación de: ${b.representaDe}`, { align: 'left' })
           .moveDown(0.3)
      }

      doc.font('Times-Roman').fontSize(12)

      // Línea de firma
      doc.text('Firma:', { continued: true }).text(' _______________________________', { lineGap: 4 })
      doc.moveDown(0.4)
      doc.text('Fecha:', { continued: true }).text(' _______________________________', { lineGap: 4 })
      doc.moveDown(0.4)
      doc.text(`Aclaración: ${b.aclaracion || ''}`)
      doc.moveDown(0.2)
      doc.text(`DNI: ${b.dni || ''}`)
    })

    doc.end()
  })
}

// ── Handler GET ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tramiteId = searchParams.get('tramiteId')

  if (!tramiteId) {
    return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: tramite, error: tramiteError } = await supabase
    .from('tramites')
    .select('id, tipo, datos_cliente, cliente_id')
    .eq('id', tramiteId)
    .single()

  if (tramiteError || !tramite) {
    return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })
  }

  if (tramite.cliente_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const datos = tramite.datos_cliente as Record<string, unknown> | null
  if (!datos) {
    return NextResponse.json({ error: 'El trámite no tiene datos completados' }, { status: 400 })
  }

  const titulares = normalizarTitulares(datos)
  if (titulares.length === 0) {
    return NextResponse.json({ error: 'No se encontraron datos de titulares en el trámite' }, { status: 400 })
  }

  const nombreMarca = String(datos.nombre_marca ?? 'marca')

  try {
    const pdfBuffer = await generarPDF(titulares, nombreMarca)

    const nombreArchivo = `carta_poder_${nombreMarca.replace(/\s+/g, '_').toLowerCase()}.pdf`
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err) {
    console.error('Error generando PDF:', err)
    return NextResponse.json(
      { error: 'Error generando el PDF. Verificá que pdfkit esté instalado: npm install pdfkit' },
      { status: 500 }
    )
  }
}
