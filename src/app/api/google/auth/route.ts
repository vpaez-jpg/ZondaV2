// api/google/auth/route.ts
// Inicia el flujo OAuth 2.0 con Google Calendar.
// El partner hace click en "Conectar Google Calendar" → se redirige aquí
// → este route lo redirige a la pantalla de consent de Google.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

export async function GET(req: NextRequest) {
  // Verificar que el usuario esté autenticado y sea partner
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const clientId  = process.env.GOOGLE_CLIENT_ID
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/google/callback`

  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID no configurado' }, { status: 500 })
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',      // para obtener refresh_token
    prompt:        'consent',       // forzar para obtener refresh_token siempre
    state:         user.id,         // pasamos el user_id para usar en el callback
  })

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`)
}
