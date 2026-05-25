// api/google/callback/route.ts
// Google redirige aquí tras el consent del usuario.
// Intercambia el code por access_token + refresh_token y los guarda en Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code    = searchParams.get('code')
  const userId  = searchParams.get('state')   // user_id que pasamos en /auth
  const error   = searchParams.get('error')
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Si el usuario denegó el acceso
  if (error || !code || !userId) {
    return NextResponse.redirect(
      `${appUrl}/partner/dashboard?google_error=${error ?? 'cancelled'}`
    )
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri  = `${appUrl}/api/google/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/partner/dashboard?google_error=config`)
  }

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('Google token exchange error:', errText)
      return NextResponse.redirect(`${appUrl}/partner/dashboard?google_error=token`)
    }

    const tokens = await tokenRes.json()
    const accessToken  = tokens.access_token as string
    const refreshToken = tokens.refresh_token as string | undefined
    const expiresIn    = tokens.expires_in as number   // segundos

    // 2. Obtener email de la cuenta Google
    const userInfoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userInfo = userInfoRes.ok ? await userInfoRes.json() : {}
    const googleEmail = (userInfo.email as string | undefined) ?? null

    // 3. Guardar tokens en Supabase (upsert por user_id)
    const supabase = await createClient()

    const upsertData: Record<string, unknown> = {
      user_id:      userId,
      access_token: accessToken,
      token_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
      google_email: googleEmail,
    }
    // Solo sobrescribir refresh_token si Google nos mandó uno nuevo
    if (refreshToken) {
      upsertData.refresh_token = refreshToken
    }

    const { error: dbError } = await supabase
      .from('google_tokens')
      .upsert(upsertData, { onConflict: 'user_id' })

    if (dbError) {
      console.error('DB error saving google token:', dbError)
      return NextResponse.redirect(`${appUrl}/partner/dashboard?google_error=db`)
    }

    // 4. Redirigir al dashboard con éxito
    return NextResponse.redirect(`${appUrl}/partner/dashboard?google_connected=1`)

  } catch (err) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(`${appUrl}/partner/dashboard?google_error=unknown`)
  }
}
