import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generarPdfPropuesta, generarDocxPropuesta } from '@/lib/generar-propuesta-sas'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────
  const supabase  = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const adminDb = getAdminDb()
  const { data: perfil } = await adminDb.from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })

  const rol = perfil.rol as string

  // ── Parámetros ───────────────────────────────────────────────
  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  const formato   = req.nextUrl.searchParams.get('formato') ?? 'pdf'  // 'pdf' | 'docx'
  if (!tramiteId) return NextResponse.json({ error: 'tramiteId requerido' }, { status: 400 })

  // ── Tramite ──────────────────────────────────────────────────
  const { data: tramite } = await adminDb
    .from('tramites')
    .select('datos_propuesta, partner_id, cliente_id, tipo')
    .eq('id', tramiteId)
    .single()

  if (!tramite) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })
  if (tramite.tipo !== 'SAS') return NextResponse.json({ error: 'Solo para trámites SAS' }, { status: 400 })

  // Solo puede acceder: el propio partner, el cliente del trámite, o zonda
  const esPartner  = rol === 'partner' && tramite.partner_id === user.id
  const esCliente  = rol === 'cliente' && tramite.cliente_id === user.id
  const esZonda    = rol === 'zonda'
  if (!esPartner && !esCliente && !esZonda) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // ── Datos de propuesta ───────────────────────────────────────
  const datosProp = tramite.datos_propuesta as Record<string, unknown> | null
  if (!datosProp) return NextResponse.json({ error: 'Propuesta no disponible' }, { status: 404 })

  const honorarios = Number(datosProp.honorarios ?? 0)

  // Nombre del partner
  const { data: partnerPerfil } = await adminDb
    .from('perfiles')
    .select('nombre')
    .eq('id', tramite.partner_id)
    .single()
  const partnerNombre = partnerPerfil?.nombre ?? 'Tu Estudio Jurídico'

  // ── Generar archivo ──────────────────────────────────────────
  try {
    if (formato === 'docx') {
      const buf = await generarDocxPropuesta(honorarios, partnerNombre)
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="propuesta_sas_${tramiteId.slice(0, 8)}.docx"`,
        },
      })
    }

    // PDF (default)
    const buf = await generarPdfPropuesta(honorarios, partnerNombre)
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="propuesta_sas_${tramiteId.slice(0, 8)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[generar-propuesta-sas] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
