/**
 * Generación del documento de propuesta SAS a partir de la plantilla DOCX.
 * La plantilla tiene tres placeholders de texto plano:
 *   - FECHA
 *   - ARS COMPLETAR CON VALOR DE HONORARIOS.
 *   - NOMBRE DEL ABOGADO PARTNER
 *
 * El DOCX se genera rellenando esos placeholders y el PDF se convierte
 * con LibreOffice headless (disponible en el servidor Next.js).
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

/** Resuelve la ruta al binario de LibreOffice en cualquier plataforma */
function getSofficePath(): string {
  const candidates = [
    // macOS (instalación estándar)
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    // Linux (apt, snap, etc.)
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    '/snap/bin/libreoffice',
    // Fallback: confiar en el PATH
    'soffice',
  ]
  for (const p of candidates) {
    if (p === 'soffice') return p          // fallback al final
    if (existsSync(p)) return p
  }
  return 'soffice'
}

const TEMPLATE_PATH = join(
  process.cwd(),
  'src/app/api/generar-propuesta-sas/plantilla_propuesta_sas.docx',
)

/** Escapa caracteres especiales XML */
function escXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Genera el DOCX de propuesta relleno con los datos reales */
export async function generarDocxPropuesta(
  honorarios: number,
  partnerNombre: string,
): Promise<Buffer> {
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const honorariosStr = 'ARS $' + Math.round(honorarios).toLocaleString('es-AR')

  const tmpDir = join(tmpdir(), `prop_sas_${randomUUID()}`)
  mkdirSync(tmpDir, { recursive: true })
  const unpackedDir = join(tmpDir, 'unpacked')
  mkdirSync(unpackedDir, { recursive: true })
  const docxIn = join(tmpDir, 'input.docx')
  const docxOut = join(tmpDir, 'propuesta_sas.docx')

  try {
    writeFileSync(docxIn, readFileSync(TEMPLATE_PATH))
    execSync(`unzip -o -q "${docxIn}" -d "${unpackedDir}"`)

    const xmlPath = join(unpackedDir, 'word', 'document.xml')
    let xml = readFileSync(xmlPath, 'utf8')

    // Los tres placeholders del template (texto plano en <w:t>)
    xml = xml.split('FECHA').join(escXml(fecha))
    xml = xml.split('ARS COMPLETAR CON VALOR DE HONORARIOS.').join(escXml(honorariosStr))
    xml = xml.split('NOMBRE DEL ABOGADO PARTNER').join(escXml(partnerNombre))

    writeFileSync(xmlPath, xml, 'utf8')
    execSync(`cd "${unpackedDir}" && zip -r -q "${docxOut}" .`)

    return readFileSync(docxOut)
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/** Genera el PDF de propuesta (DOCX → LibreOffice → PDF) */
export async function generarPdfPropuesta(
  honorarios: number,
  partnerNombre: string,
): Promise<Buffer> {
  const docxBuf = await generarDocxPropuesta(honorarios, partnerNombre)

  const tmpDir = join(tmpdir(), `prop_pdf_${randomUUID()}`)
  mkdirSync(tmpDir, { recursive: true })
  const docxPath = join(tmpDir, 'propuesta.docx')

  try {
    writeFileSync(docxPath, docxBuf)

    // LibreOffice headless genera el PDF en el mismo directorio
    const soffice = getSofficePath()
    execSync(
      `"${soffice}" --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`,
      { timeout: 30_000 },
    )

    const pdfPath = join(tmpDir, 'propuesta.pdf')
    return readFileSync(pdfPath)
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
