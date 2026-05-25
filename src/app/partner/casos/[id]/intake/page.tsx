// Página de respuestas de intake del caso
// /partner/casos/[id]/intake

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import Link             from 'next/link'

export default async function CasoIntakePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'partner') redirect('/login')

  // Verificar ownership del caso
  const { data: caso } = await supabase
    .from('casos')
    .select('id, titulo, cliente_nombre')
    .eq('id', id)
    .eq('partner_id', user.id)
    .single()

  if (!caso) redirect('/partner/casos')

  // Formularios de intake + sus respuestas
  const { data: forms } = await supabase
    .from('intake_forms')
    .select(`
      id, token, titulo, descripcion, campos, estado, cliente_nombre, created_at, completado_at,
      intake_respuestas (id, respuestas, archivos, created_at)
    `)
    .eq('caso_id', id)
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zondalegal.com'

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        <div className="flex items-center gap-3">
          <Link href={`/partner/casos/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {caso.titulo}
          </Link>
        </div>

        <h1 className="text-lg font-semibold text-foreground">Formularios de datos</h1>
        <p className="text-sm text-muted-foreground -mt-3">
          Información recopilada de {caso.cliente_nombre} mediante formularios de intake.
        </p>

        {(!forms || forms.length === 0) && (
          <div className="bg-background border border-border rounded-2xl p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No hay formularios de intake para este caso todavía.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Usá el asistente IA del dashboard para crear uno al instante.
            </p>
          </div>
        )}

        {forms?.map(form => {
          const respuesta = form.intake_respuestas?.[0]
          const formUrl   = `${appUrl}/formulario/${form.token}`

          type Campo = {
            id: string
            etiqueta: string
            tipo: string
          }

          return (
            <div key={form.id} className="bg-background border border-border rounded-2xl overflow-hidden">

              {/* Header del form */}
              <div className="p-4 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{form.titulo}</p>
                    {form.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{form.descripcion}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Creado el {new Date(form.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    form.estado === 'completado'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {form.estado === 'completado' ? '✓ Completado' : '⏳ Pendiente'}
                  </span>
                </div>

                {form.estado !== 'completado' && (
                  <div className="mt-3 flex gap-2">
                    <a
                      href={formUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Ver formulario →
                    </a>
                    <button
                      onClick={() => navigator.clipboard.writeText(formUrl)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      🔗 Copiar link
                    </button>
                  </div>
                )}
              </div>

              {/* Respuestas */}
              {respuesta ? (
                <div className="p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Respuestas · {new Date(respuesta.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </p>

                  <div className="space-y-2">
                    {(form.campos as Campo[]).map((campo) => {
                      const respVal = (respuesta.respuestas as Record<string, string>)[campo.id]
                      const archivosCampo = (respuesta.archivos as Array<{ campo_id: string; nombre: string; url: string }> | null)
                        ?.filter(a => a.campo_id === campo.id) ?? []

                      return (
                        <div key={campo.id} className="bg-muted/30 rounded-xl p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">{campo.etiqueta}</p>
                          {campo.tipo === 'archivo' ? (
                            archivosCampo.length > 0 ? (
                              archivosCampo.map((a, idx) => (
                                <a
                                  key={idx}
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-foreground hover:underline flex items-center gap-1.5"
                                >
                                  📎 {a.nombre}
                                </a>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground italic">Sin archivo adjunto</p>
                            )
                          ) : (
                            <p className="text-sm text-foreground">{respVal || <span className="text-muted-foreground italic">Sin respuesta</span>}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Esperando que el cliente complete el formulario.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link: <a href={formUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{formUrl}</a>
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
