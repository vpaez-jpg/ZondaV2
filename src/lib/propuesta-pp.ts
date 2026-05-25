/**
 * Lógica de servidor para la propuesta de Políticas de Privacidad:
 * generación de email HTML y envío via Resend.
 * SOLO para uso en Server Components, Server Actions y Route Handlers.
 */

// ── Tipos ──────────────────────────────────────────────────────
export interface DatosPropuestaPP {
  precio_24hs:    number
  precio_3dias:   number
  precio_5dias:   number
  ofrece_reunion: boolean
}

// ── Email HTML ─────────────────────────────────────────────────
export function buildEmailHTMLPP(
  datos: DatosPropuestaPP,
  clienteNombre: string,
  clienteEmail: string,
  clientePassword: string,
  partnerNombre: string,
  appUrl: string,
): string {
  function ars(n: number) {
    return '$ ' + Math.round(n).toLocaleString('es-AR')
  }

  const portalUrl = `${appUrl}/cliente/dashboard`

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
  .pricing-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #F9FAFB; }
  .pricing-row:last-child { border-bottom: none; }
  .tier-label { font-size: 14px; color: #374151; font-weight: 600; }
  .tier-sub { font-size: 12px; color: #9CA3AF; margin-top: 2px; }
  .tier-price { font-size: 16px; font-weight: 700; color: #111827; }
  .highlight { background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 18px; margin: 8px 0 16px; }
  .credentials { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px 18px; margin: 20px 0; }
  .credentials p { margin: 4px 0; font-size: 14px; color: #334155; }
  .credentials strong { color: #0F172A; }
  .btn { display: inline-block; background: #0F172A; color: #fff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px; }
  .note { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #92400E; }
  .footer { background: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 16px 32px; font-size: 12px; color: #9CA3AF; text-align: center; }
  .badge { display: inline-block; background: #DCFCE7; color: #166534; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; margin-left: 6px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Propuesta de Políticas de Privacidad</h1>
    <p>${partnerNombre} · a través de Zonda Legal</p>
  </div>
  <div class="body">
    <p style="font-size:15px;color:#374151;margin-bottom:4px;">Hola <strong>${clienteNombre}</strong>,</p>
    <p style="font-size:14px;color:#6B7280;margin-top:4px;">
      ${partnerNombre} te comparte una propuesta para la redacción de las Políticas de Privacidad de tu plataforma, adaptadas a la legislación argentina (Ley 25.326 de Protección de Datos Personales) y a las características específicas de tu negocio.
    </p>

    <div class="section-title">Opciones de entrega</div>
    <div class="highlight">
      <div class="pricing-row">
        <div>
          <div class="tier-label">Entrega en 24 horas</div>
          <div class="tier-sub">Recibís las Políticas de Privacidad el día hábil siguiente</div>
        </div>
        <div class="tier-price">${ars(datos.precio_24hs)}</div>
      </div>
      <div class="pricing-row">
        <div>
          <div class="tier-label">Entrega en 3 días hábiles</div>
          <div class="tier-sub">Entrega con revisión incluida</div>
        </div>
        <div class="tier-price">${ars(datos.precio_3dias)}</div>
      </div>
      <div class="pricing-row">
        <div>
          <div class="tier-label">Entrega en 5 días hábiles</div>
          <div class="tier-sub">La opción más económica, sin apuro</div>
        </div>
        <div class="tier-price">${ars(datos.precio_5dias)}</div>
      </div>
      ${datos.ofrece_reunion ? `
      <div class="pricing-row" style="border-top:1px dashed #E2E8F0;margin-top:4px;padding-top:12px;">
        <div>
          <div class="tier-label">Reunión de consulta <span class="badge" style="background:#DCFCE7;color:#166534;">Incluida</span></div>
          <div class="tier-sub">Podés solicitar una reunión para revisar las Políticas con tu abogado</div>
        </div>
        <div class="tier-price" style="font-size:14px;color:#166534;">Sin costo</div>
      </div>
      ` : ''}
    </div>

    <p style="font-size:13px;color:#6B7280;">
      El precio incluye la redacción completa de las Políticas de Privacidad a medida, según la información que nos brindes, una revisión y ajustes menores. El documento se entrega en formato Word y PDF.
    </p>

    <div class="section-title">Cómo avanzar</div>
    <p style="font-size:14px;color:#374151;">
      Para continuar, ingresá al portal de clientes y completá el cuestionario con los datos de tu empresa y las características de tu plataforma. Con esa información redactamos tus Políticas de Privacidad.
    </p>

    <div class="credentials">
      <p style="font-size:12px;color:#9CA3AF;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Tus credenciales de acceso</p>
      <p><strong>Email:</strong> ${clienteEmail}</p>
      <p><strong>Contraseña temporal:</strong> ${clientePassword}</p>
      <p style="font-size:12px;color:#9CA3AF;margin-top:8px;">Podés cambiarla desde tu perfil una vez que ingreses.</p>
    </div>

    <a href="${portalUrl}" class="btn">Ingresar al portal</a>

    <div class="note">
      El pago se coordina directamente con ${partnerNombre}. Una vez que completes el cuestionario, recibirás las Políticas de Privacidad en el plazo seleccionado.
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
export async function enviarPropuestaPPEmail(opts: {
  datos: DatosPropuestaPP
  clienteNombre:   string
  clienteEmail:    string
  clientePassword: string
  partnerNombre:   string
  tramiteId:       string
}): Promise<{ enviado: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zondalegal.com'

  if (!apiKey) {
    console.warn('propuesta-pp: RESEND_API_KEY no configurada, email no enviado')
    return { enviado: false, error: 'API key no configurada' }
  }

  const html = buildEmailHTMLPP(
    opts.datos,
    opts.clienteNombre,
    opts.clienteEmail,
    opts.clientePassword,
    opts.partnerNombre,
    appUrl,
  )

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    'Zonda Legal <noreply@zondalegal.com>',
      to:      [opts.clienteEmail],
      subject: `Tu propuesta de Políticas de Privacidad — ${opts.partnerNombre}`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Resend error PP:', body)
    return { enviado: false, error: body }
  }

  return { enviado: true }
}
