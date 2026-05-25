// Utilidades compartidas para la propuesta de honorarios DNDA

export type TipoObra =
  | 'musica'
  | 'software'
  | 'pagina_web'
  | 'audiovisual'
  | 'artistica'
  | 'tv_radio_teatro'
  | 'multimedia'
  | 'libro_texto'

export const TIPOS_OBRA_DNDA = [
  { id: 'musica'          as TipoObra, label: 'Música',           sublabel: 'Canción, letra o álbum',               emoji: '🎵' },
  { id: 'software'        as TipoObra, label: 'Software',         sublabel: 'App, código fuente o programa',         emoji: '💻' },
  { id: 'pagina_web'      as TipoObra, label: 'Página web',       sublabel: 'Sitio web o landing page',              emoji: '🌐' },
  { id: 'audiovisual'     as TipoObra, label: 'Obra audiovisual', sublabel: 'Video, película o serie',               emoji: '🎬' },
  { id: 'artistica'       as TipoObra, label: 'Obra artística',   sublabel: 'Cuadro, fotografía o ilustración',      emoji: '🎨' },
  { id: 'tv_radio_teatro' as TipoObra, label: 'TV, radio o teatro', sublabel: 'Libreto o guion de representación',  emoji: '📺' },
  { id: 'multimedia'      as TipoObra, label: 'Multimedia',       sublabel: 'Obra interactiva o de varios medios',   emoji: '🎮' },
  { id: 'libro_texto'     as TipoObra, label: 'Libro o texto',    sublabel: 'Obra literaria, artículo o guion',      emoji: '📚' },
]

// ── Costos fijos según plantilla ──────────────────────────────
export const ARANCEL_DNDA          = 1_400
export const ENVIO_POSTAL_DNDA     = 21_650
export const SOPORTE_DNDA          = 13_500
export const GASTOS_FIJOS_DNDA     = ARANCEL_DNDA + ENVIO_POSTAL_DNDA + SOPORTE_DNDA  // 36 550
export const HONORARIOS_RECOMENDADOS_DNDA = 600_000
export const CORTE_ZONDA_DNDA      = 100_000

// CUIL del apoderado (Valentín Páez — único apoderado por ahora)
export const CUIL_APODERADO_DNDA = '20427499120'
export const NOMBRE_APODERADO_DNDA = 'VALENTIN PAEZ'

// ── Mapeo tipo de obra → nombre de trámite DNDA ───────────────
const TRAMITE_MAP: Record<TipoObra, { publicada: string; inedita: string }> = {
  musica:          { publicada: 'Inscripción de obra publicada - Musical',                              inedita: 'Depósito de obra inédita - Música y Letra'    },
  software:        { publicada: 'Inscripción de obra publicada - Software',                             inedita: 'Depósito de obra inédita - Software'           },
  pagina_web:      { publicada: 'Inscripción de obra publicada - Página Web',                          inedita: 'Depósito de obra inédita - No musical'         },
  audiovisual:     { publicada: 'Inscripción de obra publicada - Videograma/ Película Cinematográfica', inedita: 'Depósito de obra inédita - No musical'         },
  artistica:       { publicada: 'Inscripción de obra publicada - Artística',                            inedita: 'Depósito de obra inédita - No musical'         },
  tv_radio_teatro: { publicada: 'Inscripción de obra publicada - Representación',                       inedita: 'Depósito de obra inédita - No musical'         },
  multimedia:      { publicada: 'Inscripción de obra publicada - Multimedia',                           inedita: 'Depósito de obra inédita - No musical'         },
  libro_texto:     { publicada: 'Depósito de obra inédita - No musical',                                inedita: 'Depósito de obra inédita - No musical'         },
}

const TITULO_SECCION_MAP: Record<TipoObra, string> = {
  musica:          'PROTECCIÓN DE OBRA MUSICAL',
  software:        'PROTECCIÓN DE SOFTWARE',
  pagina_web:      'PROTECCIÓN DE PÁGINA WEB',
  audiovisual:     'PROTECCIÓN DE OBRA AUDIOVISUAL',
  artistica:       'PROTECCIÓN DE OBRA ARTÍSTICA',
  tv_radio_teatro: 'PROTECCIÓN DE OBRA DRAMÁTICA Y DE RADIODIFUSIÓN',
  multimedia:      'PROTECCIÓN DE OBRA MULTIMEDIA',
  libro_texto:     'PROTECCIÓN DE OBRA LITERARIA',
}

export function getNombreTramiteDNDA(tipoObra: TipoObra, publicada: boolean): string {
  return publicada ? TRAMITE_MAP[tipoObra].publicada : TRAMITE_MAP[tipoObra].inedita
}

export function getTituloSeccionDNDA(tipoObra: TipoObra): string {
  return TITULO_SECCION_MAP[tipoObra] ?? 'PROTECCIÓN DE DERECHOS DE AUTOR'
}

