/**
 * Lógica de servidor para la propuesta SAS: generación de PDF y envío de email.
 * SOLO para uso en Server Components, Server Actions y Route Handlers.
 * Los constantes y tipos están en propuesta-sas-constants.ts (seguro para cliente).
 */
import { generarPdfPropuesta } from './generar-propuesta-sas'

// Re-exportar todo desde el archivo de constantes para que los importadores existentes no rompan
export {
  TASA_CONSTITUCION_SAS,
  TASA_RESERVA_DEN_SAS,
  CAJA_FORENSE_SAS,
  GASTOS_CONSTITUCION_SAS,
  LIBROS_SOCIETARIOS_SAS,
  TASA_RUBRICA_SAS,
  GASTOS_RUBRICA_SAS,
  HONORARIOS_RECOMENDADOS_SAS,
  CORTE_ZONDA_SAS,
  arsSAS,
  type DatosPropuestaSAS,
} from './propuesta-sas-constants'

import {
  TASA_CONSTITUCION_SAS,
  TASA_RESERVA_DEN_SAS,
  CAJA_FORENSE_SAS,
  GASTOS_CONSTITUCION_SAS,
  LIBROS_SOCIETARIOS_SAS,
  TASA_RUBRICA_SAS,
  GASTOS_RUBRICA_SAS,
  arsSAS,
  type DatosPropuestaSAS,
} from './propuesta-sas-constants'

