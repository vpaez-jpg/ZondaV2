'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getNombreTramiteDNDA, type TipoObra } from '@/lib/propuesta-dnda'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import FormDNDA   from './FormDNDA'
import FormMARCAS from './FormMARCAS'
import FormSAS    from './FormSAS'
import FormNDA    from './FormNDA'
import FormTyC    from './FormTyC'
import FormPP     from './FormPP'
import FormAmparo from './FormAmparo'

// ── Tipos ──────────────────────────────────────────────────────
interface Perfil { id: string; nombre: string }

interface Partner {
  nombre: string
  logo_url: string | null
  whatsapp_link: string | null
  meet_link: string | null
  email: string | null
  telefono: string | null
}

interface DatosPropuesta {
  nombre_marca?: string
  descripcion_productos_servicios?: string
  clases_niza?: { numero: number; nombre: string }[]
  num_clases?: number
  honorarios_por_clase?: number
  total_propuesta?: number
  honorarios?: number
  corte_zonda?: number
}

interface Tramite {
  id: string
  tipo: 'MARCAS' | 'DNDA' | 'SAS' | 'NDA' | 'TYC' | 'PP' | 'ART9' | 'GANANCIAS'
  etapa_numero: number
  datos_cliente: Record<string, unknown> | null
  datos_propuesta: DatosPropuesta | null
  documentos_adjuntos: DocumentoAdjunto[]
  created_at: string
  updated_at: string
}

interface DocumentoAdjunto {
  tipo: string
  nombre: string
  url: string
  subido_at: string
}

interface Etapa { tipo: string; numero: number; descripcion: string }

interface CasoEtapa {
  numero: number
  titulo: string
  descripcion_cliente: string | null
  completada: boolean
}

interface CasoNota {
  id: string
  texto_cliente: string | null
  created_at: string
}

interface CasoDocumento {
  id: string
  nombre: string
  descripcion: string | null
  url: string
  tipo_mime: string | null
  tamanio: number | null
  rol_subidor: string
  created_at: string
}

interface CasoMensaje {
  id: string
  autor_id: string
  autor_rol: string
  texto: string
  leido: boolean
  created_at: string
}

interface Caso {
  id: string
  titulo: string
  tipo_caso: string | null
  etapa_actual: number
  estado: string
  caso_etapas: CasoEtapa[]
  caso_notas: CasoNota[]
  caso_documentos: CasoDocumento[]
}

interface Props {
  perfil: Perfil
  partner: Partner | null
  tramites: Tramite[]
  etapas: Etapa[]
  caso: Caso | null
  mensajesIniciales: CasoMensaje[]
}

// ── Helpers ────────────────────────────────────────────────────
const ETAPA_MAX: Record<string, number> = { MARCAS: 7, DNDA: 4, SAS: 6, NDA: 4, TYC: 4, PP: 4, ART9: 4, GANANCIAS: 4 }

const NOMBRE_TIPO: Record<string, string> = {
  MARCAS:    'Registro de Marca',
  DNDA:      'Registro de Obra (DNDA)',
  SAS:       'Constitución de Sociedad (SAS)',
  NDA:       'Acuerdo de Confidencialidad (NDA)',
  TYC:       'Términos y Condiciones',
  PP:        'Políticas de Privacidad',
  ART9:      'Amparo Art. 9 Ley 24.463',
  GANANCIAS: 'Amparo Impuesto a las Ganancias',
}

const ICONO_TIPO: Record<string, string> = {
  MARCAS:    '™',
  DNDA:      '©',
  SAS:       '🏢',
  NDA:       '🔒',
  TYC:       '📄',
  PP:        '🛡️',
  ART9:      '⚖️',
  GANANCIAS: '🏛️',
}

