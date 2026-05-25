// ============================================================
// PROXY — Next.js 16
// Se mantiene mínimo por compatibilidad con @supabase/ssr.
// La lógica de auth y ruteo por rol vive en cada page.tsx
// (Server Components), donde createClient() funciona perfecto.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Pasar la request sin modificar — la auth se maneja en cada página
  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
