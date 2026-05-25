'use client'

import { useState, useEffect } from 'react'
import { createClient }         from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

interface InfoCaso {
  casoId:        string
  titulo:        string
  tipoCaso:      string
  clienteNombre: string
  partnerNombre: string
  totalEtapas:   number
  yaRegistrado:  boolean
}

export default function InvitacionPage() {
  const router   = useRouter()
  const rawParams = useParams()
  const token    = rawParams.token as string
  const supabase = createClient()

  const [info,       setInfo]       = useState<InfoCaso | null>(null)
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState('')
  const [modo,       setModo]       = useState<'opciones' | 'login' | 'signup'>('opciones')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [nombre,     setNombre]     = useState('')
  const [procesando, setProcesando] = useState(false)
  const [authError,  setAuthError]  = useState('')

  // Cargar info del caso por token
  useEffect(() => {
    fetch(`/api/invitacion/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError('Este link de invitación no es válido o ya expiró.'); return }
        setInfo(data)
        // Si ya tiene cuenta, setear el nombre pre-llenado
        if (data.clienteNombre) setNombre(data.clienteNombre.split(' ')[0])
      })
      .catch(() => setError('Error cargando la invitación.'))
      .finally(() => setCargando(false))
  }, [token])

  // Después de auth, vincular el caso y redirigir al portal
  async function vincularYRedirigir(userId: string) {
    await fetch(`/api/invitacion/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    router.push('/cliente')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(''); setProcesando(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) { setAuthError('Email o contraseña incorrectos.'); return }
      await vincularYRedirigir(data.user.id)
    } finally { setProcesando(false) }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(''); setProcesando(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre: nombre.trim() || info?.clienteNombre || 'Cliente' } },
      })
      if (error || !data.user) { setAuthError(error?.message ?? 'Error al crear la cuenta'); return }

      // Crear perfil en perfiles
      await supabase.from('perfiles').upsert({
        id:     data.user.id,
        email,
        nombre: nombre.trim() || info?.clienteNombre || 'Cliente',
        rol:    'cliente',
      })

      await vincularYRedirigir(data.user.id)
    } finally { setProcesando(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <svg className="w-6 h-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-sm bg-background border border-border rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground">Link inválido</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Header de bienvenida */}
        <div className="bg-background border border-border rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{info?.partnerNombre} te invita a</p>
            <p className="text-base font-semibold text-foreground">{info?.titulo}</p>
            {info && info.totalEtapas > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {info.totalEtapas} etapas · {info.tipoCaso}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Desde tu portal vas a poder ver el avance de tu caso en tiempo real, sin tener que llamar ni preguntar.
          </p>
        </div>

        {/* Form de auth */}
        <div className="bg-background border border-border rounded-2xl p-5 space-y-4">

          {modo === 'opciones' && (
            <>
              <p className="text-sm font-semibold text-foreground text-center">¿Cómo querés ingresar?</p>
              <button
                onClick={() => setModo('signup')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-foreground/20 hover:bg-muted/20 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Crear mi cuenta</p>
                  <p className="text-xs text-muted-foreground">Primera vez que usás el portal</p>
                </div>
              </button>
              <button
                onClick={() => setModo('login')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-foreground/20 hover:bg-muted/20 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Ya tengo cuenta</p>
                  <p className="text-xs text-muted-foreground">Iniciá sesión con tu email</p>
                </div>
              </button>
            </>
          )}

          {modo === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-3">
              <button type="button" onClick={() => setModo('opciones')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Volver</button>
              <p className="text-sm font-semibold text-foreground">Crear tu cuenta</p>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Tu nombre</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder={info?.clienteNombre ?? 'Tu nombre completo'}
                  className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="tu@email.com"
                  className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="Mínimo 6 caracteres"
                  className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
              </div>
              {authError && <p className="text-xs text-destructive">{authError}</p>}
              <button type="submit" disabled={procesando}
                className="w-full bg-foreground text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {procesando ? 'Creando cuenta...' : 'Crear cuenta y entrar al portal'}
              </button>
            </form>
          )}

          {modo === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <button type="button" onClick={() => setModo('opciones')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Volver</button>
              <p className="text-sm font-semibold text-foreground">Iniciar sesión</p>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="tu@email.com"
                  className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="Tu contraseña"
                  className="w-full text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20" />
              </div>
              {authError && <p className="text-xs text-destructive">{authError}</p>}
              <button type="submit" disabled={procesando}
                className="w-full bg-foreground text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {procesando ? 'Ingresando...' : 'Ingresar al portal'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