export function getLabelTipoObra(id: TipoObra): string {
  return TIPOS_OBRA_DNDA.find(t => t.id === id)?.label ?? id
}

// ── Interfaces ─────────────────────────────────────────────────
export interface DatosPropuestaDNDA {
  // Solo datos económicos; la info de la obra la completa el cliente en el portal
  honorarios: number
  corte_zonda: number        // Parte que corresponde a Zonda Legal (uso interno)
  arancel_dnda: number
  envio_postal: number
  soporte: number
  total_propuesta: number
}

// ── Helpers ────────────────────────────────────────────────────
export function arsDNDA(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// ── Email HTML ─────────────────────────────────────────────────
export function buildEmailHTMLDNDA(
  datos: DatosPropuestaDNDA,
  clienteNombre: string,
  clienteEmail: string,
  clientePassword: string,
  partnerNombre: string,
  appUrl: string,
  tramiteId: string,
): string {
  const propuestaUrl = `${appUrl}/api/generar-propuesta-dnda?tramiteId=${tramiteId}`

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
    <h1>Propuesta de Registro de Derechos de Autor</h1>
    <p>${partnerNombre}</p>
  </div>
  <div class="body">
    <p style="font-size:16px;color:#374151;margin-bottom:16px;">Hola <strong>${clienteNombre}</strong>,</p>
    <p style="font-size:14px;color:#374151;">
      Preparamos tu propuesta de inversión para el registro de tu obra ante la
      Dirección Nacional del Derecho de Autor (DNDA).
      A continuación encontrás el detalle de los costos del trámite.
    </p>

    <p class="section-title">Inversión total</p>
    <table class="cost-table">
      <tr><th>Concepto</th><th style="text-align:right">Monto</th></tr>
      <tr><td>Honorarios profesionales</td><td style="text-align:right">${arsDNDA(datos.honorarios)}</td></tr>
      <tr><td>Arancel oficial DNDA</td><td style="text-align:right">${arsDNDA(datos.arancel_dnda)}</td></tr>
      <tr><td>Envío postal certificado a Buenos Aires</td><td style="text-align:right">${arsDNDA(datos.envio_postal)}</td></tr>
      <tr><td>Soporte para el envío</td><td style="text-align:right">${arsDNDA(datos.soporte)}</td></tr>
      <tr class="total"><td>TOTAL</td><td style="text-align:right">${arsDNDA(datos.total_propuesta)}</td></tr>
    </table>

    <p style="margin:0 0 8px;"><a href="${propuestaUrl}" class="btn">📄 Descargar propuesta en PDF</a></p>

    <p style="font-size:14px;color:#374151;margin-top:20px;">
      Para avanzar con el registro, ingresá al portal. Allí completarás los datos de tu obra y de los autores,
      y podrás seguir el estado del trámite en tiempo real.
    </p>

    <div class="credentials">
      <p style="font-weight:700;margin-bottom:8px;">Tus credenciales de acceso al portal:</p>
      <p>Email: <strong>${clienteEmail}</strong></p>
      <p>Contraseña: <strong>${clientePassword}</strong></p>
      <p style="margin-top:8px;font-size:12px;color:#6B7280;">Esta contraseña es de uso temporal para tu primer ingreso. Al entrar al portal el sistema te pedirá que elijas tu propia contraseña.</p>
    </div>

    <p style="margin:8px 0 0;"><a href="${appUrl}/login" class="btn btn-outline">Ingresar al portal →</a></p>

    <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">
      Esta propuesta tiene validez de 30 días. Los aranceles DNDA pueden estar sujetos a actualización. No incluye IVA.
      El certificado de registro suele demorar entre 4 y 8 semanas desde la presentación.
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
export async function enviarPropuestaDNDAEmail(params: {
  datos: DatosPropuestaDNDA
  clienteNombre: string
  clienteEmail: string
  clientePassword: string
  partnerNombre: string
  tramiteId: string
}): Promise<{ enviado: boolean; error?: string }> {
  const apiKey    = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL   ?? 'propuestas@zondalegal.com'
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL  ?? 'https://app.zondalegal.com'

  console.log('[Resend DNDA] apiKey present:', !!apiKey, '| from:', fromEmail)

  if (!apiKey) {
    console.warn('[Resend DNDA] RESEND_API_KEY no configurado — email no enviado')
    return { enviado: false, error: 'RESEND_API_KEY no configurado' }
  }

  const htmlBody = buildEmailHTMLDNDA(
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
        subject: `Tu propuesta de registro de derechos de autor (DNDA)`,
        html: htmlBody,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Resend DNDA] API error', res.status, errText)
      return { enviado: false, error: `Resend ${res.status}: ${errText}` }
    }

    return { enviado: true }
  } catch (err) {
    console.error('Error enviando email DNDA:', err)
    return { enviado: false, error: String(err) }
  }
}
