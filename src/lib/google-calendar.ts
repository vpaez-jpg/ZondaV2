// lib/google-calendar.ts
// Helpers para interactuar con la Google Calendar API v3.
// Maneja refresh automático de access_token cuando expira.

import { createClient } from '@/lib/supabase/server'
import type { Vencimiento } from '@/lib/vencimientos'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface GoogleToken {
  user_id: string
  access_token: string
  refresh_token: string | null
  token_expiry: string
  google_email: string | null
}

export interface GoogleCalendarEvent {
  id?: string
  summary: string
  description?: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end:   { date?: string; dateTime?: string; timeZone?: string }
  colorId?: string   // '1'=lavender, '2'=sage, '5'=banana, '6'=tangerine, '9'=blueberry, '11'=tomato
  reminders?: {
    useDefault: boolean
    overrides?: { method: 'email' | 'popup'; minutes: number }[]
  }
}

// ── Constantes ────────────────────────────────────────────────────────────────

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
// El calendar principal del usuario
const CALENDAR_ID  = 'primary'

// ── Refresh del access token ──────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expiry: Date
} | null> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret || !refreshToken) return null

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      access_token: data.access_token,
      expiry: new Date(Date.now() + data.expires_in * 1000),
    }
  } catch {
    return null
  }
}

// ── Obtener token válido del partner actual ───────────────────────────────────

export async function getValidToken(userId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) return null

  // Si el token no ha expirado (con 60 seg de margen), usarlo directamente
  const expiry = new Date(tokenRow.token_expiry)
  if (expiry.getTime() - Date.now() > 60_000) {
    return tokenRow.access_token
  }

  // Necesita refresh
  if (!tokenRow.refresh_token) return null
  const refreshed = await refreshAccessToken(tokenRow.refresh_token)
  if (!refreshed) return null

  // Guardar el nuevo access_token
  await supabase
    .from('google_tokens')
    .update({
      access_token: refreshed.access_token,
      token_expiry: refreshed.expiry.toISOString(),
    })
    .eq('user_id', userId)

  return refreshed.access_token
}

// ── CRUD de eventos ───────────────────────────────────────────────────────────

/** Crear un evento en Google Calendar */
export async function crearEvento(
  accessToken: string,
  evento: GoogleCalendarEvent
): Promise<{ id: string } | null> {
  try {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(evento),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return { id: data.id }
  } catch {
    return null
  }
}

/** Eliminar un evento de Google Calendar */
export async function eliminarEvento(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    return res.ok || res.status === 404 // 404 = ya no existe, ok también
  } catch {
    return false
  }
}

/** Listar eventos de Google Calendar en un rango de fechas */
export async function listarEventos(
  accessToken: string,
  desde: Date,
  hasta: Date
): Promise<GoogleCalendarEvent[]> {
  try {
    const params = new URLSearchParams({
      timeMin:      desde.toISOString(),
      timeMax:      hasta.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '50',
    })
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? []) as GoogleCalendarEvent[]
  } catch {
    return []
  }
}

// ── Convertir Vencimiento → GoogleCalendarEvent ───────────────────────────────

export function vencimientoToEvento(v: Vencimiento): GoogleCalendarEvent {
  return {
    summary:     `⚖️ ${v.titulo}`,
    description: v.nota ? `${v.nota}\n\nAgregado desde Zonda Legal` : 'Agregado desde Zonda Legal',
    start: { date: v.fecha },      // all-day event
    end:   { date: v.fecha },
    colorId: '11',                 // tomato (rojo) para destacar vencimientos legales
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 },   // 1 día antes
        { method: 'popup', minutes: 60 },          // 1 hora antes
      ],
    },
  }
}

/** Evento del recordatorio (fechaRecordatorio del vencimiento) */
export function vencimientoToRecordatorio(v: Vencimiento): GoogleCalendarEvent {
  return {
    summary:     `🔔 Recordatorio: ${v.titulo}`,
    description: `Este recordatorio es ${v.diasHabiles} día${v.diasHabiles !== 1 ? 's' : ''} hábil${v.diasHabiles !== 1 ? 'es' : ''} antes del vencimiento (${v.fecha}).\n\n${v.nota || ''}`,
    start: { date: v.fechaRecordatorio },
    end:   { date: v.fechaRecordatorio },
    colorId: '5',                  // banana (amarillo) para recordatorios
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
      ],
    },
  }
}
