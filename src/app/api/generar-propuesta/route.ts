import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ClaseNiza {
  numero: number
  nombre: string
  descripcion_cliente?: string
  motivo?: string
}

interface DatosPropuesta {
  nombre_marca: string
  descripcion_productos_servicios: string
  clases_niza: ClaseNiza[]
  num_clases: number
  honorarios_por_clase: number
  arancel_inpi_por_clase: number
  total_honorarios: number
  total_arancel: number
  total_propuesta: number
}

function ars(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

// Descargar imagen como Buffer (para incrustar logo en PDF)
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  }
}

async function generarPDF(
  datos: DatosPropuesta,
  partnerNombre: string,
  partnerLogoUrl: string | null,
  clienteNombre: string,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdfkit')
  const PDFDocument = mod.default ?? mod

  // Pre-fetch logo antes de abrir el documento
  const logoBuf = partnerLogoUrl ? await fetchImageBuffer(partnerLogoUrl) : null

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: `Propuesta de Marca — ${datos.nombre_marca}`,
        Author: partnerNombre,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW = doc.page.width - 144  // ancho útil (márgenes izq + der = 144)
    const L = 72  // margen izquierdo

    // ── Fecha y destinatario ───────────────────────────────────
    const fecha = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })

    doc
      .font('Times-Roman')
      .fontSize(11)
      .fillColor('#111827')
      .text(`Mendoza, ${fecha}`)
      .moveDown(0.6)
      .text(`A ${clienteNombre}`)
      .moveDown(0.6)

    // REF en negrita
    doc
      .font('Times-Bold')
      .text('REF. Presupuesto de registro de marca')
      .moveDown(1)

    // ── Saludo y apertura ──────────────────────────────────────
    doc
      .font('Times-Roman')
      .fontSize(11)
      .text('De nuestra mayor consideración:', { continued: false })
      .moveDown(0.5)
      .text(
        `Tenemos el agrado de dirigirnos a Ud. a fin de remitirle el detalle del presupuesto de gastos y honorarios para llevar a cabo el registro de las marcas "${datos.nombre_marca}" ante el Instituto Nacional de la Propiedad Industrial (INPI).`,
        { align: 'justify', lineGap: 3 }
      )
      .moveDown(1.2)

    // ── Sección: Clasificación ─────────────────────────────────
    doc
      .font('Times-Bold')
      .fontSize(12)
      .text('Clasificación de la marca')
      .moveDown(0.4)

    doc
      .font('Times-Roman')
      .fontSize(11)
      .text(
        'Las clases son categorías de productos o servicios que determinan el alcance de protección de la marca a registrar. Como se detalla más adelante, los costos de registro son por clase. Las clases detalladas a continuación describen productos y servicios brindados por el interesado, por ello, se brinda en orden de prioridad la lista de las clases que se deberían registrar:',
        { align: 'justify', lineGap: 3 }
      )
      .moveDown(0.7)

    // Lista de clases — usa descripcion_cliente si está disponible
    datos.clases_niza.forEach((c, i) => {
      const textoClase = c.descripcion_cliente ?? c.nombre
      doc
        .font('Times-Bold')
        .text(`Clase ${c.numero}: `, { continued: true })
        .font('Times-Roman')
        .text(textoClase, { align: 'justify', lineGap: 2 })
      if (i < datos.clases_niza.length - 1) doc.moveDown(0.3)
    })
    doc.moveDown(0.7)

    doc
      .font('Times-Roman')
      .fontSize(11)
      .text(
        'Al registrar la marca podemos realizar una selección de términos dentro de la clase que le permita prever nuevos productos que a día de hoy no produzca, pero tenga el proyecto de hacerlo, esto no tiene ningún costo adicional mientras se mantenga dentro de la misma clase.',
        { align: 'justify', lineGap: 3 }
      )
      .moveDown(1.2)

    // ── Sección: Servicios ─────────────────────────────────────
    doc
      .font('Times-Bold')
      .fontSize(12)
      .text('Servicios para el registro de marcas')
      .moveDown(0.4)

    doc
      .font('Times-Roman')
      .fontSize(11)
      .text('A continuación se detallan los servicios a realizar por el estudio:')
      .moveDown(0.5)

    const servicios = [
      { num: '1)', titulo: 'Exámen de viabilidad:', desc: 'Análisis de marcas vigentes que puedan presentar un grado de similitud que genere riesgo de rechazo de la solicitud; elaboración de informe a presentar en el plazo de 5 días hábiles desde la contratación.' },
      { num: '2)', titulo: 'Solicitud de registro:', desc: 'Recolección de documentos, elaboración de la presentación, categorización de productos/servicios según TMClass y presentación de solicitud ante las oficinas de marcas.' },
      { num: '3)', titulo: 'Seguimiento de trámite:', desc: 'Seguimiento semanal del caso e integración al sistema de notificaciones; presentación de reportes inmediatos por novedades en el trámite y reporte bimestral en caso de ausencia de movimientos.' },
      { num: '4)', titulo: 'Vigilancia de marca:', desc: 'Durante el tiempo que dure el trámite de registro, hasta la concesión o rechazo de la marca, se realizará la custodia de la marca mediante un software de vigilancia que nos permite detectar si otra marca similar quiere ser registrada.' },
    ]

    servicios.forEach((s, i) => {
      doc
        .font('Times-Roman')
        .text(`${s.num} `, { continued: true })
        .font('Times-Bold')
        .text(s.titulo + ' ', { continued: true })
        .font('Times-Roman')
        .text(s.desc, { align: 'justify', lineGap: 3 })
      if (i < servicios.length - 1) doc.moveDown(0.4)
    })
    doc.moveDown(1.2)

    // ── Aclaraciones ───────────────────────────────────────────
    doc
      .font('Times-Bold')
      .fontSize(12)
      .text('Aclaraciones:')
      .moveDown(0.4)

    const aclaraciones = [
      'Se encuentra incluida la remisión del título digital de marca.',
      'El valor de los servicios no sufre ninguna modificación en caso de registrar una marca que incluya logotipo.',
      'Esta propuesta no incluye servicios no mencionados, como puede ser la contestación de una vista de alguna oficina de marcas u oposición de terceros.',
    ]

    aclaraciones.forEach(a => {
      doc
        .font('Times-Roman')
        .fontSize(11)
        .text(`• ${a}`, { align: 'justify', lineGap: 3, indent: 10 })
      doc.moveDown(0.3)
    })
    doc.moveDown(0.9)

    // ── Presupuesto de inversión ───────────────────────────────
    doc
      .font('Times-Bold')
      .fontSize(12)
      .text('Presupuesto de inversión')
      .moveDown(0.4)

    doc
      .font('Times-Roman')
      .fontSize(11)
      .text(
        `Como antes se aclaró, los costos de registro de marcas son por clase y por ello se debe multiplicar por la cantidad de clases que seleccione proteger. Los costos específicos se detallarán a continuación:`,
        { align: 'justify', lineGap: 3 }
      )
      .moveDown(0.8)

    // Tabla de costos
    const colWidths = [60, pageW - 60 - 110, 110]
    const rowH = 22
    const tableX = L
    let tableY = doc.y

    // Encabezado de tabla
    doc.rect(tableX, tableY, pageW, rowH).fill('#1F2937')
    doc.font('Times-Bold').fontSize(10).fillColor('#FFFFFF')
    doc.text('Unidades', tableX + 8, tableY + 6, { width: colWidths[0] - 8 })
    doc.text('Concepto', tableX + colWidths[0] + 8, tableY + 6, { width: colWidths[1] - 8 })
    doc.text('Monto', tableX + colWidths[0] + colWidths[1] + 8, tableY + 6, { width: colWidths[2] - 16, align: 'right' })
    tableY += rowH

    // Filas de datos — unidades = número de clases seleccionadas, monto = total (clases × precio)
    const nc = String(datos.num_clases)
    const filas = [
      { u: nc, concepto: `Arancel INPI (${ars(datos.arancel_inpi_por_clase)} × clase)`, monto: `$ ${ars(datos.total_arancel)}`,     bg: '#F9FAFB' },
      { u: nc, concepto: `Honorarios profesionales (${ars(datos.honorarios_por_clase)} × clase)`,  monto: `$ ${ars(datos.total_honorarios)}`, bg: '#FFFFFF' },
    ]

    filas.forEach(f => {
      doc.rect(tableX, tableY, pageW, rowH).fill(f.bg)
      doc.font('Times-Roman').fontSize(10).fillColor('#374151')
      doc.text(f.u, tableX + 8, tableY + 6, { width: colWidths[0] - 8 })
      doc.text(f.concepto, tableX + colWidths[0] + 8, tableY + 6, { width: colWidths[1] - 8 })
      doc.text(f.monto, tableX + colWidths[0] + colWidths[1] + 8, tableY + 6, { width: colWidths[2] - 16, align: 'right' })

      // Bordes horizontales
      doc.moveTo(tableX, tableY).lineTo(tableX + pageW, tableY).strokeColor('#E5E7EB').lineWidth(0.5).stroke()
      tableY += rowH
    })

    // Fila total
    doc.rect(tableX, tableY, pageW, rowH + 2).fill('#1F2937')
    doc.font('Times-Bold').fontSize(10).fillColor('#FFFFFF')
    doc.text('Monto Final', tableX + 8, tableY + 7, { width: colWidths[0] + colWidths[1] - 8 })
    doc.text(`$ ${ars(datos.total_propuesta)}`, tableX + colWidths[0] + colWidths[1] + 8, tableY + 7, { width: colWidths[2] - 16, align: 'right' })
    tableY += rowH + 2

    // Borde exterior de tabla
    doc.rect(tableX, doc.y - (rowH * filas.length) - rowH - rowH - 2, pageW, rowH * filas.length + rowH + rowH + 2)
      .undash().strokeColor('#D1D5DB').lineWidth(0.5).stroke()

    doc.y = tableY + 16

    // ── Cierre y firma ─────────────────────────────────────────
    doc
      .font('Times-Roman')
      .fontSize(11)
      .fillColor('#111827')
      .text('Sin otro particular lo saluda atentamente,')
      .moveDown(2)

    // Logo del partner (si existe) o nombre como texto
    if (logoBuf) {
      try {
        doc.image(logoBuf, L, doc.y, { fit: [160, 60], align: 'left' })
        doc.moveDown(4)
      } catch {
        // Fallback si el logo no se puede renderizar
        doc.font('Times-Bold').fontSize(12).text(partnerNombre)
      }
    } else {
      doc.font('Times-Bold').fontSize(12).text(partnerNombre)
    }

    doc.end()
  })
}

