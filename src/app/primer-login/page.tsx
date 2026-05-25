'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function PrimerLoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCambiar(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)

    const { error: authError } = await supabase.auth.updateUser({ password: nueva })
    if (authError) {
      setError('Hubo un error al actualizar la contraseña. Intentá de nuevo.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('perfiles').update({ primer_login: false }).eq('id', user.id)
    }

    router.refresh()
    router.push('/')
  }

  const strength = nueva.length === 0 ? 0
    : nueva.length < 8 ? 1
    : nueva.length < 12 ? 2
    : nueva.length < 16 ? 3 : 4

  const strengthLabel = ['', 'Muy corta', 'Aceptable', 'Buena', 'Fuerte']
  const strengthColor = ['', 'bg-destructive', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500']

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Encabezado */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 bg-primary rounded-lg mb-4">
            <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Bienvenido</h1>
          <p className="text-muted-foreground mt-1 text-sm">Elegí tu contraseña personal para continuar</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Crear contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Aviso */}
            <div className="bg-muted rounded-md px-4 py-3 mb-5 text-sm text-muted-foreground">
              Tu cuenta fue creada con una contraseña temporal. Elegí una contraseña propia
              que uses solo en esta plataforma.
            </div>

            <form onSubmit={handleCambiar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nueva">Nueva contraseña</Label>
                <Input
                  id="nueva"
                  type="password"
                  value={nueva}
                  onChange={e => setNueva(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Indicador de fuerza */}
              {nueva.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(n => (
                      <div
                        key={n}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${n <= strength ? strengthColor[strength] : 'bg-border'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{strengthLabel[strength]}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="confirmar">Confirmar contraseña</Label>
                <Input
                  id="confirmar"
                  type="password"
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repetí tu contraseña"
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? 'Guardando...' : 'Guardar contraseña y continuar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
