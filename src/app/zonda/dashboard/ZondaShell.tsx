'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { crearPartner } from './actions'

// ── Tipos ──────────────────────────────────────────────────────
interface Partner {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  whatsapp_link: string | null
  meet_link: string | null
  created_at: string
}

interface DocumentoAdjunto {
  tipo: string
  nombre: string
  url: string
  subido_at: string
}

interface Tramite {
  id: string
  tipo: 'MARCAS' | 'DNDA' | 'SAS' | 'NDA' | 'TYC' | 'PP' | 'ART9' | 'GANANCIAS'
  etapa_numero: number
  datos_cliente: Record<string, unknown> | null
  datos_propuesta: Record<string, unknown> | null
  documentos_adjuntos: DocumentoAdjunto[]
  cliente_id: string
  partner_id: string
  created_at: string
  updated_at: string
}

interface PerfilBasico {
  id: string
  nombre: string
  email: string | null
}

interface Etapa {
  tipo: string
  numero: number
  descripcion: string
}

interface Props {
  nombreAdmin: string
  partners: Partner[]
  tramites: Tramite[]
  perfiles: PerfilBasico[]
  etapas: Etapa[]
}

// ── Helpers ────────────────────────────────────────────────────
function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const COLORES_TIPO: Record<string, string> = {
  MARCAS:    'bg-muted text-foreground',
  DNDA:      'bg-muted text-foreground',
  SAS:       'bg-muted text-foreground',
  NDA:       'bg-muted text-foreground',
  ART9:      'bg-muted text-foreground',
  GANANCIAS: 'bg-muted text-foreground',
}

const NOMBRES_TIPO: Record<string, string> = {
  MARCAS:    'Registro de Marca',
  DNDA:      'Registro de Obra (DNDA)',
  SAS:       'Constitución SAS',
  NDA:       'Acuerdo de Confidencialidad (NDA)',
  ART9:      'Amparo Art. 9 Ley 24.463',
  GANANCIAS: 'Amparo Impuesto a las Ganancias',
}

// ── Componente principal ───────────────────────────────────────
export default function ZondaShell({ nombreAdmin, partners, tramites, perfiles, etapas }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<'partners' | 'tramites'>('tramites')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Lookup rápido de perfiles por ID
  const perfilPorId = Object.fromEntries(perfiles.map(p => [p.id, p]))

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">Z</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Zonda Legal</p>
              <p className="text-xs text-slate-400">Back-Office</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">Hola, <span className="font-medium text-slate-700">{nombreAdmin}</span></span>
            <button onClick={handleSignOut} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Métricas rápidas ───────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <MetricCard label="Partners activos" valor={partners.length} color="emerald" />
          <MetricCard label="Trámites en curso" valor={tramites.filter(t => t.etapa_numero < getEtapaMax(t.tipo)).length} color="amber" />
          <MetricCard label="Trámites finalizados" valor={tramites.filter(t => t.etapa_numero === getEtapaMax(t.tipo)).length} color="green" />
        </div>

        {/* ── Tabs ───────────────────────────────────────────── */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
          {(['tramites', 'partners'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'tramites' ? `⚙️ Trámites (${tramites.length})` : `🏢 Partners (${partners.length})`}
            </button>
          ))}
        </div>

        {/* ── TAB: TRÁMITES ──────────────────────────────────── */}
        {tab === 'tramites' && (
          <TramitesTab
            tramites={tramites}
            etapas={etapas}
            perfilPorId={perfilPorId}
          />
        )}

        {/* ── TAB: PARTNERS ──────────────────────────────────── */}
        {tab === 'partners' && (
          <PartnersTab
            partners={partners}
            mostrarForm={mostrarForm}
            setMostrarForm={setMostrarForm}
            isPending={isPending}
            startTransition={startTransition}
          />
        )}

      </main>
    </div>
  )
}

// ── Helper: etapa máxima por tipo ──────────────────────────────
function getEtapaMax(tipo: string) {
  if (tipo === 'MARCAS')    return 7
  if (tipo === 'DNDA')      return 4
  if (tipo === 'NDA')       return 4
  if (tipo === 'TYC')       return 4
  if (tipo === 'PP')        return 4
  if (tipo === 'ART9')      return 4
  if (tipo === 'GANANCIAS') return 4
  return 6 // SAS
}

