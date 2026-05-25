import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type DatosPropuestaDNDA } from '@/lib/propuesta-dnda'

function ars(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function generarPDFDNDA(
  datos: DatosPropuestaDNDA,
  partnerNombre: string,
  partnerLogoUrl: string | null,
  clienteNombre: string,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdfkit')
  const PDFDocument = mod.default ?? mod

  const logoBuf = partnerLogoUrl ? await fetchImageBuffer(partnerLogoUrl) : null

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: `Propuesta de Derechos de Autor (DNDA)`,
        Author: partnerNombre,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW = doc.page.width - 144
    const L = 72

    // ── Fecha y destinatario ───────────────────────────────────
    const fecha = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })

    doc
      .font('Times-Roman').fontSize(11).fillColor('#111827')
      .text(`Mendoza, ${fecha}`)
      .moveDown(0.6)
      .text(`A ${clienteNombre}`)
      .moveDown(0.6)

    doc
      .font('Times-Bold')
      .text('REF. Presupuesto de derechos de autor')
      .moveDown(1)

    // ── Título de sección ──────────────────────────────────────
    doc
      .font('Times-Bold').fontSize(14).fillColor('#111827')
      .text('PROTECCIÓN DE DERECHOS DE AUTOR', { align: 'center' })
      .moveDown(0.8)

    // ── Apertura ───────────────────────────────────────────────
    doc
      .font('Times-Roman').fontSize(11)
      .text('De nuestra mayor consideración:', { continued: false })
      .moveDown(0.5)
      .text(
        `El registro ante la Dirección Nacional del Derecho de Autor (DNDA) otorga una protección formal y pública sobre la obra en cuestión, brindando un respaldo legal robusto en caso de divulgación, plagio o reproducción no autorizada, y permitiendo acreditar fehacientemente la autoría y fecha de creación de la obra.`,
        { align: 'justify', lineGap: 3 }
      )
      .moveDown(1.2)

    // ── Procedimiento ──────────────────────────────────────────
    doc
      .font('Times-Bold').fontSize(12)
      .text('Procedimiento del registro')
      .moveDown(0.4)

    doc
      .font('Times-Roman').fontSize(11)
      .text('El procedimiento para registrar sus obras se compone de los siguientes pasos:')
      .moveDown(0.5)

    const pasos = [
      { num: '1)', titulo: 'Envío de la obra:', desc: 'Se deberá enviar vía correo electrónico todos los documentos en formato digital para su revisión.' },
      { num: '2)', titulo: 'Conversión a soporte físico:', desc: 'Se convertirán los documentos digitales a un soporte físico habilitado, según los requisitos establecidos por la DNDA, cuyos gastos de envío se encuentran incluidos en el monto abonado en concepto de honorarios. (No así la impresión o compra del soporte mediante el cual será enviado, por ej. pendrive)' },
      { num: '3)', titulo: 'Revisión de la obra:', desc: 'Nuestro servicio incluye una revisión integral de la obra, en un plazo máximo de 5 días hábiles, con el objeto de verificar que no exista infracción a derechos de autor de terceros.' },
      { num: '4)', titulo: 'Presentación del trámite:', desc: 'Se realizará la carga de la solicitud mediante el sistema en línea de la DNDA, asegurando el cumplimiento de todos los requisitos técnicos y legales.' },
      { num: '5)', titulo: 'Envío postal:', desc: 'Una vez completada la presentación online, se enviará la documentación física a la sede de la DNDA en Capital Federal mediante correo postal certificado.' },
      { num: '6)', titulo: 'Seguimiento:', desc: 'Por último, se cumplirá el seguimiento del expediente hasta la emisión del certificado oficial de registro, momento en el cual el cliente recibirá una copia digital del certificado.' },
    ]

    pasos.forEach((p, i) => {
      doc
        .font('Times-Roman').text(`${p.num} `, { continued: true })
        .font('Times-Bold').text(p.titulo + ' ', { continued: true })
        .font('Times-Roman').text(p.desc, { align: 'justify', lineGap: 3 })
      if (i < pasos.length - 1) doc.moveDown(0.4)
    })
    doc.moveDown(1.2)

    // ── Presupuesto ────────────────────────────────────────────
    doc
      .font('Times-Bold').fontSize(12)
      .text('Presupuesto de inversión')
      .moveDown(0.4)

    const colWidths = [60, pageW - 60 - 110, 110]
    const rowH = 22
    const tableX = L
    let tableY = doc.y

    // Encabezado
    doc.rect(tableX, tableY, pageW, rowH).fill('#1F2937')
    doc.font('Times-Bold').fontSize(10).fillColor('#FFFFFF')
    doc.text('Unidades', tableX + 8, tableY + 6, { width: colWidths[0] - 8 })
    doc.text('Concepto', tableX + colWidths[0] + 8, tableY + 6, { width: colWidths[1] - 8 })
    doc.text('Monto', tableX + colWidths[0] + colWidths[1] + 8, tableY + 6, { width: colWidths[2] - 16, align: 'right' })
    tableY += rowH

    const filas = [
      { u: '1', concepto: 'Honorarios profesionales (revisión, redacción técnica, tramitación ante DNDA, seguimiento hasta obtención de certificado)', monto: `$ ${ars(datos.honorarios)}`, bg: '#F9FAFB' },
      { u: '1', concepto: 'Arancel oficial DNDA', monto: `$ ${ars(datos.arancel_dnda)}`, bg: '#FFFFFF' },
      { u: '1', concepto: 'Envío postal certificado a Buenos Aires', monto: `$ ${ars(datos.envio_postal)}`, bg: '#F9FAFB' },
      { u: '1', concepto: 'Soporte para el envío', monto: `$ ${ars(datos.soporte)}`, bg: '#FFFFFF' },
    ]

    filas.forEach(f => {
      // Calculate row height based on text length
      const rH = f.concepto.length > 80 ? 32 : rowH
      doc.rect(tableX, tableY, pageW, rH).fill(f.bg)
      doc.font('Times-Roman').fontSize(10).fillColor('#374151')
      doc.text(f.u, tableX + 8, tableY + 6, { width: colWidths[0] - 8 })
      doc.text(f.concepto, tableX + colWidths[0] + 8, tableY + 6, { width: colWidths[1] - 8 })
      doc.text(f.monto, tableX + colWidths[0] + colWidths[1] + 8, tableY + 6, { width: colWidths[2] - 16, align: 'right' })
      doc.moveTo(tableX, tableY).lineTo(tableX + pageW, tableY).strokeColor('#E5E7EB').lineWidth(0.5).stroke()
      tableY += rH
    })

    // Fila total
    doc.rect(tableX, tableY, pageW, rowH + 2).fill('#1F2937')
    doc.font('Times-Bold').fontSize(10).fillColor('#FFFFFF')
    doc.text('MONTO FINAL', tableX + 8, tableY + 7, { width: colWidths[0] + colWidths[1] - 8 })
    doc.text(`$ ${ars(datos.total_propuesta)}`, tableX + colWidths[0] + colWidths[1] + 8, tableY + 7, { width: colWidths[2] - 16, align: 'right' })
    tableY += rowH + 2

    doc.y = tableY + 16

    // ── Nota sobre el certificado ──────────────────────────────
    doc
      .font('Times-Roman').fontSize(10).fillColor('#6B7280')
      .text(
        'El certificado se emite por la DNDA y suele demorar entre 4 y 8 semanas, dependiendo de su carga administrativa.',
        { align: 'left', lineGap: 2 }
      )
      .moveDown(1.2)

    // ── Cierre y firma ─────────────────────────────────────────
    doc
      .font('Times-Roman').fontSize(11).fillColor('#111827')
      .text('Sin otro particular lo saluda atentamente,')
      .moveDown(2)

    if (logoBuf) {
      try {
        doc.image(logoBuf, L, doc.y, { fit: [160, 60], align: 'left' })
        doc.moveDown(4)
      } catch {
        doc.font('Times-Bold').fontSize(12).text(partnerNombre)
      }
    } else {
      doc.font('Times-Bold').fontSize(12).text(partnerNombre)
    }

    doc.end()
  })
}

// ── GET /api/generar-propuesta-dnda?tramiteId=xxx ──────────────
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

  const datos = tramite.datos_propuesta as DatosPropuestaDNDA | null
  if (!datos) {
    return NextResponse.json({ error: 'No hay propuesta generada para este trámite' }, { status: 400 })
  }

  const { data: partner } = tramite.partner_id
    ? await supabase.from('perfiles').select('nombre, logo_url').eq('id', tramite.partner_id).single()
    : { data: null }

  const { data: clientePerfil } = await supabase
    .from('perfiles').select('nombre').eq('id', tramite.cliente_id).single()

  try {
    const pdfBuffer = await generarPDFDNDA(
      datos,
      partner?.nombre ?? 'Estudio Jurídico',
      partner?.logo_url ?? null,
      clientePerfil?.nombre ?? 'Cliente',
    )

    const nombreArchivo = `propuesta_dnda_${clientePerfil?.nombre?.replace(/\s+/g, '_').toLowerCase() ?? 'cliente'}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err) {
    console.error('Error generando propuesta DNDA PDF:', err)
    return NextResponse.json({ error: 'Error generando el PDF' }, { status: 500 })
  }
}
