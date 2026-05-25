export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { format }       from 'date-fns'
import PartnerShell     from './PartnerShell'
import type { CobroVencido } from './AlertaCobranzaModal'

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, rol, nombre, email, telefono, whatsapp_link, meet_link, logo_url')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner') redirect('/login')

  // Clientes del partner
  const { data: clientes } = await supabase
    .from('perfiles')
    .select('id, nombre, email, created_at')
    .eq('partner_id', user.id)
    .eq('rol', 'cliente')
    .order('created_at', { ascending: false })

  // Trámites de este partner
  const { data: tramites } = await supabase
    .from('tramites')
    .select('id, tipo, etapa_numero, cliente_id, created_at, updated_at')
    .eq('partner_id', user.id)
    .order('updated_at', { ascending: false })

  // Workflow etapas
  const { data: etapas } = await supabase
    .from('workflow_etapas')
    .select('tipo, numero, descripcion')
    .order('numero')

  // Estado de conexión Google Calendar
  const { data: googleToken } = await supabase
    .from('google_tokens')
    .select('google_email')
    .eq('user_id', user.id)
    .single()

  // ── Cobros vencidos (para alerta en dashboard) ───────────────
  const hoy = format(new Date(), 'yyyy-MM-dd')

  const { data: cobrosVencidosRaw } = await supabase
    .from('cobros')
    .select('id, concepto, monto_total, monto_cobrado, fecha_vencimiento, cliente_nombre, cliente_id, tipo')
    .eq('partner_id', user.id)
    .in('estado', ['pendiente', 'parcial'])
    .lte('fecha_vencimiento', hoy)
    .not('fecha_vencimiento', 'is', null)
    .order('fecha_vencimiento', { ascending: true })

  let cobrosVencidos: CobroVencido[] = []
  if (cobrosVencidosRaw && cobrosVencidosRaw.length > 0) {
    const clienteIds = cobrosVencidosRaw
      .map(c => c.cliente_id)
      .filter(Boolean) as string[]

    let perfilesMap: Record<string, { telefono: string | null; whatsapp_link: string | null }> = {}
    if (clienteIds.length > 0) {
      const { data: perfilesClientes } = await supabase
        .from('perfiles')
        .select('id, telefono, whatsapp_link')
        .in('id', clienteIds)
      if (perfilesClientes) {
        perfilesMap = Object.fromEntries(
          perfilesClientes.map(p => [p.id, { telefono: p.telefono ?? null, whatsapp_link: p.whatsapp_link ?? null }])
        )
      }
    }

    cobrosVencidos = cobrosVencidosRaw.map(c => ({
      id:                c.id,
      concepto:          c.concepto,
      monto_total:       c.monto_total,
      monto_cobrado:     c.monto_cobrado,
      fecha_vencimiento: c.fecha_vencimiento,
      cliente_nombre:    c.cliente_nombre ?? null,
      tipo:              c.tipo,
      cliente_telefono:  c.cliente_id ? (perfilesMap[c.cliente_id]?.telefono  ?? null) : null,
      cliente_whatsapp:  c.cliente_id ? (perfilesMap[c.cliente_id]?.whatsapp_link ?? null) : null,
    }))
  }

  // ── ¿Ya vio el briefing hoy? (Supabase) ──────────────────────
  const { data: sessionHoy } = await supabase
    .from('partner_daily_sessions')
    .select('seen_at')
    .eq('user_id', user.id)
    .eq('seen_date', hoy)
    .single()

  const yaVioBriefingHoy = !!sessionHoy

  const params = await searchParams

  return (
    <PartnerShell
      perfil={perfil}
      clientes={clientes ?? []}
      tramites={tramites ?? []}
      etapas={etapas ?? []}
      googleEmail={googleToken?.google_email ?? null}
      googleJustConnected={params.google_connected === '1'}
      googleError={params.google_error ?? null}
      yaVioBriefingHoy={yaVioBriefingHoy}
      cobrosVencidos={cobrosVencidos}
    />
  )
}