// ── Métrica card ───────────────────────────────────────────────
function MetricCard({ label, valor, color }: { label: string; valor: number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'text-foreground',
    amber:   'text-muted-foreground',
    green:   'text-foreground',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colors[color] ?? 'text-slate-800'}`}>{valor}</p>
    </div>
  )
}

// ── Tab Trámites ───────────────────────────────────────────────
function TramitesTab({
  tramites, etapas, perfilPorId
}: {
  tramites: Tramite[]
  etapas: Etapa[]
  perfilPorId: Record<string, PerfilBasico>
}) {
  const [etapasLocales, setEtapasLocales] = useState<Record<string, number>>(
    Object.fromEntries(tramites.map(t => [t.id, t.etapa_numero]))
  )
  const [guardando, setGuardando] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Record<string, string>>({})
  const [datosExpandidos, setDatosExpandidos] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  async function cambiarEtapa(tramiteId: string, nuevaEtapa: number) {
    setGuardando(tramiteId)
    const etapaAnterior = etapasLocales[tramiteId]

    // Optimistic update
    setEtapasLocales(prev => ({ ...prev, [tramiteId]: nuevaEtapa }))

    const { error } = await supabase
      .from('tramites')
      .update({ etapa_numero: nuevaEtapa })
      .eq('id', tramiteId)

    if (error) {
      // Revertir si falla
      setEtapasLocales(prev => ({ ...prev, [tramiteId]: etapaAnterior }))
      setMensajes(prev => ({ ...prev, [tramiteId]: '⚠ Error al guardar' }))
    } else {
      setMensajes(prev => ({ ...prev, [tramiteId]: '✓ Guardado' }))
      setTimeout(() => setMensajes(prev => { const n = { ...prev }; delete n[tramiteId]; return n }), 2000)
    }
    setGuardando(null)
  }

  if (tramites.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
        <p className="text-slate-400 text-sm">No hay trámites en curso todavía.</p>
        <p className="text-slate-400 text-sm mt-1">Los trámites aparecen cuando un partner crea un cliente.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tramites.map(tramite => {
        const cliente = perfilPorId[tramite.cliente_id]
        const partner = perfilPorId[tramite.partner_id]
        const etapaActual = etapasLocales[tramite.id] ?? tramite.etapa_numero
        const etapasPorTipo = etapas.filter(e => e.tipo === tramite.tipo)
        const descripcionActual = etapasPorTipo.find(e => e.numero === etapaActual)?.descripcion
        const etapaMax = getEtapaMax(tramite.tipo)
        const progreso = Math.round((etapaActual / etapaMax) * 100)
        const esFinalizado = etapaActual === etapaMax
        const tieneDatos = tramite.datos_cliente !== null
        const datosAbiertos = datosExpandidos[tramite.id] ?? false
        const docs = tramite.documentos_adjuntos ?? []
        const tieneDocs = docs.length > 0

        return (
          <div key={tramite.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">

                {/* Info del trámite */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${COLORES_TIPO[tramite.tipo]}`}>
                      {NOMBRES_TIPO[tramite.tipo]}
                    </span>
                    {esFinalizado && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                        ✓ Finalizado
                      </span>
                    )}
                    {tieneDatos && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        📋 Datos recibidos
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    👤 {cliente?.nombre ?? 'Cliente desconocido'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    🏢 {partner?.nombre ?? 'Partner desconocido'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Etapa {etapaActual}/{etapaMax} — {descripcionActual}
                  </p>

                  {/* Barra de progreso */}
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full w-48 max-w-full">
                    <div
                      className={`h-1.5 rounded-full transition-all ${esFinalizado ? 'bg-foreground' : 'bg-foreground/50'}`}
                      style={{ width: `${progreso}%` }}
                    />
                  </div>

                  {/* Botón ver datos */}
                  {tieneDatos && (
                    <button
                      onClick={() => setDatosExpandidos(prev => ({ ...prev, [tramite.id]: !datosAbiertos }))}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground font-medium"
                    >
                      {datosAbiertos ? '▲ Ocultar datos del cliente' : '▼ Ver datos del cliente'}
                    </button>
                  )}
                </div>

                {/* Selector de etapa */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <select
                    value={etapaActual}
                    onChange={e => cambiarEtapa(tramite.id, Number(e.target.value))}
                    disabled={guardando === tramite.id}
                    className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 cursor-pointer"
                  >
                    {etapasPorTipo.map(e => (
                      <option key={e.numero} value={e.numero}>
                        {e.numero}. {e.descripcion.length > 45 ? e.descripcion.slice(0, 45) + '…' : e.descripcion}
                      </option>
                    ))}
                  </select>
                  {mensajes[tramite.id] && (
                    <span className={`text-xs ${mensajes[tramite.id].startsWith('✓') ? 'text-foreground' : 'text-destructive'}`}>
                      {mensajes[tramite.id]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Panel de datos del cliente */}
            {datosAbiertos && tramite.datos_cliente && (
              <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                <DatosCliente datos={tramite.datos_cliente} tipo={tramite.tipo} />

                {/* Documentos SAS */}
                {tramite.tipo === 'SAS' && (
                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <GenerarDocumentosSAS tramiteId={tramite.id} datos={tramite.datos_cliente ?? {}} />
                  </div>
                )}

                {/* Documentos NDA */}
                {tramite.tipo === 'NDA' && (
                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <GenerarDocumentosNDA tramiteId={tramite.id} datos={tramite.datos_cliente ?? {}} datosPropuesta={tramite.datos_propuesta ?? {}} />
                  </div>
                )}

                {/* Documentos TYC */}
                {tramite.tipo === 'TYC' && (
                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <GenerarDocumentosTYC tramiteId={tramite.id} datos={tramite.datos_cliente ?? {}} datosPropuesta={tramite.datos_propuesta ?? {}} />
                  </div>
                )}

                {/* Documentos PP */}
                {tramite.tipo === 'PP' && (
                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <GenerarDocumentosPP tramiteId={tramite.id} datos={tramite.datos_cliente ?? {}} datosPropuesta={tramite.datos_propuesta ?? {}} />
                  </div>
                )}

                {/* Documentos ART9 */}
                {tramite.tipo === 'ART9' && (
                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <GenerarDocumentosAmparo tramiteId={tramite.id} tipo="ART9" datos={tramite.datos_cliente ?? {}} datosPropuesta={tramite.datos_propuesta ?? {}} />
                  </div>
                )}

                {/* Documentos GANANCIAS */}
                {tramite.tipo === 'GANANCIAS' && (
                  <div className="mt-5 pt-4 border-t border-slate-200">
                    <GenerarDocumentosAmparo tramiteId={tramite.id} tipo="GANANCIAS" datos={tramite.datos_cliente ?? {}} datosPropuesta={tramite.datos_propuesta ?? {}} />
                  </div>
                )}
              </div>
            )}

            {/* Documentos adjuntos por el cliente */}
            {tieneDocs && (
              <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Documentos adjuntos</p>
                <div className="space-y-2">
                  {docs.map((doc, i) => {
                    const docLabels: Record<string, string> = {
                      carta_poder_firmada: '📄 Carta poder firmada',
                      acta_societaria:     '📋 Acta / estatuto societario',
                      obra_dnda:           '🎨 Obra registrada (archivo)',
                      logotipo_marca:      '🖼 Logotipo de la marca',
                    }
                    const label = docLabels[doc.tipo] ?? `📎 ${doc.tipo}`
                    // Links de Google Drive u otras URLs externas
                    const esLink = doc.nombre?.startsWith('Google Drive:') || doc.url?.startsWith('https://drive.google')
                    return (
                      <div key={i} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-slate-700">{label}</p>
                          <p className="text-xs text-slate-400">
                            {esLink ? doc.url : doc.nombre} — {new Date(doc.subido_at).toLocaleDateString('es-AR')}
                          </p>
                        </div>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground font-medium shrink-0">
                          {esLink ? 'Abrir Drive →' : 'Ver →'}
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Componente para mostrar datos del cliente ──────────────────
function DatosCliente({ datos, tipo }: { datos: Record<string, unknown>; tipo: string }) {
  function Campo({ label, valor }: { label: string; valor: unknown }) {
    if (!valor || valor === '') return null
    return (
      <div>
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm text-slate-800">{String(valor)}</p>
      </div>
    )
  }

  if (tipo === 'MARCAS') {
    // Soporta formato nuevo (titulares[]) y viejo (titular objeto único)
    const titulares: Record<string, unknown>[] = Array.isArray(datos.titulares)
      ? datos.titulares as Record<string, unknown>[]
      : datos.titular
        ? [datos.titular as Record<string, unknown>]
        : []

    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del cliente — Registro de Marca</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre de la marca" valor={datos.nombre_marca} />
          <Campo label="Productos / Servicios" valor={datos.descripcion_productos_servicios} />
        </div>
        {titulares.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500">
              {titulares.length === 1 ? 'Titular' : `Titulares (${titulares.length})`}
            </p>
            {titulares.map((t, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                {titulares.length > 1 && (
                  <p className="text-xs font-semibold text-slate-400 mb-2">
                    Titular {i + 1} — {t.tipo === 'juridica' ? 'Empresa' : 'Persona física'}
                    {titulares.length > 1 && ` (${t.porcentaje}%)`}
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {t.tipo === 'fisica' ? (
                    <>
                      <Campo label="Nombre" valor={t.nombre} />
                      <Campo label="DNI" valor={t.dni} />
                      <Campo label="CUIT" valor={t.cuit} />
                      <Campo label="Domicilio" valor={t.domicilio} />
                      <Campo label="Email" valor={t.email} />
                      <Campo label="Teléfono" valor={t.telefono} />
                    </>
                  ) : (
                    <>
                      <Campo label="Razón social" valor={t.razon_social} />
                      <Campo label="CUIT" valor={t.cuit} />
                      <Campo label="Domicilio legal" valor={t.domicilio} />
                      <Campo label="Email" valor={t.email} />
                      <Campo label="Representante legal" valor={t.representante ?? t.representante_legal} />
                      <Campo label="DNI representante" valor={t.dni_representante} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <Campo label="Observaciones" valor={datos.observaciones} />
      </div>
    )
  }

  if (tipo === 'DNDA') {
    const autores = (datos.autores as Record<string, unknown>[] | undefined) ?? []
    const titularesNoAutores = (datos.titulares_no_autores as Record<string, unknown>[] | undefined) ?? []

    const TIPO_OBRA_LABELS: Record<string, string> = {
      musica: 'Música', software: 'Software', pagina_web: 'Página web',
      audiovisual: 'Obra audiovisual', artistica: 'Obra artística',
      tv_radio_teatro: 'TV, radio o teatro', multimedia: 'Multimedia', libro_texto: 'Libro o texto',
    }

    const tipoObraLabel = datos.tipo_obra
      ? (TIPO_OBRA_LABELS[datos.tipo_obra as string] ?? String(datos.tipo_obra))
      : null

    return (
      <div className="space-y-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del cliente — Registro de Obra (DNDA)</p>

        {/* Info básica de la obra */}
        <div className="bg-white rounded-lg border border-border p-4">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Obra</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo label="Título de la obra" valor={datos.nombre_obra} />
            <Campo label="Tipo de obra" valor={tipoObraLabel} />
            <Campo label="Estado" valor={datos.publicada === true ? 'Publicada / divulgada' : datos.publicada === false ? 'Inédita (no publicada)' : null} />
          </div>
        </div>

        {/* Autores */}
        {autores.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Autores ({autores.length})
            </p>
            <div className="space-y-2">
              {autores.map((a, i) => {
                const tieneDerechos = a.tiene_derechos_economicos === true
                return (
                  <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-700">Autor {i + 1}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        tieneDerechos ? 'bg-muted text-foreground' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {tieneDerechos ? `Titular — ${a.porcentaje}%` : 'Sin derechos económicos'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Campo label="Nombre" valor={a.nombre} />
                      <Campo label="CUIT" valor={a.cuit} />
                      <Campo label="Domicilio" valor={a.domicilio} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Titulares no autores */}
        {titularesNoAutores.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Titulares no autores ({titularesNoAutores.length})
            </p>
            <div className="space-y-2">
              {titularesNoAutores.map((t, i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700">Titular {i + 1}</p>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {Number(t.porcentaje)}% de titularidad
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Campo label="Nombre" valor={t.nombre} />
                    <Campo label="CUIT" valor={t.cuit} />
                    <Campo label="Domicilio" valor={t.domicilio} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resumen de titularidad */}
        {(() => {
          const titularesConDerechos = autores.filter(a => a.tiene_derechos_economicos === true)
          const total = [
            ...titularesConDerechos.map(a => ({ nombre: String(a.nombre), pct: Number(a.porcentaje) })),
            ...titularesNoAutores.map(t => ({ nombre: String(t.nombre), pct: Number(t.porcentaje) })),
          ]
          if (total.length === 0) return null
          const suma = total.reduce((s, t) => s + t.pct, 0)
          return (
            <div className="bg-muted border border-border rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground mb-2">Resumen de titularidad</p>
              <div className="space-y-1">
                {total.map((t, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-700">{t.nombre}</span>
                    <span className="font-semibold text-foreground">{t.pct}%</span>
                  </div>
                ))}
                <div className={`flex justify-between text-xs font-bold pt-1 border-t border-border ${suma === 100 ? 'text-foreground' : 'text-destructive'}`}>
                  <span>Total</span>
                  <span>{suma}% {suma === 100 ? '✓' : '⚠ (debe sumar 100%)'}</span>
                </div>
              </div>
            </div>
          )
        })()}

        <Campo label="Observaciones" valor={datos.observaciones} />
      </div>
    )
  }

  if (tipo === 'SAS') {
    const socios = (datos.socios as Record<string, unknown>[] | undefined) ?? []
    const adminTitular = datos.administrador_titular as Record<string, unknown> | undefined
    const adminSuplente = datos.administrador_suplente as Record<string, unknown> | undefined
    const denominaciones = datos.denominaciones as string[] | undefined

    return (
      <div className="space-y-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del cliente — Constitución SAS</p>

        {/* Denominaciones */}
        {denominaciones && denominaciones.length > 0 && (
          <div className="bg-white border border-border rounded-lg p-4">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Denominaciones propuestas</p>
            <div className="space-y-1">
              {denominaciones.map((d, i) => (
                <p key={i} className="text-sm text-slate-800">
                  <span className="text-xs text-slate-400 mr-2">Opción {i + 1}:</span>
                  <strong>{d} S.A.S.</strong>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Datos generales */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Datos generales</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Sede social" valor={datos.sede_social} />
            <Campo label="Capital social" valor={datos.capital_social ? `$ ${Number(datos.capital_social).toLocaleString('es-AR')}` : null} />
            <Campo label="Cantidad de acciones" valor={datos.cantidad_acciones ? `${Number(datos.cantidad_acciones).toLocaleString('es-AR')} acciones de $100 c/u` : null} />
          </div>
          <div className="mt-3">
            <p className="text-xs text-slate-400 mb-1">Objeto social</p>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{String(datos.objeto_social ?? '')}</p>
          </div>
        </div>

        {/* Socios */}
        {socios.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Socios ({socios.length})</p>
            <div className="space-y-3">
              {socios.map((s, i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700">Socio {i + 1}</p>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {s.acciones_susc ? `${Number(s.acciones_susc).toLocaleString('es-AR')} acciones` : ''} {s.porcentaje ? `· ${s.porcentaje}` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Campo label="Nombre" valor={s.nombre} />
                    <Campo label="DNI" valor={s.dni} />
                    <Campo label="CUIT / CUIL" valor={s.cuit} />
                    <Campo label="Fecha de nacimiento" valor={s.fecha_nacimiento_formateada ?? s.fecha_nacimiento} />
                    <Campo label="Edad" valor={s.edad ? `${s.edad} años` : null} />
                    <Campo label="Nacionalidad" valor={s.nacionalidad} />
                    <Campo label="Estado civil" valor={s.estado_civil} />
                    <Campo label="Profesión" valor={s.profesion} />
                    <Campo label="Domicilio" valor={s.domicilio} />
                    <Campo label="Teléfono" valor={s.telefono} />
                    <Campo label="Email" valor={s.email} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Administrador Titular */}
        {!!(adminTitular && adminTitular.nombre) && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Administrador Titular</p>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Campo label="Nombre" valor={adminTitular.nombre} />
                <Campo label="DNI" valor={adminTitular.dni} />
                <Campo label="CUIT / CUIL" valor={adminTitular.cuit} />
                <Campo label="Fecha de nacimiento" valor={adminTitular.fecha_nacimiento_formateada ?? adminTitular.fecha_nacimiento} />
                <Campo label="Edad" valor={adminTitular.edad ? `${adminTitular.edad} años` : null} />
                <Campo label="Nacionalidad" valor={adminTitular.nacionalidad} />
                <Campo label="Profesión" valor={adminTitular.profesion} />
                <Campo label="Estado civil" valor={adminTitular.estado_civil} />
                <Campo label="Domicilio" valor={adminTitular.domicilio} />
                <Campo label="Email" valor={adminTitular.email} />
                <Campo label="Domicilio constituido" valor={adminTitular.domicilio_constituido} />
              </div>
            </div>
          </div>
        )}

        {/* Administrador Suplente */}
        {!!(adminSuplente && adminSuplente.nombre) && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Administrador Suplente</p>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Campo label="Nombre" valor={adminSuplente.nombre} />
                <Campo label="DNI" valor={adminSuplente.dni} />
                <Campo label="CUIT / CUIL" valor={adminSuplente.cuit} />
                <Campo label="Fecha de nacimiento" valor={adminSuplente.fecha_nacimiento_formateada ?? adminSuplente.fecha_nacimiento} />
                <Campo label="Edad" valor={adminSuplente.edad ? `${adminSuplente.edad} años` : null} />
                <Campo label="Nacionalidad" valor={adminSuplente.nacionalidad} />
                <Campo label="Profesión" valor={adminSuplente.profesion} />
                <Campo label="Estado civil" valor={adminSuplente.estado_civil} />
                <Campo label="Domicilio" valor={adminSuplente.domicilio} />
                <Campo label="Email" valor={adminSuplente.email} />
                <Campo label="Domicilio constituido" valor={adminSuplente.domicilio_constituido} />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (tipo === 'NDA') {
    const div = datos.divulgadora as Record<string, unknown> | undefined
    const rec = datos.receptora as Record<string, unknown> | undefined

    const SECCIONES: { titulo: string; campos: { label: string; clave: string }[] }[] = [
      {
        titulo: 'El proyecto',
        campos: [
          { label: 'Sector', clave: 'sector' },
          { label: 'Tipo de acuerdo', clave: 'tipo_acuerdo' },
          { label: 'Propósito', clave: 'proposito_permitido' },
          { label: 'Descripción del proyecto', clave: 'descripcion_proyecto' },
        ],
      },
      {
        titulo: 'Plazos y vigencia',
        campos: [
          { label: 'Duración confidencialidad', clave: 'duracion_confidencialidad' },
          { label: 'Protección perpetua secretos', clave: 'proteccion_perpetua_secretos' },
          { label: 'Retroactividad', clave: 'retroactividad' },
          { label: 'Ciudad de firma', clave: 'ciudad_firma' },
          { label: 'Fecha de firma', clave: 'fecha_firma' },
        ],
      },
      {
        titulo: 'Cláusulas adicionales',
        campos: [
          { label: 'No competencia', clave: 'incluir_no_compete' },
          { label: 'Duración no competencia', clave: 'duracion_no_compete' },
          { label: 'Non-solicitation', clave: 'incluir_non_solicitation' },
          { label: 'Cesión de PI', clave: 'incluir_cesion_pi' },
          { label: 'No residuales', clave: 'incluir_no_residuales' },
          { label: 'No publicidad', clave: 'incluir_no_publicidad' },
        ],
      },
      {
        titulo: 'Penalidades y cierre',
        campos: [
          { label: 'Monto penal (USD)', clave: 'monto_penal' },
          { label: 'Foro de resolución', clave: 'foro_resolucion' },
          { label: 'Mediación previa', clave: 'incluir_mediacion_previa' },
          { label: 'Idioma', clave: 'idioma' },
          { label: 'Plazo seleccionado', clave: 'plazo_seleccionado' },
          { label: 'Quiere reunión', clave: 'quiere_reunion' },
        ],
      },
    ]

    function ParteSummary({ parte, titulo }: { parte: Record<string, unknown> | undefined; titulo: string }) {
      if (!parte) return null
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2">{titulo}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-400">Tipo:</span>
            <span className="text-slate-800">{String(parte.tipo ?? '—')}</span>
            <span className="text-slate-400">Nombre:</span>
            <span className="text-slate-800 font-medium">{String(parte.nombre ?? '—')}</span>
            <span className="text-slate-400">DNI/CUIT:</span>
            <span className="text-slate-800">{String(parte.dni_cuit ?? '—')}</span>
            <span className="text-slate-400">Domicilio:</span>
            <span className="text-slate-800">{String(parte.domicilio ?? '—')}</span>
            <span className="text-slate-400">Email:</span>
            <span className="text-slate-800">{String(parte.email ?? '—')}</span>
            {parte.rep_legal ? (
              <>
                <span className="text-slate-400">Rep. Legal:</span>
                <span className="text-slate-800">{String(parte.rep_legal)}</span>
              </>
            ) : null}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cuestionario NDA — Datos del cliente</p>

        {/* Partes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ParteSummary parte={div} titulo="Parte Divulgadora" />
          <ParteSummary parte={rec} titulo="Parte Receptora" />
        </div>

        {/* Demás secciones */}
        {SECCIONES.map(sec => {
          const camposConValor = sec.campos.filter(c => {
            const v = datos[c.clave]
            return v !== null && v !== undefined && v !== '' && v !== false
          })
          if (camposConValor.length === 0) return null
          return (
            <div key={sec.titulo} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">{sec.titulo}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {camposConValor.map(c => {
                  const v = datos[c.clave]
                  const display = typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v ?? '—')
                  return (
                    <React.Fragment key={c.clave}>
                      <span className="text-slate-400">{c.label}:</span>
                      <span className="text-slate-800">{display}</span>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (tipo === 'TYC') {
    const SECCIONES_TYC: { titulo: string; campos: { label: string; clave: string }[] }[] = [
      {
        titulo: 'La empresa',
        campos: [
          { label: 'Nombre legal', clave: 'nombre_legal' },
          { label: 'Tipo de persona', clave: 'tipo_persona' },
          { label: 'CUIT', clave: 'cuit' },
          { label: 'Nombre comercial', clave: 'nombre_comercial' },
          { label: 'Domicilio', clave: 'domicilio' },
          { label: 'Email contacto', clave: 'email_contacto' },
          { label: 'Teléfono', clave: 'telefono_contacto' },
        ],
      },
      {
        titulo: 'La plataforma',
        campos: [
          { label: 'Tipo', clave: 'tipo_plataforma' },
          { label: 'URL sitio web', clave: 'url_website' },
          { label: 'Nombre app', clave: 'nombre_app' },
          { label: 'Categoría', clave: 'categoria_negocio' },
          { label: 'Descripción', clave: 'descripcion' },
          { label: 'Vende productos/servicios', clave: 'vende_prod_serv' },
          { label: 'Usuarios en UE', clave: 'usuarios_ue' },
          { label: 'País hosting', clave: 'pais_hosting' },
        ],
      },
      {
        titulo: 'Los usuarios',
        campos: [
          { label: 'Cuentas de usuario', clave: 'cuentas_usuarios' },
          { label: 'Vincula redes sociales', clave: 'vincula_rrss' },
          { label: 'Permite menores', clave: 'menores_permitidos' },
          { label: 'Edad mínima', clave: 'edad_minima' },
          { label: 'Contenido de usuarios (UGC)', clave: 'contenido_usuarios' },
          { label: 'Reseñas', clave: 'resenias' },
          { label: 'Marketplace entre usuarios', clave: 'tiene_marketplace' },
          { label: 'Links externos', clave: 'links_externos' },
        ],
      },
      {
        titulo: 'El negocio',
        campos: [
          { label: 'Suscripción de pago', clave: 'tiene_subscripcion' },
          { label: 'Renovación automática', clave: 'renov_automatica' },
          { label: 'Frecuencia renovación', clave: 'frecuencia_renov' },
          { label: 'Período de prueba', clave: 'tiene_prueba' },
          { label: 'Cancelación', clave: 'forma_cancelacion' },
          { label: 'Publicidad terceros', clave: 'publicidad_terceros' },
          { label: 'Envía marketing', clave: 'envia_marketing' },
          { label: 'Canales marketing', clave: 'tipos_marketing' },
          { label: 'Link privacidad', clave: 'link_privacidad' },
        ],
      },
      {
        titulo: 'Lo legal',
        campos: [
          { label: 'Resolución conflictos', clave: 'resolucion_conflictos' },
          { label: 'Jurisdicción', clave: 'jurisdiccion' },
          { label: 'Notificación cambios', clave: 'notifica_cambios' },
          { label: 'Nombre del documento', clave: 'nombre_documento' },
          { label: 'Idioma', clave: 'idioma' },
          { label: 'Fecha vigencia', clave: 'fecha_vigencia' },
          { label: 'Plazo seleccionado', clave: 'plazo_seleccionado' },
          { label: 'Quiere reunión', clave: 'quiere_reunion' },
        ],
      },
    ]

    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cuestionario TyC — Datos del cliente</p>
        {SECCIONES_TYC.map(sec => {
          const camposConValor = sec.campos.filter(c => {
            const v = datos[c.clave]
            return v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)
          })
          if (camposConValor.length === 0) return null
          return (
            <div key={sec.titulo} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">{sec.titulo}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {camposConValor.map(c => {
                  const v = datos[c.clave]
                  const display = Array.isArray(v)
                    ? v.join(', ')
                    : typeof v === 'boolean'
                    ? (v ? 'Sí' : 'No')
                    : String(v ?? '—')
                  return (
                    <React.Fragment key={c.clave}>
                      <span className="text-slate-400">{c.label}:</span>
                      <span className="text-slate-800">{display}</span>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (tipo === 'PP') {
    const SECCIONES_PP: { titulo: string; campos: { label: string; clave: string }[] }[] = [
      {
        titulo: 'La organización',
        campos: [
          { label: 'Tipo de persona', clave: 'tipo_persona' },
          { label: 'Nombre legal', clave: 'nombre_legal' },
          { label: 'CUIT / CUIL', clave: 'cuit' },
          { label: 'Nombre comercial', clave: 'nombre_comercial' },
          { label: 'Domicilio', clave: 'domicilio' },
          { label: 'Email contacto', clave: 'email_contacto' },
          { label: 'Teléfono', clave: 'telefono_contacto' },
          { label: 'Email privacidad', clave: 'email_privacidad' },
        ],
      },
      {
        titulo: 'La plataforma',
        campos: [
          { label: 'Tipo plataforma', clave: 'tipo_plataforma' },
          { label: 'URL sitio web', clave: 'url_website' },
          { label: 'Nombre app', clave: 'nombre_app' },
          { label: 'Descripción servicio', clave: 'descripcion_servicio' },
          { label: 'Usuarios en UE', clave: 'usuarios_ue' },
          { label: 'País hosting', clave: 'pais_hosting' },
          { label: 'Cuentas de usuario', clave: 'cuentas_usuarios' },
          { label: 'Eliminación de cuenta', clave: 'eliminacion_cuenta' },
          { label: 'Permite menores', clave: 'tiene_menores' },
          { label: 'Edad mínima', clave: 'edad_minima' },
        ],
      },
      {
        titulo: 'Datos recopilados',
        campos: [
          { label: 'Datos personales directos', clave: 'datos_personales' },
          { label: 'Datos automáticos', clave: 'datos_automaticos' },
          { label: 'Datos sensibles', clave: 'datos_sensibles' },
          { label: 'Procesador de pagos', clave: 'procesador_pago' },
          { label: 'Login social', clave: 'login_social_opts' },
          { label: 'Permisos app', clave: 'permisos_app' },
        ],
      },
      {
        titulo: 'Uso y terceros',
        campos: [
          { label: 'Finalidades', clave: 'finalidades' },
          { label: 'Canales marketing', clave: 'canal_marketing' },
          { label: 'Analytics / tracking', clave: 'analytics' },
          { label: 'Publicidad terceros', clave: 'publicidad_terceros' },
          { label: 'Proveedores IA', clave: 'proveedores_ia' },
          { label: 'Transferencia internacional', clave: 'transferencia_intl' },
          { label: 'Período retención', clave: 'periodo_retencion' },
        ],
      },
      {
        titulo: 'Derechos y legal',
        campos: [
          { label: 'Medidas de seguridad', clave: 'medidas_seguridad' },
          { label: 'Notif. cambios', clave: 'notifica_cambios' },
          { label: 'Jurisdicción', clave: 'jurisdiccion' },
          { label: 'Nombre documento', clave: 'nombre_documento' },
          { label: 'Fecha vigencia', clave: 'fecha_vigencia' },
          { label: 'Plazo seleccionado', clave: 'plazo_seleccionado' },
          { label: 'Quiere reunión', clave: 'quiere_reunion' },
          { label: 'Info adicional', clave: 'info_adicional' },
        ],
      },
    ]

    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cuestionario PP — Datos del cliente</p>
        {SECCIONES_PP.map(sec => {
          const camposConValor = sec.campos.filter(c => {
            const v = datos[c.clave]
            return v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)
          })
          if (camposConValor.length === 0) return null
          return (
            <div key={sec.titulo} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">{sec.titulo}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {camposConValor.map(c => {
                  const v = datos[c.clave]
                  const display = Array.isArray(v)
                    ? v.join(', ')
                    : typeof v === 'boolean'
                    ? (v ? 'Sí' : 'No')
                    : String(v ?? '—')
                  return (
                    <React.Fragment key={c.clave}>
                      <span className="text-slate-400">{c.label}:</span>
                      <span className="text-slate-800">{display}</span>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (tipo === 'ART9' || tipo === 'GANANCIAS') {
    const label = tipo === 'ART9' ? 'Amparo Art. 9 Ley 24.463' : 'Amparo Impuesto a las Ganancias'
    const docs = (datos.documentos_adjuntos as Record<string, unknown>[] | undefined) ?? []
    const sexoLabel = datos.sexo === 'F' ? 'Femenino' : datos.sexo === 'M' ? 'Masculino' : String(datos.sexo ?? '—')
    const metodoBonos = datos.metodo_bonos as string | undefined
    const credAnses = datos.credenciales_anses as Record<string, unknown> | undefined

    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del cliente — {label}</p>

        {/* Datos personales */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Datos personales</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Campo label="Nombre completo" valor={datos.nombre_completo} />
            <Campo label="Sexo" valor={sexoLabel} />
            <Campo label="Fecha de nacimiento" valor={datos.fecha_nacimiento} />
            <Campo label="DNI" valor={datos.dni} />
            <Campo label="CUIT / CUIL" valor={datos.cuit_cuil} />
            <Campo label="Domicilio" valor={datos.domicilio} />
            <Campo label="Fecha de jubilación" valor={datos.fecha_jubilacion} />
          </div>
        </div>

        {/* Documentos adjuntos */}
        {docs.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Documentos subidos por el cliente</p>
            <div className="space-y-2">
              {docs.map((doc, i) => {
                const tipoDoc = String(doc.tipo ?? '')
                const docLabels: Record<string, string> = {
                  dni_frente: '🪪 DNI Frente',
                  dni_dorso:  '🪪 DNI Dorso',
                  bono:       '📄 Bono de sueldo',
                }
                const docLabel = docLabels[tipoDoc] ?? `📎 ${tipoDoc}`
                return (
                  <div key={i} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{docLabel}</p>
                      <p className="text-xs text-slate-400">{String(doc.nombre ?? '')} — {doc.subido_at ? new Date(String(doc.subido_at)).toLocaleDateString('es-AR') : ''}</p>
                    </div>
                    {doc.url ? (
                      <a href={String(doc.url)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground font-medium shrink-0">
                        Ver →
                      </a>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Credenciales Mi ANSES */}
        {metodoBonos === 'anses' && credAnses && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Credenciales Mi ANSES (acceso gestionado)</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-amber-600">Usuario:</span>
              <span className="text-amber-900 font-mono">{String(credAnses.usuario ?? '—')}</span>
              <span className="text-amber-600">Clave:</span>
              <span className="text-amber-900 font-mono">{String(credAnses.clave ?? '—')}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return <pre className="text-xs text-slate-500">{JSON.stringify(datos, null, 2)}</pre>
}

// ── Helpers para generar texto del edicto (sin hooks, puros) ──
function _calcEdad(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const hoy = new Date()
  let edad = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--
  return edad
}

function _fmtDNI(dni: string): string {
  const digits = dni.replace(/\D/g, '')
  if (digits.length === 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  return dni
}

function _nacidoA(cuit: string): string {
  return cuit.replace(/\D/g, '').substring(0, 2) === '27' ? 'nacida' : 'nacido'
}

function _docStr(dni: string, cuit: string, nacionalidad: string): string {
  return /argentin/i.test(nacionalidad) && dni
    ? `DNI Nº ${_fmtDNI(dni)}, CUIT Nº ${cuit}`
    : `CDI ${cuit}`
}

function _menosMil(n: number, fem: boolean): string {
  const uF = ['','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte']
  const uM = ['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte']
  const dec = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa']
  const cF = ['','cien','doscientas','trescientas','cuatrocientas','quinientas','seiscientas','setecientas','ochocientas','novecientas']
  const cM = ['','cien','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos']
  if (n === 0) return ''
  if (n <= 20) return fem ? uF[n] : uM[n]
  if (n < 30) {
    const vF = ['','veintiuna','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve']
    const vM = ['','veintiún','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve']
    return fem ? vF[n-20] : vM[n-20]
  }
  if (n < 100) {
    const d2 = Math.floor(n/10), u = n%10
    return u === 0 ? dec[d2] : dec[d2] + ' y ' + (fem ? uF[u] : uM[u])
  }
  const c = Math.floor(n/100), r = n%100
  const base = c === 1 && r > 0 ? 'ciento' : (fem ? cF[c] : cM[c])
  return r === 0 ? base : base + ' ' + _menosMil(r, fem)
}

function _numLetras(n: number): string {
  if (n === 0) return 'cero'
  if (n >= 1_000_000) {
    const m = Math.floor(n/1_000_000), r = n%1_000_000
    const ms = m === 1 ? 'un millón' : _numLetras(m) + ' millones'
    return r > 0 ? ms + ' ' + _numLetras(r) : ms
  }
  if (n >= 1_000) {
    const th = Math.floor(n/1_000), r = n%1_000
    const ths = th === 1 ? 'mil' : _menosMil(th, false) + ' mil'
    return r > 0 ? ths + ' ' + _menosMil(r, true) : ths
  }
  return _menosMil(n, true)
}

function _isoADDMMAAAA(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function generarTextoEdicto(datos: Record<string, unknown>, fechaActa: string): string {
  const denominaciones = (datos.denominaciones as string[] | undefined) ?? []
  const denominacion   = denominaciones[0] ?? 'DENOMINACIÓN PENDIENTE'
  const sedeSocial     = String(datos.sede_social   ?? '')
  const objetoSocial   = String(datos.objeto_social ?? '')
  const capitalNum     = Number(datos.capital_social ?? 0)
  const capital        = capitalNum.toLocaleString('es-AR')
  const cantAcciones   = (capitalNum / 100).toLocaleString('es-AR')

  const rawSocios = (datos.socios as Record<string, unknown>[] | undefined) ?? []
  const socios = rawSocios.map(s => {
    const nombre       = String(s.nombre ?? '')
    const dni          = String(s.dni    ?? '')
    const cuit         = String(s.cuit   ?? '')
    const nacionalidad = String(s.nacionalidad ?? 'argentina')
    const fechaRaw     = String(s.fecha_nacimiento ?? '')
    const fechaFmt     = s.fecha_nacimiento_formateada ? String(s.fecha_nacimiento_formateada) : fechaRaw
    const accionesNum  = Number(s.cantidad_acciones ?? s.acciones_susc ?? 0)
    return {
      nombre,
      docStr:       _docStr(dni, cuit, nacionalidad),
      edad:         fechaRaw ? String(_calcEdad(fechaRaw)) : '',
      nacidoA:      _nacidoA(cuit),
      nacionalidad,
      fechaNac:     fechaFmt,
      profesion:    String(s.profesion    ?? ''),
      estadoCivil:  String(s.estado_civil ?? ''),
      domicilio:    String(s.domicilio    ?? ''),
      email:        String(s.email        ?? ''),
      accionesNum,
      accionesLetras: _numLetras(accionesNum),
    }
  })

  const tituloSocios = socios.length === 1 ? 'Socio' : 'Socios'

  const listaSocios = socios
    .map((s, i) => {
      const sep = i < socios.length - 1 ? '; ' : ' '
      return `${s.nombre}, ${s.docStr}, ${s.edad} años de edad, de nacionalidad ${s.nacionalidad}, ${s.nacidoA} el ${s.fechaNac}, profesión: ${s.profesion}, estado civil: ${s.estadoCivil}, con domicilio en ${s.domicilio}, constituyendo dirección electrónica: ${s.email}${sep}`
    })
    .join('')

  const nombresArr = socios.map(s => s.nombre)
  const fraseSusc  = socios.length === 1
    ? `El Socio ${nombresArr[0]} suscribe`
    : `Los Socios ${[...nombresArr.slice(0, -1)].join(', ')} y ${nombresArr[nombresArr.length - 1]} suscriben`

  const detalleSusc = socios
    .map((s, i) => {
      const sep = i < socios.length - 1 ? ', ' : '. '
      return `${s.nombre} suscribe la cantidad de ${s.accionesLetras} (${s.accionesNum.toLocaleString('es-AR')}) acciones ordinarias nominativas no endosables, de PESOS ARGENTINOS CIEN ($100) valor nominal cada una y con derecho a un voto por acción${sep}`
    })
    .join('')

  const adminT      = datos.administrador_titular  as Record<string, unknown> | undefined
  const adminS      = datos.administrador_suplente as Record<string, unknown> | undefined
  const nombreAdminT = String(adminT?.nombre ?? '')
  const nombreAdminS = String(adminS?.nombre ?? '')

  const fechaActaStr = fechaActa ? `Fecha del acta constitutiva: ${fechaActa}; ` : ''

  return (
    `${denominacion} : Comuníquese la constitución de una Sociedad por Acciones Simplificada, ` +
    `conforme a las siguientes previsiones legales: ` +
    `1°) ${tituloSocios}: ${listaSocios}` +
    `${fechaActaStr}` +
    `2°) Razón Social: ${denominacion} S.A.S. ` +
    `3°) Sede Social: ${sedeSocial} ` +
    `4°) Objeto: ${objetoSocial} ` +
    `5°) Plazo: 99 años contados a partir de la fecha de su constitución. ` +
    `6°) Capital Social: El Capital Social es de $${capital}, representado por ${cantAcciones} acciones ` +
    `ordinarias nominativas no endosables de $100,00 (PESOS CIEN), valor nominal cada una y con derecho ` +
    `a 1 (UN) voto por acción. ${fraseSusc} el 100% del capital social de acuerdo con el siguiente ` +
    `detalle: ${detalleSusc}` +
    `El capital social se integra en un veinticinco por ciento (25%) en dinero efectivo, acreditándose ` +
    `tal circunstancia mediante la constancia de pago de los gastos correspondientes a la constitución ` +
    `de la sociedad, debiendo integrarse el saldo pendiente del capital social dentro del plazo máximo ` +
    `de dos (2) años, contados desde la fecha de constitución de la sociedad. ` +
    `7°) Órgano de Administración: ADMINISTRADOR TITULAR: ${nombreAdminT}, ` +
    `ADMINISTRADOR SUPLENTE: ${nombreAdminS}. ` +
    `8°) Órgano de Fiscalización: la sociedad prescinde de la sindicatura. ` +
    `9°) Representación de la sociedad: la representación de la sociedad será ejercida por el ` +
    `administrador titular designado. ` +
    `10°) Fecha de cierre de ejercicio: 31 de diciembre de cada año.`
  )
}

// ── Generador de documentos NDA ───────────────────────────────────
function GenerarDocumentosNDA({ tramiteId, datos, datosPropuesta }: {
  tramiteId: string
  datos:          Record<string, unknown>
  datosPropuesta: Record<string, unknown>
}) {
  const [generando, setGenerando] = useState(false)
  const [error,     setError]     = useState('')

  function ars(n: unknown) {
    if (typeof n !== 'number') return '—'
    return '$ ' + Math.round(n).toLocaleString('es-AR')
  }

  async function descargar() {
    setGenerando(true)
    setError('')
    try {
      const res = await fetch(`/api/generar-nda?tramiteId=${tramiteId}`)
      if (!res.ok) {
        const txt = await res.text()
        setError(txt || 'Error al generar el documento.')
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `NDA_${tramiteId.slice(0, 8)}.docx`
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerando(false)
    }
  }

  const plazo   = String(datos.plazo_seleccionado ?? '—')
  const idioma  = String(datos.idioma ?? '—')
  const reunion = datos.quiere_reunion === true

  const PLAZO_LABEL: Record<string, string> = {
    '24hs':  '24 horas',
    '3dias': '3 días hábiles',
    '5dias': '5 días hábiles',
  }
  const PRECIO_KEY: Record<string, string> = {
    '24hs':  'precio_24hs',
    '3dias': 'precio_3dias',
    '5dias': 'precio_5dias',
  }
  const precioKey   = PRECIO_KEY[plazo]
  const precioTotal = precioKey ? datosPropuesta[precioKey] : undefined

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Generar NDA
      </p>

      {/* Resumen de lo elegido por el cliente */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Plazo elegido</p>
          <p className="text-sm font-semibold text-slate-800">{PLAZO_LABEL[plazo] ?? plazo}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Precio acordado</p>
          <p className="text-sm font-semibold text-slate-800">{ars(precioTotal)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Idioma / Reunión</p>
          <p className="text-sm font-semibold text-slate-800 capitalize">
            {idioma}{reunion ? ' · Reunion sí' : ''}
          </p>
        </div>
      </div>

      {/* Botón de generación */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">Acuerdo de Confidencialidad (NDA)</p>
          <p className="text-xs text-slate-400 mt-0.5">
            DOCX pre-completado con los datos del cuestionario, listo para revisión final y firma
          </p>
        </div>
        <button
          type="button"
          disabled={generando}
          onClick={descargar}
          className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          {generando ? (
            <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generando...</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Descargar NDA (DOCX)</>
          )}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Documento pre-completado con los datos del cuestionario. Revisarlo antes de enviarlo al cliente.
      </p>
    </div>
  )
}

// ── Generador de documentos TYC ──────────────────────────────────────
function GenerarDocumentosTYC({ tramiteId, datos, datosPropuesta }: {
  tramiteId: string
  datos:          Record<string, unknown>
  datosPropuesta: Record<string, unknown>
}) {
  const [generando, setGenerando] = useState(false)
  const [error,     setError]     = useState('')

  function ars(n: unknown) {
    if (typeof n !== 'number') return '—'
    return '$ ' + Math.round(n).toLocaleString('es-AR')
  }

  async function descargar() {
    setGenerando(true)
    setError('')
    try {
      const res = await fetch(`/api/generar-tyc?tramiteId=${tramiteId}`)
      if (!res.ok) {
        const txt = await res.text()
        setError(txt || 'Error al generar el documento.')
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = href
      a.download = `TyC_${tramiteId.slice(0, 8)}.docx`
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerando(false)
    }
  }

  const plazo    = String(datos.plazo_seleccionado ?? '—')
  const idioma   = String(datos.idioma ?? '—')
  const reunion  = datos.quiere_reunion === true
  const nombreDoc = String(datos.nombre_documento ?? 'tyc')
  const docLabel  = nombreDoc === 'servicio' ? 'Términos de Servicio' : nombreDoc === 'uso' ? 'Términos de Uso' : 'Términos y Condiciones'

  const PLAZO_LABEL: Record<string, string> = {
    '24hs':  '24 horas',
    '3dias': '3 días hábiles',
    '5dias': '5 días hábiles',
  }
  const PRECIO_KEY: Record<string, string> = {
    '24hs':  'precio_24hs',
    '3dias': 'precio_3dias',
    '5dias': 'precio_5dias',
  }
  const precioKey   = PRECIO_KEY[plazo]
  const precioTotal = precioKey ? datosPropuesta[precioKey] : undefined

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Generar {docLabel}
      </p>

      {/* Resumen de lo elegido por el cliente */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Plazo elegido</p>
          <p className="text-sm font-semibold text-slate-800">{PLAZO_LABEL[plazo] ?? plazo}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Precio acordado</p>
          <p className="text-sm font-semibold text-slate-800">{ars(precioTotal)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Idioma / Reunión</p>
          <p className="text-sm font-semibold text-slate-800 capitalize">
            {idioma}{reunion ? ' · Reunión sí' : ''}
          </p>
        </div>
      </div>

      {/* Botón de generación */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">{docLabel}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            DOCX generado automáticamente con los datos del cuestionario, listo para revisión final
          </p>
        </div>
        <button
          type="button"
          disabled={generando}
          onClick={descargar}
          className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          {generando ? (
            <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generando...</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Descargar {docLabel} (DOCX)</>
          )}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Documento generado automáticamente. Revisar y ajustar antes de enviarlo al cliente.
      </p>
    </div>
  )
}

// ── Generador de documentos PP ────────────────────────────────────────
function GenerarDocumentosPP({ tramiteId, datos, datosPropuesta }: {
  tramiteId: string
  datos:          Record<string, unknown>
  datosPropuesta: Record<string, unknown>
}) {
  const [generando, setGenerando] = useState(false)
  const [error,     setError]     = useState('')

  function ars(n: unknown) {
    if (typeof n !== 'number') return '—'
    return '$ ' + Math.round(n).toLocaleString('es-AR')
  }

  async function descargar() {
    setGenerando(true)
    setError('')
    try {
      const res = await fetch(`/api/generar-pp?tramiteId=${tramiteId}`)
      if (!res.ok) {
        const txt = await res.text()
        setError(txt || 'Error al generar el documento.')
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = href
      a.download = `PP_${tramiteId.slice(0, 8)}.docx`
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerando(false)
    }
  }

  const plazo     = String(datos.plazo_sel ?? datos.plazo_seleccionado ?? '—')
  const reunion   = datos.quiere_reunion === true
  const nombreDoc = String(datos.nombre_documento ?? 'politica')
  const docLabel  = nombreDoc === 'aviso'      ? 'Aviso de Privacidad'
                  : nombreDoc === 'declaracion' ? 'Declaración de Privacidad'
                  : 'Política de Privacidad'

  const PLAZO_LABEL: Record<string, string> = {
    '24hs':  '24 horas',
    '3dias': '3 días hábiles',
    '5dias': '5 días hábiles',
  }
  const PRECIO_KEY: Record<string, string> = {
    '24hs':  'precio_24hs',
    '3dias': 'precio_3dias',
    '5dias': 'precio_5dias',
  }
  const precioKey   = PRECIO_KEY[plazo]
  const precioTotal = precioKey ? datosPropuesta[precioKey] : undefined

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Generar {docLabel}
      </p>

      {/* Resumen de lo elegido por el cliente */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Plazo elegido</p>
          <p className="text-sm font-semibold text-slate-800">{PLAZO_LABEL[plazo] ?? plazo}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Precio acordado</p>
          <p className="text-sm font-semibold text-slate-800">{ars(precioTotal)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Tipo / Reunión</p>
          <p className="text-sm font-semibold text-slate-800 capitalize">
            {docLabel}{reunion ? ' · Reunión sí' : ''}
          </p>
        </div>
      </div>

      {/* Botón de generación */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">{docLabel}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            DOCX generado automáticamente con los datos del cuestionario, listo para revisión final
          </p>
        </div>
        <button
          type="button"
          disabled={generando}
          onClick={descargar}
          className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          {generando ? (
            <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generando...</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Descargar {docLabel} (DOCX)</>
          )}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Documento generado automáticamente. Revisar y ajustar antes de enviarlo al cliente.
      </p>
    </div>
  )
}

// ── Generador de documentos SAS (Reserva + Edicto modal + Estatuto) ─
function GenerarDocumentosSAS({ tramiteId, datos }: {
  tramiteId: string
  datos: Record<string, unknown>
}) {
  const [generando, setGenerando] = useState<'estatuto' | null>(null)
  const [errores, setErrores]     = useState<Record<string, string>>({})
  const [showEdicto, setShowEdicto]   = useState(false)
  const [showReserva, setShowReserva] = useState(false)

  async function descargar(tipo: 'estatuto', url: string, nombreArchivo: string) {
    setGenerando(tipo)
    setErrores(prev => { const n = { ...prev }; delete n[tipo]; return n })
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const txt = await res.text()
        setErrores(prev => ({ ...prev, [tipo]: txt }))
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href; a.download = nombreArchivo; a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setErrores(prev => ({ ...prev, [tipo]: String(e) }))
    } finally {
      setGenerando(null)
    }
  }

  return (
    <>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Generar documentos SAS
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* ── Reserva de Denominación ── */}
          <div className="bg-white rounded-lg border border-border p-3 flex flex-col gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Reserva de Denominación</p>
              <p className="text-xs text-slate-400 mt-0.5">PDF unificado para presentación por email a Personas Jurídicas</p>
            </div>
            <button
              type="button"
              onClick={() => setShowReserva(true)}
              className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Preparar presentación →
            </button>
          </div>

          {/* ── Texto del Edicto (modal) ── */}
          <div className="bg-white rounded-lg border border-border p-3 flex flex-col gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Texto del Edicto</p>
              <p className="text-xs text-slate-400 mt-0.5">Generá el texto para copiar y pegar en la web de publicación</p>
            </div>
            <button
              type="button"
              onClick={() => setShowEdicto(true)}
              className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              Generar texto
            </button>
          </div>

          {/* ── Estatuto Social ── */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Estatuto Social</p>
              <p className="text-xs text-slate-400 mt-0.5">Acta constitutiva completa lista para firma</p>
            </div>
            <button
              type="button"
              disabled={generando === 'estatuto'}
              onClick={() => descargar('estatuto', `/api/generar-estatuto-sas?tramiteId=${tramiteId}`, `estatuto_${tramiteId.slice(0,8)}.docx`)}
              className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              {generando === 'estatuto' ? (
                <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generando...</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Descargar DOCX</>
              )}
            </button>
            {errores.estatuto && <p className="text-xs text-red-500">{errores.estatuto}</p>}
          </div>

        </div>
        <p className="text-xs text-slate-400 mt-2">Documentos pre-completados con los datos del cliente. Uso interno Zonda Legal.</p>
      </div>

      {/* Modal del Edicto */}
      {showEdicto && (
        <EdictoModal datos={datos} onClose={() => setShowEdicto(false)} />
      )}

      {/* Modal de Preparación de Reserva */}
      {showReserva && (
        <ReservaEnvioModal tramiteId={tramiteId} datos={datos} onClose={() => setShowReserva(false)} />
      )}
    </>
  )
}

// ── Modal de Preparación de Reserva de Denominación ───────────
function ReservaEnvioModal({ tramiteId, datos, onClose }: {
  tramiteId: string
  datos: Record<string, unknown>
  onClose: () => void
}) {
  const [visible,        setVisible]        = useState(false)
  const [firmab64,       setFirmab64]       = useState<string>('')
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [generando,      setGenerando]      = useState(false)
  const [errorPDF,       setErrorPDF]       = useState('')
  const [pdfListo,       setPdfListo]       = useState(false)
  const [copiadoEmail,   setCopiadoEmail]   = useState(false)

  // Cargar firma guardada y disparar animación de entrada
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    try {
      const saved = localStorage.getItem('zonda_firma_b64')
      if (saved) setFirmab64(saved)
    } catch { /* sin acceso a localStorage */ }
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  function handleFirmaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result as string
      setFirmab64(b64)
      try { localStorage.setItem('zonda_firma_b64', b64) } catch { /* ignore */ }
    }
    reader.readAsDataURL(file)
  }

  async function handleGenerarPDF() {
    setGenerando(true)
    setErrorPDF('')
    setPdfListo(false)
    try {
      const fd = new FormData()
      if (comprobanteFile) fd.append('comprobante', comprobanteFile)
      if (firmab64) fd.append('firma_b64', firmab64)

      const res = await fetch(`/api/preparar-reserva-sas?tramiteId=${tramiteId}`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const txt = await res.text()
        setErrorPDF(txt)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const denominaciones = (datos.denominaciones as string[] | undefined) ?? []
      const slug = (denominaciones[0] ?? 'reserva').replace(/\s+/g, '_').toLowerCase()
      a.href = url
      a.download = `presentacion_reserva_${slug}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setPdfListo(true)
    } catch (e) {
      setErrorPDF(String(e))
    } finally {
      setGenerando(false)
    }
  }

  const emailBody = [
    'Estimados muy buenos días, espero se encuentren muy bien.',
    '',
    'Por medio del presente se hace presentación de la documentación necesaria para proceder con la reserva de denominación, haciendo también una propuesta de alternativas en caso de homonimia.',
    '',
    'Quedo atento a sus comentarios y a la espera de la reserva.',
    '',
    'Saludos cordiales.',
  ].join('\n')

  const destEmail = 'personas-juridicas@mendoza.gov.ar'
  const asunto    = 'RESERVA DE DENOMINACIÓN'
  // Abre Gmail en el navegador directamente (en lugar del cliente de correo local)
  const mailtoHref = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(destEmail)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(emailBody)}`

  async function handleCopiarEmail() {
    try {
      await navigator.clipboard.writeText(emailBody)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = emailBody
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiadoEmail(true)
    setTimeout(() => setCopiadoEmail(false), 2500)
  }

  function Badge({ n }: { n: number }) {
    return (
      <span className="w-5 h-5 rounded-full bg-foreground text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 transition-colors duration-200 ${visible ? 'bg-black/50' : 'bg-transparent'}`}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transition-all duration-200 ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-95'}`}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Preparar Presentación — Reserva de Denominación</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              PDF unificado para enviar por email a Personas Jurídicas Mendoza
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-300 hover:text-slate-600 text-2xl leading-none ml-4 transition-colors">×</button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Paso 1: Pago ── */}
          <div className="flex gap-3 items-start">
            <Badge n={1} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 mb-1">Pago de Tasa 833</p>
              <p className="text-xs text-slate-500 mb-2">
                Pagá la Tasa 833 en la web de ATM antes de generar el PDF. El comprobante se adjuntará al final.
              </p>
              <a
                href="https://atm.mendoza.gov.ar/pagaronlinetasas/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground bg-foreground hover:bg-foreground/90 px-3 py-2 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                Ir a ATM Mendoza →
              </a>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* ── Paso 2: Comprobante ── */}
          <div className="flex gap-3 items-start">
            <Badge n={2} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 mb-1">Comprobante de Pago</p>
              <p className="text-xs text-slate-500 mb-2">Subí el PDF del comprobante de la Tasa 833 (se adjunta al final del PDF unificado).</p>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-border rounded-xl p-4 cursor-pointer transition-colors bg-muted hover:bg-muted/70">
                <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                {comprobanteFile ? (
                  <span className="text-xs font-medium text-foreground">✓ {comprobanteFile.name}</span>
                ) : (
                  <span className="text-xs text-slate-400">Clic para subir comprobante PDF</span>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={e => setComprobanteFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* ── Paso 3: Firma ── */}
          <div className="flex gap-3 items-start">
            <Badge n={3} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 mb-1">Firma</p>
              <p className="text-xs text-slate-500 mb-2">
                La firma se guarda en este navegador para futuras presentaciones.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {firmab64 ? (
                  <>
                    <img
                      src={firmab64}
                      alt="Firma guardada"
                      className="h-12 border border-slate-200 rounded-lg bg-slate-900 object-contain px-2"
                      style={{ maxWidth: '160px' }}
                    />
                    <span className="text-xs text-foreground font-medium">✓ Firma cargada</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400 italic">Sin firma guardada</span>
                )}
                <label className="ml-auto cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-foreground border border-border bg-muted hover:bg-muted/70 px-2.5 py-1.5 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  {firmab64 ? 'Cambiar firma' : 'Subir firma PNG'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/*"
                    className="sr-only"
                    onChange={handleFirmaChange}
                  />
                </label>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* ── Paso 4: Generar PDF ── */}
          <div className="flex gap-3 items-start">
            <Badge n={4} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 mb-1">Generar PDF Unificado</p>
              <p className="text-xs text-slate-500 mb-3">
                Genera el PDF con el formulario DPJ, la nota de reserva y el comprobante de pago.
              </p>
              <button
                type="button"
                disabled={generando}
                onClick={handleGenerarPDF}
                className="flex items-center gap-2 bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {generando ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Generando PDF...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    {pdfListo ? '↓ Volver a descargar PDF' : '↓ Generar y descargar PDF'}
                  </>
                )}
              </button>
              {pdfListo && (
                <p className="text-xs text-foreground font-medium mt-2">✓ PDF descargado correctamente</p>
              )}
              {errorPDF && (
                <p className="text-xs text-red-500 mt-2 font-mono break-all">{errorPDF}</p>
              )}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* ── Paso 5: Correo ── */}
          <div className="flex gap-3 items-start">
            <Badge n={5} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 mb-1">Enviar por Correo</p>
              <p className="text-xs text-slate-500 mb-2">
                Para: <span className="font-mono text-slate-700">{destEmail}</span>
                &nbsp;·&nbsp; Asunto: <span className="font-mono text-slate-700">{asunto}</span>
              </p>
              <textarea
                readOnly
                value={emailBody}
                onClick={e => (e.target as HTMLTextAreaElement).select()}
                rows={5}
                className="w-full text-xs text-slate-700 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-slate-50 leading-relaxed font-mono mb-2"
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopiarEmail}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all duration-200 ${
                    copiadoEmail
                      ? 'bg-foreground text-primary-foreground scale-95'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {copiadoEmail ? (
                    <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>¡Copiado!</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copiar texto</>
                  )}
                </button>
                <a
                  href={mailtoHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-foreground hover:bg-foreground/90 text-primary-foreground transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  Abrir correo →
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg border border-slate-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal con el texto del Edicto ──────────────────────────────
function EdictoModal({ datos, onClose }: {
  datos: Record<string, unknown>
  onClose: () => void
}) {
  const [fechaActa, setFechaActa] = useState('')
  const [copiado,   setCopiado]   = useState(false)
  const [visible,   setVisible]   = useState(false)

  // Dispara la transición de entrada tras el primer render
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  const texto = generarTextoEdicto(datos, _isoADDMMAAAA(fechaActa))

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // fallback para browsers sin clipboard API
      const ta = document.createElement('textarea')
      ta.value = texto
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    /* Overlay */
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 transition-colors duration-200 ${visible ? 'bg-black/50' : 'bg-transparent'}`}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Panel */}
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transition-all duration-200 ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-95'}`}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Texto del Edicto</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Copiá el texto y pegalo en la página de publicación de edictos de la Provincia
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-300 hover:text-slate-600 text-2xl leading-none ml-4 transition-colors">×</button>
        </div>

        {/* Fecha del acta (opcional) */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-muted">
          <label className="text-xs font-medium text-foreground whitespace-nowrap">
            Fecha del acta constitutiva:
          </label>
          <input
            type="date"
            value={fechaActa}
            onChange={e => setFechaActa(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring bg-white"
          />
          <span className="text-xs text-muted-foreground">
            {fechaActa ? `✓ Aparecerá como ${_isoADDMMAAAA(fechaActa)}` : 'Opcional — si no se completa, se omite del texto'}
          </span>
        </div>

        {/* Texto generado */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <textarea
            readOnly
            value={texto}
            onClick={e => (e.target as HTMLTextAreaElement).select()}
            rows={10}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl p-4 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-slate-50 leading-relaxed font-mono"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Hacé clic en el texto para seleccionarlo completo, o usá el botón Copiar.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopiar}
            className={`flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 ${
              copiado
                ? 'bg-foreground text-primary-foreground scale-95'
                : 'bg-foreground hover:bg-foreground/90 text-primary-foreground'
            }`}
          >
            {copiado ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                ¡Copiado!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Copiar texto
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5 rounded-lg border border-slate-200 transition-colors"
          >
            Cerrar
          </button>
          <a
            href="https://boe.mendoza.gov.ar/inicio"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-foreground transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            Ir al Boletín Oficial de Mendoza →
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Tab Partners ───────────────────────────────────────────────
function PartnersTab({
  partners, mostrarForm, setMostrarForm, isPending, startTransition
}: {
  partners: Partner[]
  mostrarForm: boolean
  setMostrarForm: (v: boolean) => void
  isPending: boolean
  startTransition: (fn: () => void) => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    nombre: '', email: '', password: generarPassword(),
    telefono: '', whatsapp: '', meet_link: ''
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const url = URL.createObjectURL(file)
    setLogoPreview(url)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.nombre || !form.email || !form.password) {
      setError('Nombre, email y contraseña son obligatorios.')
      return
    }

    startTransition(async () => {
      // 1. Crear el partner
      const result = await crearPartner(form)
      if (result.error) { setError(result.error); return }

      // 2. Subir logo si se eligió uno
      if (logoFile && result.partnerId) {
        setSubiendoLogo(true)
        const ext = logoFile.name.split('.').pop()
        const path = `logos/${result.partnerId}/logo.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(path, logoFile, { upsert: true })

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
          // Actualizar logo_url en el perfil del partner (con service role no es posible desde client,
          // pero el partner ya tiene RLS para actualizar su propio perfil — acá lo hacemos via supabase client
          // con la sesión del admin de Zonda que tiene privilegios)
          await supabase
            .from('perfiles')
            .update({ logo_url: urlData.publicUrl })
            .eq('id', result.partnerId)
        }
        setSubiendoLogo(false)
      }

      setExito(true)
      setTimeout(() => {
        setExito(false)
        setMostrarForm(false)
        setForm({ nombre: '', email: '', password: generarPassword(), telefono: '', whatsapp: '', meet_link: '' })
        setLogoFile(null)
        setLogoPreview(null)
      }, 3000)
    })
  }

  return (
    <div className="space-y-4">

      {/* Botón para abrir formulario */}
      {!mostrarForm && (
        <button
          onClick={() => setMostrarForm(true)}
          className="flex items-center gap-2 bg-foreground hover:bg-foreground/90 text-primary-foreground text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Dar de alta nuevo partner
        </button>
      )}

      {/* Formulario de nuevo partner */}
      {mostrarForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-base font-semibold text-slate-900">Nuevo Partner</h3>
            <button onClick={() => { setMostrarForm(false); setError(''); setExito(false) }}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          {exito ? (
            <div className="bg-muted border border-border rounded-lg p-4 text-center">
              <p className="text-foreground font-medium mb-1">✓ Partner creado con éxito</p>
              <p className="text-sm text-foreground">
                Email: <strong>{form.email}</strong> / Contraseña: <strong>{form.password}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Enviá estas credenciales al partner por WhatsApp o email.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Nombre del estudio *" name="nombre" value={form.nombre} onChange={handleChange} placeholder="Ej: Estudio Pérez & Asociados" />
                <Campo label="Email *" name="email" type="email" value={form.email} onChange={handleChange} placeholder="abogado@estudio.com" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña temporal *</label>
                  <div className="flex gap-2">
                    <input
                      name="password"
                      type="text"
                      value={form.password}
                      onChange={handleChange}
                      className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button type="button" onClick={() => setForm(p => ({ ...p, password: generarPassword() }))}
                      className="px-3 py-2.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors whitespace-nowrap">
                      Generar
                    </button>
                  </div>
                </div>
                <Campo label="Teléfono" name="telefono" value={form.telefono} onChange={handleChange} placeholder="Ej: +54 261 400-1234" />
                <Campo label="WhatsApp (solo número)" name="whatsapp" value={form.whatsapp} onChange={handleChange} placeholder="Ej: 5492614001234" />
                <Campo label="Link de reuniones" name="meet_link" value={form.meet_link} onChange={handleChange} placeholder="Ej: calendly.com/estudio o meet.google.com/..." />
              </div>

              {/* Logo del partner */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Logotipo del estudio
                  <span className="text-xs font-normal text-slate-400 ml-2">Aparece en las propuestas y en el portal del cliente</span>
                </label>
                <div className="flex items-center gap-4">
                  {logoPreview && (
                    <div className="w-24 h-14 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                      <img src={logoPreview} alt="Logo preview" className="max-w-full max-h-full object-contain p-1" />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer px-4 py-2.5 border border-dashed border-slate-300 rounded-lg hover:border-border hover:bg-muted transition-colors">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-sm text-slate-500">{logoFile ? logoFile.name : 'Subir logo (PNG, JPG, SVG)'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoChange} className="sr-only" />
                  </label>
                  {logoFile && (
                    <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null) }}
                      className="text-xs text-red-400 hover:text-red-600">Quitar</button>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={isPending || subiendoLogo}
                  className="bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                  {isPending ? 'Creando...' : subiendoLogo ? 'Subiendo logo...' : 'Crear partner'}
                </button>
                <button type="button" onClick={() => { setMostrarForm(false); setError('') }}
                  className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5 rounded-lg border border-slate-200 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Lista de partners */}
      {partners.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">No hay partners registrados todavía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {partners.map(partner => (
            <div key={partner.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="font-medium text-slate-900">{partner.nombre}</p>
              <p className="text-sm text-slate-500 mt-0.5">{partner.email}</p>
              <div className="flex gap-3 mt-3">
                {partner.whatsapp_link && (
                  <a href={partner.whatsapp_link} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground">WhatsApp</a>
                )}
                {partner.meet_link && (
                  <a href={partner.meet_link.startsWith('http') ? partner.meet_link : `https://${partner.meet_link}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground">Meet</a>
                )}
                {partner.telefono && (
                  <span className="text-xs text-slate-400">{partner.telefono}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Campo de formulario genérico ───────────────────────────────
function Campo({ label, name, value, onChange, placeholder, type = 'text' }: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
      />
    </div>
  )
}

// ── Generador de documentos Amparo (ART9 / GANANCIAS) ──────────
function GenerarDocumentosAmparo({ tramiteId, tipo, datos, datosPropuesta }: {
  tramiteId:      string
  tipo:           'ART9' | 'GANANCIAS'
  datos:          Record<string, unknown>
  datosPropuesta: Record<string, unknown>
}) {
  const supabase = createClient()
  const label    = tipo === 'ART9' ? 'Amparo Art. 9 Ley 24.463' : 'Amparo Impuesto a las Ganancias'
  const apiRoute = tipo === 'ART9' ? '/api/generar-amparo-art9' : '/api/generar-amparo-ganancias'

  const [jurisdiccion, setJurisdiccion] = useState<'san_rafael' | 'mendoza' | ''>(
    (datosPropuesta.jurisdiccion as 'san_rafael' | 'mendoza' | undefined) ?? ''
  )
  const [guardando,  setGuardando]  = useState(false)
  const [guardado,   setGuardado]   = useState(!!datosPropuesta.jurisdiccion)
  const [generando,  setGenerando]  = useState(false)
  const [error,      setError]      = useState('')

  async function guardarJurisdiccion() {
    if (!jurisdiccion) return
    setGuardando(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('tramites')
        .update({ datos_propuesta: { ...datosPropuesta, jurisdiccion } })
        .eq('id', tramiteId)
      if (err) { setError(err.message); return }
      setGuardado(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function descargar() {
    setGenerando(true)
    setError('')
    try {
      const res = await fetch(`${apiRoute}?tramiteId=${tramiteId}`)
      if (!res.ok) {
        const txt = await res.text()
        setError(txt || 'Error al generar el escrito.')
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const prefix = tipo === 'ART9' ? 'Amparo_Art9' : 'Amparo_Ganancias'
      a.href     = href
      a.download = `${prefix}_${tramiteId.slice(0, 8)}.docx`
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerando(false)
    }
  }

  const precioCliente = datosPropuesta.precio_cliente as number | undefined
  const incluyePct    = datosPropuesta.incluye_porcentaje === true

  function ars(n: unknown) {
    if (typeof n !== 'number') return '—'
    return '$ ' + Math.round(n).toLocaleString('es-AR')
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Generar escrito — {label}</p>

      {/* Resumen honorarios */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Honorario acordado</p>
          <p className="text-sm font-semibold text-slate-800">{ars(precioCliente)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">20% sobre recupero</p>
          <p className="text-sm font-semibold text-slate-800">{incluyePct ? 'Sí' : 'No'}</p>
        </div>
      </div>

      {/* Selector de jurisdicción */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3">Juzgado interviniente</p>
        <div className="flex flex-col gap-2 mb-3">
          {[
            { val: 'san_rafael', label: 'San Rafael — Juzgado Federal de San Rafael' },
            { val: 'mendoza',    label: 'Mendoza — Juzgado Federal Civil, Com. y Cont. Adm. N° 4' },
          ].map(opt => (
            <label key={opt.val} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name={`jurisdiccion-${tramiteId}`}
                value={opt.val}
                checked={jurisdiccion === opt.val}
                onChange={() => { setJurisdiccion(opt.val as 'san_rafael' | 'mendoza'); setGuardado(false) }}
                className="w-4 h-4 accent-foreground"
              />
              <span className="text-sm text-slate-700 group-hover:text-slate-900">{opt.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!jurisdiccion || guardando}
          onClick={guardarJurisdiccion}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 transition-colors"
        >
          {guardando ? 'Guardando…' : guardado ? '✓ Jurisdicción guardada' : 'Confirmar jurisdicción'}
        </button>
      </div>

      {/* Botón de generación */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">Escrito de inicio de amparo</p>
          <p className="text-xs text-slate-400 mt-0.5">
            DOCX listo para presentar en el juzgado federal correspondiente
          </p>
        </div>
        <button
          type="button"
          disabled={!guardado || generando}
          onClick={descargar}
          className="mt-auto flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 disabled:bg-foreground/40 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          {generando ? (
            <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generando...</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Descargar escrito (DOCX)</>
          )}
        </button>
        {!guardado && !generando && (
          <p className="text-xs text-amber-600">Primero confirmá la jurisdicción para habilitar la descarga.</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