// ── Componente principal ───────────────────────────────────────
export default function ClienteShell({ perfil, partner, tramites, etapas, caso, mensajesIniciales }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tramiteConForm, setTramiteConForm] = useState<string | null>(null)

  const nombreEstudio = partner?.nombre ?? 'Tu Estudio Jurídico'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-muted/30">

      {/* ── Header marca blanca ──────────────────────────────── */}
      <header className="bg-background border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          {partner?.logo_url ? (
            <img src={partner.logo_url} alt={nombreEstudio} className="h-8 object-contain" />
          ) : (
            <p className="text-base font-semibold text-foreground">{nombreEstudio}</p>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
            Cerrar sesión
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ── Saludo ──────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">Hola, {perfil.nombre}</h1>
          <p className="text-sm text-muted-foreground mt-1">Seguí el avance de tus servicios y completá tu información.</p>
        </div>

        {/* ── Caso libre ──────────────────────────────────────── */}
        {caso && <CasoTimeline caso={caso} mensajesIniciales={mensajesIniciales} clienteId={perfil.id} />}

        {/* ── Trámites ────────────────────────────────────────── */}
        {tramites.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-10 text-center">
            <p className="text-muted-foreground text-sm">No tenés servicios contratados todavía.</p>
            <p className="text-muted-foreground text-sm mt-1">Contactá a tu estudio para iniciar un trámite.</p>
          </div>
        ) : (
          tramites.map(tramite => {
            const etapasTipo = etapas.filter(e => e.tipo === tramite.tipo)
            const max = ETAPA_MAX[tramite.tipo]
            const pct = Math.round((tramite.etapa_numero / max) * 100)
            const finalizado = tramite.etapa_numero === max
            const esperandoDatos = tramite.etapa_numero === 1
            const esperandoCartaPoder = tramite.tipo === 'MARCAS' && tramite.etapa_numero === 2
            const esperandoTAD = tramite.tipo === 'DNDA' && tramite.etapa_numero === 2
            const datosEnviados = tramite.datos_cliente !== null
            const mostrandoForm = tramiteConForm === tramite.id
            const docsAdjuntos = tramite.documentos_adjuntos ?? []

            return (
              <div key={tramite.id} className="bg-card rounded-lg border border-border overflow-hidden">

                {/* Cabecera */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-lg border border-border">
                        {ICONO_TIPO[tramite.tipo]}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{NOMBRE_TIPO[tramite.tipo]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Iniciado el {new Date(tramite.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {finalizado ? (
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-muted text-foreground shrink-0">✓ Finalizado</span>
                    ) : esperandoDatos ? (
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-muted text-foreground shrink-0 animate-pulse">Acción requerida</span>
                    ) : (esperandoCartaPoder || esperandoTAD) ? (
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-muted text-muted-foreground shrink-0 animate-pulse">Acción requerida</span>
                    ) : (
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-muted text-muted-foreground shrink-0">En proceso</span>
                    )}
                  </div>

                  {/* Barra de progreso */}
                  <div className="mb-1">
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-xs text-muted-foreground">Progreso del trámite</p>
                      <p className="text-xs text-muted-foreground font-medium">Etapa {tramite.etapa_numero} de {max}</p>
                    </div>
                    <Progress value={pct} className={cn('h-2', finalizado && '[&>div]:bg-foreground')} />
                  </div>
                </div>

                {/* Timeline */}
                <div className="px-6 pb-4">
                  <div className="space-y-2">
                    {etapasTipo.map(etapa => {
                      const hecha = etapa.numero < tramite.etapa_numero
                      const activa = etapa.numero === tramite.etapa_numero
                      return (
                        <div key={etapa.numero} className={cn('flex items-start gap-3', etapa.numero > tramite.etapa_numero && 'opacity-35')}>
                          <div className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                            hecha  ? 'border-foreground bg-foreground' :
                            activa ? 'border-primary bg-primary' : 'border-border bg-background'
                          )}>
                            {hecha && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            {activa && <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />}
                          </div>
                          <p className={cn(
                            'text-sm py-0.5',
                            activa ? 'text-primary font-medium' : hecha ? 'text-foreground/70' : 'text-muted-foreground'
                          )}>
                            {etapa.descripcion}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* CTA etapa 1: completar datos */}
                {esperandoDatos && (
                  <div className="px-6 pb-6">
                    {!mostrandoForm ? (
                      <div className="bg-muted rounded-lg p-4">
                        <p className="text-sm text-foreground font-medium mb-1">Tu estudio necesita información tuya</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Completá el formulario para que podamos avanzar con tu trámite.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => setTramiteConForm(tramite.id)}
                          className="bg-foreground hover:bg-foreground/90 text-primary-foreground"
                        >
                          Completar mis datos →
                        </Button>
                      </div>
                    ) : (
                      <div className="border-t border-border pt-4">
                        {tramite.tipo === 'DNDA'   && <FormDNDA   tramiteId={tramite.id} datosPropuesta={tramite.datos_propuesta} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'MARCAS' && <FormMARCAS tramiteId={tramite.id} datosPropuesta={tramite.datos_propuesta} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'SAS'    && <FormSAS    tramiteId={tramite.id} datosPropuesta={tramite.datos_propuesta} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'NDA'    && <FormNDA    tramiteId={tramite.id} datosPropuesta={tramite.datos_propuesta as { precio_24hs?: number; precio_3dias?: number; precio_5dias?: number; ofrece_reunion?: boolean; precio_reunion?: number | null } | null} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'TYC'    && <FormTyC    tramiteId={tramite.id} datosPropuesta={tramite.datos_propuesta as { precio_24hs?: number; precio_3dias?: number; precio_5dias?: number; ofrece_reunion?: boolean } | null} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'PP'     && <FormPP     tramiteId={tramite.id} datosPropuesta={tramite.datos_propuesta as { precio_24hs?: number; precio_3dias?: number; precio_5dias?: number; ofrece_reunion?: boolean } | null} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'ART9'      && <FormAmparo tramiteId={tramite.id} tipo="ART9"      clienteId={perfil.id} datosPropuesta={(tramite.datos_propuesta ?? {}) as Record<string, unknown>} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                        {tramite.tipo === 'GANANCIAS' && <FormAmparo tramiteId={tramite.id} tipo="GANANCIAS" clienteId={perfil.id} datosPropuesta={(tramite.datos_propuesta ?? {}) as Record<string, unknown>} onSubmitOk={() => { setTramiteConForm(null); router.refresh() }} onCancel={() => setTramiteConForm(null)} />}
                      </div>
                    )}
                  </div>
                )}

                {/* CTA etapa 2 MARCAS: descargar y subir carta poder */}
                {esperandoCartaPoder && (
                  <div className="px-6 pb-6">
                    <CartaPoderUpload
                      tramite={tramite}
                      clienteId={perfil.id}
                      docsAdjuntos={docsAdjuntos}
                      onUploadOk={() => router.refresh()}
                    />
                  </div>
                )}

                {/* CTA etapa 2 DNDA: subir obra + apoderamiento TAD */}
                {esperandoTAD && (
                  <div className="px-6 pb-6">
                    <DNDAApoderamiento
                      tramite={tramite}
                      clienteId={perfil.id}
                      docsAdjuntos={docsAdjuntos}
                      onCompleto={() => router.refresh()}
                    />
                  </div>
                )}

                {/* Datos ya enviados */}
                {!esperandoDatos && !esperandoCartaPoder && !esperandoTAD && datosEnviados && (
                  <div className="px-6 pb-4">
                    {tramite.tipo === 'SAS' && tramite.etapa_numero === 2 ? (
                      <div className="bg-muted border border-border rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground">✓ Datos enviados a auditoría</p>
                        <p className="text-xs text-muted-foreground mt-1">Tu estudio está revisando la información para preparar el estatuto. Te avisaremos cuando haya novedades.</p>
                      </div>
                    ) : tramite.tipo === 'NDA' && tramite.etapa_numero === 2 ? (
                      <div className="bg-muted border border-border rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground">✓ Cuestionario enviado</p>
                        <p className="text-xs text-muted-foreground mt-1">Estamos redactando tu Acuerdo de Confidencialidad. Te avisaremos cuando esté listo en el plazo que elegiste.</p>
                      </div>
                    ) : tramite.tipo === 'TYC' && tramite.etapa_numero === 2 ? (
                      <div className="bg-muted border border-border rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground">✓ Cuestionario enviado</p>
                        <p className="text-xs text-muted-foreground mt-1">Estamos redactando tus Términos y Condiciones. Te avisaremos cuando estén listos en el plazo que elegiste.</p>
                      </div>
                    ) : tramite.tipo === 'PP' && tramite.etapa_numero === 2 ? (
                      <div className="bg-muted border border-border rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground">✓ Cuestionario enviado</p>
                        <p className="text-xs text-muted-foreground mt-1">Estamos redactando tus Políticas de Privacidad. Te avisaremos cuando estén listas en el plazo que elegiste.</p>
                      </div>
                    ) : tramite.tipo === 'ART9' && tramite.etapa_numero === 2 ? (
                      <div className="bg-muted border border-border rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground">✓ Documentación recibida</p>
                        <p className="text-xs text-muted-foreground mt-1">Recibimos tu información y documentos. Tu estudio está preparando el escrito de amparo. Te avisaremos cuando esté listo para presentar.</p>
                      </div>
                    ) : tramite.tipo === 'GANANCIAS' && tramite.etapa_numero === 2 ? (
                      <div className="bg-muted border border-border rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground">✓ Documentación recibida</p>
                        <p className="text-xs text-muted-foreground mt-1">Recibimos tu información y documentos. Tu estudio está preparando el escrito de amparo contra el Impuesto a las Ganancias. Te avisaremos cuando esté listo.</p>
                      </div>
                    ) : (
                      <p className="text-xs text-foreground font-medium">✓ Datos enviados al estudio</p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* ── Contacto con el estudio ──────────────────────────── */}
        {partner && (partner.whatsapp_link || partner.email || partner.meet_link) && (
          <div className="bg-card rounded-lg border border-border p-6">
            <p className="text-sm font-semibold text-foreground mb-4">¿Tenés alguna duda?</p>
            <div className="flex flex-wrap gap-3">
              {partner.whatsapp_link && (
                <a href={partner.whatsapp_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-muted hover:bg-muted/70 text-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.522 5.855L.057 23.882a.5.5 0 00.61.61l6.028-1.465A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.177-1.431l-.37-.22-3.832.931.95-3.821-.241-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                  WhatsApp
                </a>
              )}
              {partner.email && (
                <a href={`mailto:${partner.email}`}
                  className="flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                  Enviar email
                </a>
              )}
              {partner.meet_link && (
                <a href={partner.meet_link.startsWith('http') ? partner.meet_link : `https://${partner.meet_link}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-muted hover:bg-muted/70 text-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
                  Coordinar reunión
                </a>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── CasoTimeline ───────────────────────────────────────────────
function CasoTimeline({
  caso,
  mensajesIniciales,
  clienteId,
}: {
  caso: Caso
  mensajesIniciales: CasoMensaje[]
  clienteId: string
}) {
  const etapasOrdenadas = [...caso.caso_etapas].sort((a, b) => a.numero - b.numero)
  const total      = etapasOrdenadas.length
  const completadas = etapasOrdenadas.filter(e => e.completada).length
  const pct        = total > 0 ? Math.round((completadas / total) * 100) : 0
  const finalizado = caso.estado === 'finalizado'

  const notasVisibles = [...caso.caso_notas]
    .filter(n => n.texto_cliente && n.texto_cliente.trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const [tab,         setTab]         = useState<'timeline' | 'novedades' | 'mensajes' | 'documentos'>('timeline')
  const [mensajes,    setMensajes]    = useState<CasoMensaje[]>(mensajesIniciales)
  const [docs,        setDocs]        = useState<CasoDocumento[]>(caso.caso_documentos ?? [])
  const [textoMsg,    setTextoMsg]    = useState('')
  const [enviandoMsg, setEnviandoMsg] = useState(false)
  const [subiendoDoc, setSubiendoDoc] = useState(false)
  const mensajesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const noLeidosDeParter = mensajes.filter(m => m.autor_rol === 'partner' && !m.leido).length

  useEffect(() => {
    if (tab === 'mensajes') {
      setTimeout(() => mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [tab, mensajes])

  const enviarMensaje = async () => {
    if (!textoMsg.trim()) return
    setEnviandoMsg(true)
    try {
      const res = await fetch(`/api/cliente/casos/${caso.id}/mensajes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoMsg.trim() }),
      })
      if (res.ok) {
        const nuevo = await res.json()
        setMensajes(prev => [...prev, nuevo])
        setTextoMsg('')
      }
    } finally { setEnviandoMsg(false) }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoDoc(true)
    try {
      // Paso 1: pedir signed upload URL (el archivo nunca pasa por el servidor)
      const urlRes = await fetch(`/api/cliente/casos/${caso.id}/upload-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: file.name, tipo_mime: file.type, tamanio: file.size }),
      })
      if (!urlRes.ok) {
        alert('No se pudo generar la URL de carga. Intentá de nuevo.')
        return
      }
      const { signedUrl, path } = await urlRes.json()

      // Paso 2: subir el archivo directo a Supabase Storage desde el browser
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) {
        alert('Error al subir el archivo. Intentá de nuevo.')
        return
      }

      // Paso 3: registrar el documento en la base de datos
      const docRes = await fetch(`/api/cliente/casos/${caso.id}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:       file.name,
          url:          path,
          storage_path: path,
          tipo_mime:    file.type,
          tamanio:      file.size,
        }),
      })
      if (docRes.ok) {
        const doc = await docRes.json()
        setDocs(prev => [doc, ...prev])
      }
    } finally {
      setSubiendoDoc(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function formatFecha(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function iconoMime(mime: string | null) {
    if (!mime) return '📎'
    if (mime.startsWith('image/')) return '🖼️'
    if (mime === 'application/pdf') return '📄'
    if (mime.includes('word')) return '📝'
    return '📎'
  }

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">

      {/* Cabecera */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center border border-border shrink-0">
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-foreground">{caso.titulo}</p>
              {caso.tipo_caso && (
                <p className="text-xs text-muted-foreground mt-0.5">{caso.tipo_caso}</p>
              )}
            </div>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${
            finalizado ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            {finalizado ? '✓ Finalizado' : 'En proceso'}
          </span>
        </div>

        {/* Barra de progreso */}
        {total > 0 && (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-xs text-muted-foreground">Progreso</p>
              <p className="text-xs text-muted-foreground font-medium">{completadas} de {total} etapas · {pct}%</p>
            </div>
            <Progress value={pct} className={cn('h-2', finalizado && '[&>div]:bg-foreground')} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-5 pb-3">
        <div className="flex gap-1 bg-muted p-1 rounded-xl">
          {[
            { key: 'timeline',   label: 'Etapas',    count: null },
            { key: 'novedades',  label: 'Novedades', count: null },
            { key: 'mensajes',   label: 'Mensajes',  count: noLeidosDeParter > 0 ? noLeidosDeParter : null },
            { key: 'documentos', label: 'Archivos',  count: null },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              {count != null && (
                <span className="bg-foreground text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: ETAPAS ─────────────────────────────────────────── */}
      {tab === 'timeline' && etapasOrdenadas.length > 0 && (
        <div className="px-5 pb-5">
          <div className="space-y-2.5">
            {etapasOrdenadas.map((etapa, idx) => {
              const esActual = !etapa.completada && (idx === 0 || etapasOrdenadas[idx - 1]?.completada)
              return (
                <div key={etapa.numero} className={cn('flex items-start gap-3', !etapa.completada && !esActual && 'opacity-40')}>
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                    etapa.completada ? 'border-foreground bg-foreground' :
                    esActual        ? 'border-primary bg-primary' : 'border-border bg-background'
                  )}>
                    {etapa.completada && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {esActual && <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />}
                  </div>
                  <div className="flex-1 py-0.5">
                    <p className={cn('text-sm font-medium', esActual ? 'text-primary' : etapa.completada ? 'text-foreground/70' : 'text-muted-foreground')}>
                      {etapa.titulo}
                    </p>
                    {etapa.descripcion_cliente && (
                      <p className={cn('text-xs mt-0.5 leading-relaxed', esActual ? 'text-foreground/80' : 'text-muted-foreground')}>
                        {etapa.descripcion_cliente}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'timeline' && etapasOrdenadas.length === 0 && (
        <div className="px-5 pb-5 text-center">
          <p className="text-sm text-muted-foreground">Tu abogado está preparando el plan de trabajo.</p>
        </div>
      )}

      {/* ── TAB: NOVEDADES ──────────────────────────────────────── */}
      {tab === 'novedades' && (
        <div className="px-5 pb-5 space-y-3">
          {notasVisibles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todavía no hay novedades en tu caso.
            </p>
          ) : (
            notasVisibles.map(nota => (
              <div key={nota.id} className="bg-muted rounded-lg px-4 py-3">
                <p className="text-sm text-foreground leading-relaxed">{nota.texto_cliente}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{formatFecha(nota.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: MENSAJES ───────────────────────────────────────── */}
      {tab === 'mensajes' && (
        <div className="flex flex-col" style={{ minHeight: '300px' }}>
          <div className="flex-1 overflow-y-auto px-5 space-y-3 pb-2" style={{ maxHeight: '280px' }}>
            {mensajes.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-sm text-muted-foreground text-center">
                  Podés escribirle a tu abogado/a directamente acá.
                </p>
              </div>
            ) : (
              mensajes.map(m => {
                const esCliente = m.autor_rol === 'cliente'
                return (
                  <div key={m.id} className={`flex ${esCliente ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                      esCliente
                        ? 'bg-foreground text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      <p className="text-sm leading-relaxed">{m.texto}</p>
                      <p className={`text-[10px] mt-1 ${esCliente ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{formatFecha(m.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={mensajesEndRef} />
          </div>

          <div className="border-t border-border p-3 flex gap-2">
            <textarea
              value={textoMsg}
              onChange={e => setTextoMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje() } }}
              placeholder="Escribí tu consulta..."
              rows={1}
              className="flex-1 resize-none text-sm rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />
            <button
              onClick={enviarMensaje}
              disabled={!textoMsg.trim() || enviandoMsg}
              className="px-4 py-2 bg-foreground text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {enviandoMsg ? '...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: DOCUMENTOS ─────────────────────────────────────── */}
      {tab === 'documentos' && (
        <div className="px-5 pb-5 space-y-3">
          {/* Docs del abogado */}
          {docs.filter(d => d.rol_subidor === 'partner').length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground">Del estudio</p>
              {docs.filter(d => d.rol_subidor === 'partner').map(doc => (
                <a
                  key={doc.id}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-muted/50 hover:bg-muted rounded-xl p-3 transition-colors"
                >
                  <span className="text-xl">{iconoMime(doc.tipo_mime)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.nombre}</p>
                    {doc.descripcion && <p className="text-xs text-muted-foreground">{doc.descripcion}</p>}
                    <p className="text-xs text-muted-foreground">{formatFecha(doc.created_at)}</p>
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              ))}
            </>
          )}

          {/* Docs propios del cliente */}
          {docs.filter(d => d.rol_subidor === 'cliente').length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground mt-3">Mis archivos</p>
              {docs.filter(d => d.rol_subidor === 'cliente').map(doc => (
                <a
                  key={doc.id}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-muted/30 hover:bg-muted rounded-xl p-3 transition-colors"
                >
                  <span className="text-xl">{iconoMime(doc.tipo_mime)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.nombre}</p>
                    <p className="text-xs text-muted-foreground">{formatFecha(doc.created_at)}</p>
                  </div>
                </a>
              ))}
            </>
          )}

          {docs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay archivos compartidos todavía.
            </p>
          )}

          {/* Upload */}
          <div className="border-t border-border pt-3">
            <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={subiendoDoc}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.503 11.05H6.75z" />
              </svg>
              {subiendoDoc ? 'Subiendo...' : 'Subir un archivo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente de carta poder: descarga + upload ───────────────
function CartaPoderUpload({
  tramite,
  clienteId,
  docsAdjuntos,
  onUploadOk,
}: {
  tramite: Tramite
  clienteId: string
  docsAdjuntos: DocumentoAdjunto[]
  onUploadOk: () => void
}) {
  const supabase = createClient()
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [completado, setCompletado] = useState(false)

  const datos = tramite.datos_cliente as Record<string, unknown> | null
  const titulares = (datos?.titulares as Record<string, string>[] | undefined) ?? []
  const hayJuridica = titulares.some(t => t.tipo === 'juridica')

  const cartaSubida = docsAdjuntos.find(d => d.tipo === 'carta_poder_firmada')
  const actaSubida = docsAdjuntos.find(d => d.tipo === 'acta_societaria')

  async function handleUpload(archivo: File, tipoDoc: string) {
    if (!archivo) return
    setError('')
    setSubiendo(tipoDoc)

    const ext = archivo.name.split('.').pop()
    const path = `${clienteId}/${tramite.id}/${tipoDoc}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(path, archivo, { upsert: true })

    if (uploadError) {
      setError(`Error al subir el archivo: ${uploadError.message}`)
      setSubiendo(null)
      return
    }

    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(path)

    const nuevosAdjuntos = [
      ...docsAdjuntos.filter(d => d.tipo !== tipoDoc),
      {
        tipo: tipoDoc,
        nombre: archivo.name,
        url: urlData?.publicUrl ?? path,
        subido_at: new Date().toISOString(),
      }
    ]

    const { error: dbError } = await supabase
      .from('tramites')
      .update({ documentos_adjuntos: nuevosAdjuntos })
      .eq('id', tramite.id)

    if (dbError) {
      setError(`Error guardando referencia: ${dbError.message}`)
      setSubiendo(null)
      return
    }

    setSubiendo(null)

    const cartaOk = tipoDoc === 'carta_poder_firmada' || !!cartaSubida
    const actaOk = !hayJuridica || tipoDoc === 'acta_societaria' || !!actaSubida
    if (cartaOk && actaOk) {
      await supabase
        .from('tramites')
        .update({ etapa_numero: 3 })
        .eq('id', tramite.id)
      setCompletado(true)
      setTimeout(onUploadOk, 1500)
    } else {
      onUploadOk()
    }
  }

  if (completado) {
    return (
      <div className="bg-muted border border-border rounded-lg p-4 text-center">
        <p className="text-sm font-semibold text-foreground">✓ Documentación completa</p>
        <p className="text-xs text-muted-foreground mt-1">Tu estudio ya puede avanzar con el trámite.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted border border-border rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground mb-1">📄 Paso necesario: Carta poder</p>
        <p className="text-xs text-muted-foreground">
          Descargá la carta poder con tus datos pre-completados, imprimila, firmala y subí el escaneo.
          {hayJuridica && ' Como hay una empresa como titular, también debés adjuntar el acta o estatuto que acredita la representación.'}
        </p>
      </div>

      {/* Paso 1: Descargar carta poder */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0', cartaSubida ? 'bg-foreground text-primary-foreground' : 'bg-primary text-primary-foreground')}>
            {cartaSubida ? '✓' : '1'}
          </div>
          <p className="text-sm font-medium text-foreground">Descargar y firmar la carta poder</p>
        </div>
        <a
          href={`/api/carta-poder?tramiteId=${tramite.id}`}
          download
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors w-fit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Descargar carta poder (PDF)
        </a>
        <p className="text-xs text-muted-foreground">Imprimila, firmala y escaneala para el paso siguiente.</p>

        <SubirArchivo
          label="Subir carta poder firmada (PDF, JPG o PNG)"
          tipoDoc="carta_poder_firmada"
          subiendo={subiendo}
          yaSubido={cartaSubida}
          onFile={f => handleUpload(f, 'carta_poder_firmada')}
        />
      </div>

      {/* Paso 2 (solo si hay jurídica): Subir acta societaria */}
      {hayJuridica && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0', actaSubida ? 'bg-foreground text-primary-foreground' : 'bg-primary text-primary-foreground')}>
              {actaSubida ? '✓' : '2'}
            </div>
            <p className="text-sm font-medium text-foreground">Adjuntar acta o estatuto societario</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Documento que acredita que el representante legal tiene facultades para firmar en nombre de la empresa.
          </p>
          <SubirArchivo
            label="Subir acta / estatuto (PDF, JPG o PNG)"
            tipoDoc="acta_societaria"
            subiendo={subiendo}
            yaSubido={actaSubida}
            onFile={f => handleUpload(f, 'acta_societaria')}
          />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ── Componente DNDA: envío de obra + apoderamiento TAD ────────────
const CUIL_APODERADO = '20427499120'
const NOMBRE_APODERADO = 'VALENTIN PAEZ'

function DNDAApoderamiento({
  tramite,
  clienteId,
  docsAdjuntos,
  onCompleto,
}: {
  tramite: Tramite
  clienteId: string
  docsAdjuntos: DocumentoAdjunto[]
  onCompleto: () => void
}) {
  const supabase = createClient()
  const datosCliente = tramite.datos_cliente as Record<string, unknown> | null
  const nombreObra = (datosCliente?.nombre_obra as string | undefined) ?? ''
  const tipoObraCliente = (datosCliente?.tipo_obra as TipoObra | undefined) ?? null
  const publicadaCliente = (datosCliente?.publicada as boolean | undefined) ?? false
  const nombreTramiteDNDA = tipoObraCliente
    ? getNombreTramiteDNDA(tipoObraCliente, publicadaCliente)
    : 'el trámite correspondiente'

  const obraSubida = docsAdjuntos.find(d => d.tipo === 'obra_dnda')

  const [esFicheroGrande, setEsFicheroGrande] = useState(false)
  const [driveLink, setDriveLink] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [tadCompletado, setTadCompletado] = useState(false)
  const [error, setError] = useState('')
  const [completado, setCompletado] = useState(false)

  const obraOk = !!obraSubida || (esFicheroGrande && driveLink.trim().startsWith('http'))
  const puedeAvanzar = obraOk && tadCompletado

  async function handleUploadObra(archivo: File) {
    setError('')
    setSubiendo(true)
    const ext = archivo.name.split('.').pop()
    const path = `${clienteId}/${tramite.id}/obra_dnda.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(path, archivo, { upsert: true })

    if (uploadError) {
      setError(`Error al subir el archivo: ${uploadError.message}`)
      setSubiendo(false)
      return
    }

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
    const nuevosAdjuntos = [
      ...docsAdjuntos.filter(d => d.tipo !== 'obra_dnda'),
      { tipo: 'obra_dnda', nombre: archivo.name, url: urlData?.publicUrl ?? path, subido_at: new Date().toISOString() },
    ]

    await supabase.from('tramites').update({ documentos_adjuntos: nuevosAdjuntos }).eq('id', tramite.id)
    setSubiendo(false)
    onCompleto()
  }

  async function handleConfirmar() {
    if (!puedeAvanzar) return
    setError('')

    if (esFicheroGrande && driveLink.trim()) {
      const nuevosAdjuntos = [
        ...docsAdjuntos.filter(d => d.tipo !== 'obra_dnda'),
        { tipo: 'obra_dnda', nombre: `Google Drive: ${driveLink.trim()}`, url: driveLink.trim(), subido_at: new Date().toISOString() },
      ]
      await supabase.from('tramites').update({ documentos_adjuntos: nuevosAdjuntos }).eq('id', tramite.id)
    }

    const { error: dbErr } = await supabase
      .from('tramites')
      .update({ etapa_numero: 3 })
      .eq('id', tramite.id)
      .eq('etapa_numero', 2)

    if (dbErr) { setError(`Error al avanzar: ${dbErr.message}`); return }
    setCompletado(true)
    setTimeout(onCompleto, 1500)
  }

  if (completado) {
    return (
      <div className="bg-muted border border-border rounded-lg p-4 text-center">
        <p className="text-sm font-semibold text-foreground">✓ Todo listo</p>
        <p className="text-xs text-muted-foreground mt-1">Tu estudio ya puede avanzar con el registro de tu obra.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="bg-muted border border-border rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground mb-1">📋 Pasos necesarios para registrar tu obra</p>
        {nombreObra && <p className="text-xs text-muted-foreground mb-1">Obra: <strong>{nombreObra}</strong></p>}
        <p className="text-xs text-muted-foreground">
          Para avanzar con el registro necesitamos que: (1) nos envíes el archivo de la obra y (2) nos otorgues poder en la plataforma TAD para realizar el trámite en tu nombre.
        </p>
      </div>

      {/* ── Paso 1: Envío del archivo ─────────────────────────── */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0', obraOk ? 'bg-foreground text-primary-foreground' : 'bg-foreground text-primary-foreground')}>
            {obraOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-medium text-foreground">Enviá el archivo de tu obra</p>
        </div>

        {obraSubida ? (
          <div className="flex items-center gap-2 text-foreground">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <span className="text-xs font-medium">{obraSubida.nombre} — recibido correctamente</span>
          </div>
        ) : (
          <>
            {/* Toggle tamaño */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEsFicheroGrande(false)}
                className={cn('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border', !esFicheroGrande ? 'bg-foreground text-primary-foreground border-foreground' : 'bg-background text-muted-foreground border-border hover:border-input')}
              >
                Menos de 200 MB
              </button>
              <button
                type="button"
                onClick={() => setEsFicheroGrande(true)}
                className={cn('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border', esFicheroGrande ? 'bg-foreground text-primary-foreground border-foreground' : 'bg-background text-muted-foreground border-border hover:border-input')}
              >
                Más de 200 MB
              </button>
            </div>

            {!esFicheroGrande ? (
              <SubirArchivo
                label="Subir archivo de la obra"
                tipoDoc="obra_dnda"
                subiendo={subiendo ? 'obra_dnda' : null}
                yaSubido={undefined}
                onFile={handleUploadObra}
              />
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1.5">
                  <p className="font-semibold">Cómo compartir desde Google Drive:</p>
                  <p>1. Subí el archivo a <strong>Google Drive</strong>.</p>
                  <p>2. Hacé clic derecho → <strong>Compartir</strong> → <strong>Cambiar acceso</strong>.</p>
                  <p>3. Seleccioná <strong>&ldquo;Cualquier persona con el enlace&rdquo;</strong> y el rol <strong>Lector</strong>.</p>
                  <p>4. Copiá el enlace y pegalo abajo.</p>
                </div>
                <input
                  type="url"
                  value={driveLink}
                  onChange={e => setDriveLink(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Paso 2: Apoderamiento TAD ─────────────────────────── */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0', tadCompletado ? 'bg-foreground text-primary-foreground' : 'bg-foreground/20 text-foreground')}>
            {tadCompletado ? '✓' : '2'}
          </div>
          <p className="text-sm font-medium text-foreground">Otorgá el poder en TAD</p>
        </div>
        <p className="text-xs text-muted-foreground">
          TAD (Trámites a Distancia) es la plataforma del gobierno para realizar gestiones con tu clave fiscal. Necesitamos que nos des poder para presentar el trámite en tu nombre.
        </p>

        <div className="bg-muted rounded-lg p-3 space-y-2 text-xs text-foreground">
          <p className="font-semibold">Instrucciones paso a paso:</p>
          <div className="space-y-1.5">
            <p><span className="font-medium text-muted-foreground">1.</span> Ingresá a <a href="https://tramitesadistancia.gob.ar" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-foreground/70">tramitesadistancia.gob.ar</a> con tu <strong>CUIL y clave fiscal</strong>.</p>
            <p><span className="font-medium text-muted-foreground">2.</span> Hacé clic en la pestaña <strong>APODERADOS</strong> (arriba a la derecha de la pantalla).</p>
            <p><span className="font-medium text-muted-foreground">3.</span> En la sección <strong>&ldquo;Apoderados por mí&rdquo;</strong> ingresá el CUIL <strong className="font-mono">{CUIL_APODERADO}</strong> y hacé clic en <strong>Agregar</strong>.</p>
            <p><span className="font-medium text-muted-foreground">4.</span> Cuando el sistema te pregunte qué trámites puede realizar, elegí <strong>&ldquo;Especificar los trámites&rdquo;</strong>. Buscá el trámite:</p>
            <div className="ml-4 bg-muted border border-border rounded-md px-3 py-2">
              <p className="font-semibold text-foreground text-xs">{nombreTramiteDNDA}</p>
            </div>
            <p className="ml-4 text-muted-foreground">Marcalo y confirmá.</p>
            <p><span className="font-medium text-muted-foreground">5.</span> El apoderado es <strong>{NOMBRE_APODERADO}</strong>. Una vez confirmado, tildá la casilla de abajo.</p>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer group">
          <div
            onClick={() => setTadCompletado(v => !v)}
            className={cn('w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer', tadCompletado ? 'bg-foreground border-foreground' : 'border-border group-hover:border-foreground/50')}
          >
            {tadCompletado && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <span className="text-xs text-foreground leading-relaxed">Completé el apoderamiento en TAD para el trámite <strong>{nombreTramiteDNDA}</strong>.</span>
        </label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        disabled={!puedeAvanzar}
        onClick={handleConfirmar}
        className="w-full bg-foreground hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      >
        {puedeAvanzar ? 'Confirmar y enviar →' : 'Completá los dos pasos para continuar'}
      </Button>
    </div>
  )
}

// ── Subcomponente de upload ─────────────────────────────────────
function SubirArchivo({
  label,
  tipoDoc,
  subiendo,
  yaSubido,
  onFile,
}: {
  label: string
  tipoDoc: string
  subiendo: string | null
  yaSubido: DocumentoAdjunto | undefined
  onFile: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const esteSubiendo = subiendo === tipoDoc

  if (yaSubido) {
    return (
      <div className="flex items-center gap-2 text-foreground">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        <span className="text-xs font-medium">{yaSubido.nombre} — subido correctamente</span>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]) }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!!subiendo}
        onClick={() => inputRef.current?.click()}
      >
        {esteSubiendo ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Subiendo...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            {label}
          </>
        )}
      </Button>
    </div>
  )
}
