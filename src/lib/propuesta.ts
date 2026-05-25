// Utilidades compartidas para la propuesta de honorarios MARCAS

export interface ClaseNiza {
  numero: number
  nombre: string
  motivo?: string
  descripcion_cliente?: string
}

export interface DatosPropuesta {
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

export function ars(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function buildEmailHTML(
  datos: DatosPropuesta,
  clienteNombre: string,
  clienteEmail: string,
  clientePassword: string,
  partnerNombre: string,
  appUrl: string,
  tramiteId: string,
): string {
  const clasesList = datos.clases_niza
    .map(c => `<li><strong>Clase ${c.numero}</strong> — ${c.nombre}</li>`)
    .join('')

  const propuestaUrl = `${appUrl}/api/generar-propuesta?tramiteId=${tramiteId}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; margin: 0; padding: 0; color: #111827; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #E5E7EB; }
  .header { background: #1D4ED8; padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
  .header p { color: #BFDBFE; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 32px; }
  .greeting { font-size: 16px; color: #374151; margin-bottom: 16px; }
  .section-title { font-size: 13px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; margin: 24px 0 8px; }
  .info-box { background: #F3F4F6; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .info-box p { margin: 4px 0; font-size: 14px; color: #374151; }
  .cost-table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  .cost-table th { background: #F3F4F6; font-size: 11px; color: #6B7280; text-align: left; padding: 8px 12px; }
  .cost-table td { padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #F3F4F6; }
  .cost-table .total td { background: #1D4ED8; color: #fff; font-weight: 700; border-bottom: none; }
  .credentials { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 8px; padding: 16px; margin: 20px 0; }
  .credentials p { margin: 4px 0; font-size: 14px; color: #3730A3; }
  .btn { display: inline-block; background: #1D4ED8; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 4px 8px 0; }
  .btn-outline { background: #fff; color: #1D4ED8 !important; border: 1.5px solid #1D4ED8; }
  .footer { background: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 16px 32px; font-size: 12px; color: #9CA3AF; text-align: center; }
  ul { padding-left: 20px; margin: 8px 0; }
  li { font-size: 13px; color: #374151; margin: 4px 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Propuesta de Registro de Marca</h1>
    <p>${partnerNombre}</p>
  </div>
  <div class="body">
    <p class="greeting">Hola <strong>${clienteNombre}</strong>,</p>
    <p style="font-size:14px;color:#374151;">
      Preparamos tu propuesta personalizada para el registro de la marca <strong>${datos.nombre_marca}</strong>.
      A continuación encontrás el detalle de clases y costos, junto con tus credenciales para acceder al portal.
    </p>

    <p class="section-title">Datos de la propuesta</p>
    <div class="info-box">
      <p><strong>Marca:</strong> ${datos.nombre_marca}</p>
      <p><strong>Descripción:</strong> ${datos.descripcion_productos_servicios}</p>
    </div>

    <p class="section-title">Clases de Niza a registrar (${datos.num_clases})</p>
    <ul>${clasesList}</ul>

    <p class="section-title">Costos</p>
    <table class="cost-table">
      <tr><th>Concepto</th><th style="text-align:right">Monto</th></tr>
      <tr>
        <td>Honorarios profesionales (${datos.num_clases} clase${datos.num_clases !== 1 ? 's' : ''} × ${ars(datos.honorarios_por_clase)})</td>
        <td style="text-align:right">${ars(datos.total_honorarios)}</td>
      </tr>
      <tr>
        <td>Arancel INPI (${datos.num_clases} clase${datos.num_clases !== 1 ? 's' : ''} × ${ars(datos.arancel_inpi_por_clase)})</td>
        <td style="text-align:right">${ars(datos.total_arancel)}</td>
      </tr>
      <tr class="total">
        <td>TOTAL</td>
        <td style="text-align:right">${ars(datos.total_propuesta)}</td>
      </tr>
    </table>

    <p style="margin:0 0 8px;"><a href="${propuestaUrl}" class="btn">📄 Descargar propuesta en PDF</a></p>

    <p style="font-size:14px;color:#374151;margin-top:20px;">
      En caso de querer avanzar con el registro, podés ingresar al portal para completar los datos del o los titulares de la marca y seguir el estado de tu trámite en tiempo real.
    </p>

    <div class="credentials">
      <p style="font-weight:700;margin-bottom:8px;">Tus credenciales de acceso al portal:</p>
      <p>Email: <strong>${clienteEmail}</strong></p>
      <p>Contraseña: <strong>${clientePassword}</strong></p>
      <p style="margin-top:8px;font-size:12px;color:#6B7280;">Esta contraseña es de uso temporal para tu primer ingreso. Al entrar al portal el sistema te pedirá que elijas tu propia contraseña.</p>
    </div>

    <p style="margin:8px 0 0;"><a href="${appUrl}/login" class="btn btn-outline">Ingresar al portal →</a></p>

    <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">
      Esta propuesta tiene validez de 30 días. Los aranceles INPI pueden estar sujetos a actualización. No incluye IVA.
    </p>
  </div>
  <div class="footer">
    Propuesta generada por ${partnerNombre} · Plataforma Zonda Legal
  </div>
</div>
</body>
</html>`
}

export async function enviarPropuestaEmail(params: {
  datos: DatosPropuesta
  clienteNombre: string
  clienteEmail: string
  clientePassword: string
  partnerNombre: string
  tramiteId: string
}): Promise<{ enviado: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'propuestas@zondalegal.com'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zondalegal.com'

  console.log('[Resend] apiKey present:', !!apiKey, '| from:', fromEmail)

  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY no configurado — email no enviado')
    return { enviado: false, error: 'RESEND_API_KEY no configurado' }
  }

  const htmlBody = buildEmailHTML(
    params.datos,
    params.clienteNombre,
    params.clienteEmail,
    params.clientePassword,
    params.partnerNombre,
    appUrl,
    params.tramiteId,
  )

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${params.partnerNombre} vía Zonda Legal <${fromEmail}>`,
        to: [params.clienteEmail],
        subject: `Tu propuesta de registro de marca "${params.datos.nombre_marca}"`,
        html: htmlBody,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Resend] API error', res.status, errText)
      return { enviado: false, error: `Resend ${res.status}: ${errText}` }
    }

    return { enviado: true }
  } catch (err) {
    console.error('Error enviando email:', err)
    return { enviado: false, error: String(err) }
  }
}