// ── Email HTML ─────────────────────────────────────────────────
export function buildEmailHTMLSAS(
  datos: DatosPropuestaSAS,
  clienteNombre: string,
  clienteEmail: string,
  clientePassword: string,
  partnerNombre: string,
  appUrl: string,
  tramiteId: string,
): string {
  const pdfUrl = `${appUrl}/api/generar-propuesta-sas?tramiteId=${tramiteId}`
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; margin: 0; padding: 0; color: #111827; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #E5E7EB; }
  .header { background: #6D28D9; padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
  .header p { color: #DDD6FE; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 32px; }
  .section-title { font-size: 13px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; margin: 24px 0 8px; }
  .cost-table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  .cost-table th { background: #F3F4F6; font-size: 11px; color: #6B7280; text-align: left; padding: 8px 12px; }
  .cost-table td { padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #F3F4F6; }
  .cost-table .total td { background: #6D28D9; color: #fff; font-weight: 700; border-bottom: none; }
  .cost-table .subtotal td { background: #F5F3FF; color: #5B21B6; font-weight: 600; border-bottom: none; }
  .note { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #92400E; }
  .credentials { background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 8px; padding: 16px; margin: 20px 0; }
  .credentials p { margin: 4px 0; font-size: 14px; color: #5B21B6; }
  .btn { display: inline-block; background: #6D28D9; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 4px 8px 0; }
  .btn-outline { background: #fff; color: #6D28D9 !important; border: 1.5px solid #6D28D9; }
  .footer { background: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 16px 32px; font-size: 12px; color: #9CA3AF; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Propuesta de Constitución e Inscripción SAS</h1>
    <p>${partnerNombre}</p>
  </div>
  <div class="body">
    <p style="font-size:16px;color:#374151;margin-bottom:16px;">Hola <strong>${clienteNombre}</strong>,</p>
    <p style="font-size:14px;color:#374151;">
      Preparamos tu propuesta para la constitución e inscripción de una
      <strong>Sociedad por Acciones Simplificada (SAS)</strong> en la Provincia de Mendoza.
      A continuación encontrás el detalle de los honorarios y gastos del trámite.
    </p>

    <p class="section-title">Etapa 1 — Constitución e inscripción</p>
    <table class="cost-table">
      <tr><th>Concepto</th><th style="text-align:right">Monto</th></tr>
      <tr><td>Honorarios profesionales</td><td style="text-align:right">${arsSAS(datos.honorarios)}</td></tr>
      <tr><td>Tasa retributiva constitución SAS (cód. 840)</td><td style="text-align:right">${arsSAS(TASA_CONSTITUCION_SAS)}</td></tr>
      <tr><td>Tasa reserva de denominación (cód. 833)</td><td style="text-align:right">${arsSAS(TASA_RESERVA_DEN_SAS)}</td></tr>
      <tr><td>Aporte Caja Forense</td><td style="text-align:right">${arsSAS(CAJA_FORENSE_SAS)}</td></tr>
      <tr class="total"><td>TOTAL ETAPA 1</td><td style="text-align:right">${arsSAS(datos.total_propuesta)}</td></tr>
    </table>

    <p class="section-title">Etapa 2 — Rúbrica de libros societarios (se abona al finalizar)</p>
    <table class="cost-table">
      <tr><th>Concepto</th><th style="text-align:right">Monto</th></tr>
      <tr><td>Libros societarios (aprox.)</td><td style="text-align:right">${arsSAS(LIBROS_SOCIETARIOS_SAS)}</td></tr>
      <tr><td>Tasas rúbrica — 5 × cód. 832</td><td style="text-align:right">${arsSAS(TASA_RUBRICA_SAS)}</td></tr>
      <tr class="subtotal"><td>TOTAL ETAPA 2</td><td style="text-align:right">${arsSAS(datos.gastos_rubrica)}</td></tr>
    </table>

    <div class="note">
      <strong>Nota:</strong> Los gastos de la Etapa 2 (libros y rúbrica) se abonan una vez obtenida
      la resolución final de inscripción en el Registro Público. No están incluidos en el adelanto inicial.
    </div>

    <p style="font-size:14px;color:#374151;margin-top:20px;">
      Para avanzar, ingresá al portal y completá los datos de tu empresa. Nuestro equipo los revisará
      para preparar el estatuto y presentar ante la DPJ.
    </p>

    <div class="credentials">
      <p style="font-weight:700;margin-bottom:8px;">Tus credenciales de acceso al portal:</p>
      <p>Email: <strong>${clienteEmail}</strong></p>
      <p>Contraseña: <strong>${clientePassword}</strong></p>
      <p style="margin-top:8px;font-size:12px;color:#6B7280;">Esta contraseña es de uso temporal para tu primer ingreso.</p>
    </div>

    <p style="margin:8px 0 0;">
      <a href="${appUrl}/login" class="btn btn-outline">Ingresar al portal →</a>
      <a href="${pdfUrl}" class="btn" style="background:#047857;">📄 Descargar propuesta (PDF)</a>
    </p>

    <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">
      Esta propuesta tiene validez de 30 días. Las tasas retributivas pueden estar sujetas a actualización.
      No incluye IVA. El plazo estimado de inscripción ante la DPJ es de 30 a 60 días hábiles.
    </p>
  </div>
  <div class="footer">
    Propuesta generada por ${partnerNombre} · Plataforma Zonda Legal
  </div>
</div>
</body>
</html>`
}

// ── Envío de email ─────────────────────────────────────────────
export async function enviarPropuestaSASEmail(params: {
  datos: DatosPropuestaSAS
  clienteNombre: string
  clienteEmail: string
  clientePassword: string
  partnerNombre: string
  tramiteId: string
}): Promise<{ enviado: boolean; error?: string }> {
  const apiKey    = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL   ?? 'propuestas@zondalegal.com'
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL  ?? 'https://app.zondalegal.com'

  console.log('[Resend SAS] apiKey present:', !!apiKey, '| from:', fromEmail)

  if (!apiKey) {
    console.warn('[Resend SAS] RESEND_API_KEY no configurado — email no enviado')
    return { enviado: false, error: 'RESEND_API_KEY no configurado' }
  }

  const htmlBody = buildEmailHTMLSAS(
    params.datos,
    params.clienteNombre,
    params.clienteEmail,
    params.clientePassword,
    params.partnerNombre,
    appUrl,
    params.tramiteId,
  )

  // ── Generar PDF adjunto desde la plantilla ─────────────────
  let pdfAttachment: { filename: string; content: string } | null = null
  try {
    const pdfBuf = await generarPdfPropuesta(params.datos.honorarios, params.partnerNombre)
    pdfAttachment = {
      filename: 'propuesta_constitucion_sas.pdf',
      content: pdfBuf.toString('base64'),
    }
    console.log('[Resend SAS] PDF generado:', pdfBuf.length, 'bytes')
  } catch (err) {
    // Si falla la generación del PDF, igualmente enviamos el email sin adjunto
    console.warn('[Resend SAS] No se pudo generar PDF adjunto:', err)
  }

  try {
    const emailPayload: Record<string, unknown> = {
      from: `${params.partnerNombre} vía Zonda Legal <${fromEmail}>`,
      to: [params.clienteEmail],
      subject: 'Tu propuesta de constitución de SAS',
      html: htmlBody,
    }

    if (pdfAttachment) {
      emailPayload.attachments = [pdfAttachment]
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailPayload),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Resend SAS] API error', res.status, errText)
      return { enviado: false, error: `Resend ${res.status}: ${errText}` }
    }

    return { enviado: true }
  } catch (err) {
    console.error('Error enviando email SAS:', err)
    return { enviado: false, error: String(err) }
  }
}