// ── GET /api/generar-propuesta?tramiteId=xxx ────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tramiteId = searchParams.get('tramiteId')

  if (!tramiteId) {
    return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: tramite, error } = await supabase
    .from('tramites')
    .select('id, tipo, datos_propuesta, cliente_id, partner_id')
    .eq('id', tramiteId)
    .single()

  if (error || !tramite) {
    return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })
  }

  const datos = tramite.datos_propuesta as DatosPropuesta | null
  if (!datos) {
    return NextResponse.json({ error: 'No hay propuesta generada para este trámite' }, { status: 400 })
  }

  const { data: partner } = tramite.partner_id
    ? await supabase.from('perfiles').select('nombre, logo_url').eq('id', tramite.partner_id).single()
    : { data: null }

  const { data: clientePerfil } = await supabase
    .from('perfiles').select('nombre').eq('id', tramite.cliente_id).single()

  try {
    const pdfBuffer = await generarPDF(
      datos,
      partner?.nombre ?? 'Estudio Jurídico',
      partner?.logo_url ?? null,
      clientePerfil?.nombre ?? 'Cliente',
    )

    const nombreArchivo = `propuesta_${datos.nombre_marca.replace(/\s+/g, '_').toLowerCase()}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err) {
    console.error('Error generando propuesta PDF:', err)
    return NextResponse.json({ error: 'Error generando el PDF' }, { status: 500 })
  }
}
