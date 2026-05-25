/**
 * Lógica de servidor para propuestas de amparo judicial (Art. 9 Ley 24.463 y Ganancias):
 * generación de email HTML y envío via Resend.
 * SOLO para uso en Server Components, Server Actions y Route Handlers.
 */

export type TipoAmparo = 'ART9' | 'GANANCIAS'

// ── Tipos ──────────────────────────────────────────────────────
export interface DatosPropuestaAmparo {
  precio_cliente: number   // precio acordado con el cliente (editable por el partner)
  incluye_porcentaje: boolean  // si el partner también cobra el 20% del recupero
}

// ── Helpers ────────────────────────────────────────────────────
function ars(n: number) {
  return '$ ' + Math.round(n).toLocaleString('es-AR')
}

function labelAmparo(tipo: TipoAmparo) {
  return tipo === 'ART9'
    ? 'Reclamo por Descuento Art. 9 Ley 24.463'
    : 'Reclamo por Impuesto a las Ganancias sobre Jubilación'
}

function labelCorto(tipo: TipoAmparo) {
  return tipo === 'ART9' ? 'Amparo Art. 9' : 'Amparo Ganancias'
}

// ── Email HTML ─────────────────────────────────────────────────
export function buildEmailHTMLAmparo(
  tipo: TipoAmparo,
  datos: DatosPropuestaAmparo,
  clienteNombre: string,
  clienteEmail: string,
  clientePassword: string,
  partnerNombre: string,
  appUrl: string,
): string {
  const portalUrl = `${appUrl}/cliente/dashboard`
  const tituloServicio = labelAmparo(tipo)
  const labelCortoServicio = labelCorto(tipo)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; margin: 0; padding: 0; color: #111827; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #E5E7EB; }
  .header { background: #1E293B; padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
  .header p { color: #94A3B8; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 32px; }
  .section-title { font-size: 12px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: .06em; margin: 24px 0 8px; border-bottom: 1px solid #F3F4F6; padding-bottom: 6px; }
  .highlight { background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px 18px; margin: 8px 0 16px; }
  .price-row { display: flex; justify-content: space-between; align-items: center; }
  .price-label { font-size: 15px; font-weight: 600; color: #374151; }
  .price-amount { font-size: 22px; font-weight: 700; color: #0F172A; }
  .credentials { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px 18px; margin: 20px 0; }
  .credentials p { margin: 4px 0; font-size: 14px; color: #334155; }
  .credentials strong { color: #0F172A; }
  .btn { display: inline-block; background: #0F172A; color: #fff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px; }
  .note { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #92400E; }
  .steps { margin: 0; padding-left: 20px; }
  .steps li { font-size: 14px; color: #374151; margin-bottom: 8px; }
  .footer { background: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 16px 32px; font-size: 12px; color: #9CA3AF; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${tituloServicio}</h1>
    <p>${partnerNombre} · a través de Zonda Legal</p>
  </div>
  <div class="body">
    <p style="font-size:15px;color:#374151;margin-bottom:4px;">Hola <strong>${clienteNombre}</strong>,</p>
    <p style="font-size:14px;color:#6B7280;margin-top:4px;">
      ${partnerNombre} te comparte una propuesta para iniciar tu <strong>${labelCortoServicio}</strong>.
      Se trata de un reclamo judicial para que ANSES/ARCA deje de descontarte sumas que no corresponden y te reintegre lo retenido en los últimos ${tipo === 'ART9' ? '2' : '5'} años.
    </p>

    <div class="section-title">Honorarios</div>
    <div class="highlight">
      <div class="price-row">
        <div class="price-label">Inicio de la acción de amparo</div>
        <div class="price-amount">${ars(datos.precio_cliente)}</div>
      </div>
      ${datos.incluye_porcentaje ? `
      <p style="font-size:13px;color:#6B7280;margin:10px 0 0;">
        Adicionalmente, se acordará el <strong>20% de lo que se recupere</strong> una vez obtenida la sentencia favorable.
      </p>
      ` : ''}
    </div>

    <p style="font-size:13px;color:#6B7280;">
      El honorario incluye la redacción y presentación del escrito de inicio de la acción de amparo ante la justicia federal.
    </p>

    <div class="section-title">Cómo avanzar</div>
    <p style="font-size:14px;color:#374151;margin-bottom:8px;">
      Para que podamos preparar tu escrito, necesitamos que subas algunos documentos al portal de clientes:
    </p>
    <ul class="steps">
      <li>📄 Foto o escaneo de tu <strong>DNI</strong> (frente y dorso)</li>
      <li>📋 Tus <strong>bonos de sueldo</strong> de los últimos ${tipo === 'ART9' ? '2 años' : '5 años'} (o acceso a <strong>Mi ANSES</strong> para que los descarguemos nosotros)</li>
    </ul>

    <div class="credentials">
      <p style="font-size:12px;color:#9CA3AF;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Tus credenciales de acceso</p>
      <p><strong>Email:</strong> ${clienteEmail}</p>
      <p><strong>Contraseña temporal:</strong> ${clientePassword}</p>
      <p style="font-size:12px;color:#9CA3AF;margin-top:8px;">Podés cambiarla desde tu perfil una vez que ingreses.</p>
    </div>

    <a href="${portalUrl}" class="btn">Ingresar al portal</a>

    <div class="note">
      El pago se coordina directamente con ${partnerNombre}. Una vez que cargues tu información y documentación, redactaremos el escrito de inicio de amparo.
    </div>
  </div>
  <div class="footer">
    Este email fue generado por Zonda Legal en nombre de ${partnerNombre}.<br>
    Si tenés dudas, contactate directamente con tu abogado.
  </div>
</div>
</body>
</html>`
}

// ── Envío via Resend ───────────────────────────────────────────
export async function enviarPropuestaAmparoEmail(opts: {
  tipo:            TipoAmparo
  datos:           DatosPropuestaAmparo
  clienteNombre:   string
  clienteEmail:    string
  clientePassword: string
  partnerNombre:   string
  tramiteId:       string
}): Promise<{ enviado: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zondalegal.com'

  if (!apiKey) {
    console.warn('propuesta-amparo: RESEND_API_KEY no configurada, email no enviado')
    return { enviado: false, error: 'API key no configurada' }
  }

  const html = buildEmailHTMLAmparo(
    opts.tipo,
    opts.datos,
    opts.clienteNombre,
    opts.clienteEmail,
    opts.clientePassword,
    opts.partnerNombre,
    appUrl,
  )

  const asunto = opts.tipo === 'ART9'
    ? 'Tu propuesta – Reclamo Art. 9 Ley 24.463'
    : 'Tu propuesta – Reclamo de Ganancias sobre tu Jubilación'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    'Zonda Legal <no-reply@zondalegal.com>',
      to:      [opts.clienteEmail],
      subject: asunto,
      html,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'error')
    console.error('Resend error (amparo):', text)
    return { enviado: false, error: text }
  }
  return { enviado: true }
}
