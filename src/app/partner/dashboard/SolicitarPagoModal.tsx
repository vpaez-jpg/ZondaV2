'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface ClienteOption {
  id:               string
  cliente_nombre:   string
  cliente_whatsapp: string | null
}

interface DatosBancarios {
  alias:   string | null
  cbu:     string | null
  banco:   string | null
  titular: string | null
}

interface CobroItem {
  id:               string
  cliente_nombre:   string
  cliente_whatsapp: string | null
  monto:            number
  concepto:         string
  medio_pago:       string
  estado:           string
  created_at:       string
}

type Paso = 'formulario' | 'historial'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPeso(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function SolicitarPagoModal({ nombrePartner }: { nombrePartner: string }) {
  const [open, setOpen] = useState(false)
  const [paso, setPaso] = useState<Paso>('formulario')

  // Campos del formulario
  const [clienteNombre,   setClienteNombre]   = useState('')
  const [clienteWhatsapp, setClienteWhatsapp] = useState('')
  const [monto,           setMonto]           = useState('')
  const [concepto,        setConcepto]        = useState('')
  const [medioPago, setMedioPago]             = useState<'transferencia' | 'link'>('transferencia')
  const [linkPago,  setLinkPago]              = useState('')

  // Datos bancarios
  const [datosBancarios,    setDatosBancarios]    = useState<DatosBancarios>({ alias: null, cbu: null, banco: null, titular: null })
  const [editandoBancos,    setEditandoBancos]    = useState(false)
  const [guardandoBancos,   setGuardandoBancos]   = useState(false)
  const [bancosForm,        setBancosForm]        = useState<DatosBancarios>({ alias: null, cbu: null, banco: null, titular: null })
  const noBancos = !datosBancarios.alias && !datosBancarios.cbu

  // Búsqueda de clientes
  const [clientes,       setClientes]       = useState<ClienteOption[]>([])
  const [busqueda,       setBusqueda]       = useState('')
  const [dropdownAbierto, setDropdownAbierto] = useState(false)
  const busquedaRef = useRef<HTMLInputElement>(null)

  // Historial de cobros
  const [cobros,        setCobros]        = useState<CobroItem[]>([])
  const [loadingCobros, setLoadingCobros] = useState(false)

  // Estado del envío
  const [enviando,   setEnviando]   = useState(false)
  const [enviado,    setEnviado]    = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')

  // ── Cargar datos al abrir ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [clientesRes, bancosRes, cobrosRes] = await Promise.all([
      fetch('/api/partner/clientes'),
      fetch('/api/partner/datos-bancarios'),
      fetch('/api/partner/cobros'),
    ])

    if (clientesRes.ok) setClientes(await clientesRes.json())

    if (bancosRes.ok) {
      const b: DatosBancarios = await bancosRes.json()
      setDatosBancarios(b)
      setBancosForm(b)
      // Si no tiene datos bancarios, abrir edición directamente
      if (!b.alias && !b.cbu) setEditandoBancos(true)
    }

    if (cobrosRes.ok) {
      setLoadingCobros(false)
      setCobros(await cobrosRes.json())
    }
  }, [])

  useEffect(() => {
    if (open) {
      setLoadingCobros(true)
      loadData()
    }
  }, [open, loadData])

  // ── Filtro de búsqueda ───────────────────────────────────────────────────────

  const clientesFiltrados = clientes.filter(c =>
    busqueda.length >= 2 &&
    c.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  function seleccionarCliente(c: ClienteOption) {
    setClienteNombre(c.cliente_nombre)
    setClienteWhatsapp(c.cliente_whatsapp ?? '')
    setBusqueda(c.cliente_nombre)
    setDropdownAbierto(false)
  }

  // ── Guardar datos bancarios ──────────────────────────────────────────────────

  async function guardarBancos() {
    setGuardandoBancos(true)
    try {
      const res = await fetch('/api/partner/datos-bancarios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bancosForm),
      })
      if (res.ok) {
        setDatosBancarios(bancosForm)
        setEditandoBancos(false)
      }
    } finally {
      setGuardandoBancos(false)
    }
  }

  // ── Generar mensaje de WhatsApp ──────────────────────────────────────────────

  function generarMensajeWA(): string {
    const montoFormateado = formatPeso(parseFloat(monto) || 0)
    const nombre = clienteNombre.split(' ')[0] || 'Cliente'

    if (medioPago === 'transferencia') {
      const bancoInfo = [
        datosBancarios.alias   ? `Alias: ${datosBancarios.alias}`   : '',
        datosBancarios.cbu     ? `CBU: ${datosBancarios.cbu}`       : '',
        datosBancarios.banco   ? `Banco: ${datosBancarios.banco}`   : '',
        datosBancarios.titular ? `Titular: ${datosBancarios.titular}` : '',
      ].filter(Boolean).join('\n')

      return `Hola ${nombre}, soy ${nombrePartner.split(' ')[0]}.

Te paso el detalle del pago:
Monto: ${montoFormateado}
Concepto: ${concepto}

Datos para transferir:
${bancoInfo}

Cuando hagas la transferencia, avisame. Gracias.`
    } else {
      return `Hola ${nombre}, soy ${nombrePartner.split(' ')[0]}.

Te paso el detalle del pago:
Monto: ${montoFormateado}
Concepto: ${concepto}

Link de pago: ${linkPago}

Cualquier consulta, avisame. Gracias.`
    }
  }

  // ── Enviar ───────────────────────────────────────────────────────────────────

  async function enviar() {
    setErrorEnvio('')
    if (!clienteNombre.trim())  return setErrorEnvio('Ingresá el nombre del cliente')
    if (!monto || parseFloat(monto) <= 0) return setErrorEnvio('Ingresá un monto válido')
    if (!concepto.trim())       return setErrorEnvio('Ingresá el concepto del pago')
    if (medioPago === 'link' && !linkPago.trim())
      return setErrorEnvio('Pegá el link de pago')
    if (medioPago === 'transferencia' && noBancos)
      return setErrorEnvio('Primero guardá tus datos bancarios')

    setEnviando(true)
    try {
      // 1. Guardar en DB
      const res = await fetch('/api/partner/cobros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_nombre:   clienteNombre.trim(),
          cliente_whatsapp: clienteWhatsapp.trim() || null,
          monto:            parseFloat(monto),
          concepto:         concepto.trim(),
          medio_pago:       medioPago,
          link_pago:        medioPago === 'link' ? linkPago.trim() : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setErrorEnvio(data.error ?? 'Error al guardar')
        return
      }

      // Actualizar historial local
      const nuevo = await res.json()
      setCobros(prev => [{
        id:               nuevo.id,
        cliente_nombre:   clienteNombre.trim(),
        cliente_whatsapp: clienteWhatsapp.trim() || null,
        monto:            parseFloat(monto),
        concepto:         concepto.trim(),
        medio_pago:       medioPago,
        estado:           'pendiente',
        created_at:       nuevo.created_at,
      }, ...prev])

      // 2. Abrir WhatsApp si tiene teléfono
      const tel = clienteWhatsapp.replace(/\D/g, '')
      const mensaje = generarMensajeWA()
      const waUrl = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`
        : `https://wa.me/?text=${encodeURIComponent(mensaje)}`
      window.open(waUrl, '_blank')

      setEnviado(true)
      // Reset form después de 2.5s
      setTimeout(() => {
        setEnviado(false)
        setClienteNombre('')
        setClienteWhatsapp('')
        setBusqueda('')
        setMonto('')
        setConcepto('')
        setLinkPago('')
        setMedioPago('transferencia')
      }, 2500)

    } finally {
      setEnviando(false)
    }
  }

  // ── Marcar cobrado ───────────────────────────────────────────────────────────

  async function toggleCobrado(cobro: CobroItem) {
    const nuevoEstado = cobro.estado === 'cobrado' ? 'pendiente' : 'cobrado'
    await fetch(`/api/partner/cobros/${cobro.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado }),
    })
    setCobros(prev => prev.map(c => c.id === cobro.id ? { ...c, estado: nuevoEstado } : c))
  }

  // ── Cerrar y resetear ────────────────────────────────────────────────────────

  function cerrar() {
    setOpen(false)
    setTimeout(() => {
      setPaso('formulario')
      setEnviado(false)
      setErrorEnvio('')
      setEditandoBancos(false)
    }, 300)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Botón trigger ── */}
      <button
        onClick={() => setOpen(true)}
        title="Solicitar pago"
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
        Cobrar
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-[1px] z-40"
          onClick={cerrar}
        />
      )}

      {/* ── Modal centrado ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">Solicitar pago</h2>
                {/* Tabs */}
                <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
                  {(['formulario', 'historial'] as Paso[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPaso(p)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
                        paso === p
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p === 'formulario' ? 'Nuevo' : `Historial${cobros.length > 0 ? ` (${cobros.length})` : ''}`}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={cerrar}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Contenido: Formulario nuevo ── */}
            {paso === 'formulario' && (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                {/* Estado enviado */}
                {enviado && (
                  <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                    <div className="text-4xl">✅</div>
                    <p className="text-sm font-semibold text-foreground">WhatsApp abierto</p>
                    <p className="text-xs text-muted-foreground">
                      El cobro quedó registrado. Revisá el historial para marcarlo como cobrado.
                    </p>
                  </div>
                )}

                {!enviado && (
                  <>
                    {/* Cliente */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Cliente</label>
                      <div className="relative">
                        <input
                          ref={busquedaRef}
                          type="text"
                          value={busqueda}
                          onChange={e => {
                            setBusqueda(e.target.value)
                            setClienteNombre(e.target.value)
                            setDropdownAbierto(true)
                          }}
                          onFocus={() => setDropdownAbierto(true)}
                          onBlur={() => setTimeout(() => setDropdownAbierto(false), 150)}
                          placeholder="Buscá o escribí un nuevo cliente"
                          className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        />
                        {dropdownAbierto && clientesFiltrados.length > 0 && (
                          <div className="absolute top-full mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                            {clientesFiltrados.map(c => (
                              <button
                                key={c.id}
                                onMouseDown={() => seleccionarCliente(c)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 text-left transition-colors"
                              >
                                <span className="text-xs font-medium text-foreground flex-1">{c.cliente_nombre}</span>
                                {c.cliente_whatsapp && (
                                  <span className="text-xs text-muted-foreground">{c.cliente_whatsapp}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Teléfono */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">WhatsApp del cliente</label>
                      <input
                        type="tel"
                        value={clienteWhatsapp}
                        onChange={e => setClienteWhatsapp(e.target.value)}
                        placeholder="ej: 11 1234-5678"
                        className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                      />
                    </div>

                    {/* Monto y concepto en fila */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Monto ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={monto}
                          onChange={e => setMonto(e.target.value)}
                          placeholder="0"
                          className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Concepto</label>
                        <input
                          type="text"
                          value={concepto}
                          onChange={e => setConcepto(e.target.value)}
                          placeholder="ej: Honorarios mayo"
                          className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        />
                      </div>
                    </div>

                    {/* Medio de pago */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Medio de pago</label>
                      <div className="flex gap-2">
                        {(['transferencia', 'link'] as const).map(mp => (
                          <button
                            key={mp}
                            onClick={() => setMedioPago(mp)}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                              medioPago === mp
                                ? 'bg-foreground text-primary-foreground border-foreground'
                                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                            }`}
                          >
                            {mp === 'transferencia' ? '🏦 Transferencia' : '🔗 Link de pago'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Sección transferencia ── */}
                    {medioPago === 'transferencia' && (
                      <div className="bg-muted/40 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">Datos para transferir</p>
                          <button
                            onClick={() => {
                              setBancosForm(datosBancarios)
                              setEditandoBancos(e => !e)
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                          >
                            {editandoBancos ? 'Cancelar' : '✏️ Editar'}
                          </button>
                        </div>

                        {!editandoBancos ? (
                          noBancos ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              ⚠ No cargaste tus datos bancarios todavía. Hacé click en "Editar".
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {datosBancarios.alias   && <p className="text-xs text-foreground">🔑 <span className="font-medium">Alias:</span> {datosBancarios.alias}</p>}
                              {datosBancarios.cbu     && <p className="text-xs text-foreground">🏦 <span className="font-medium">CBU:</span> {datosBancarios.cbu}</p>}
                              {datosBancarios.banco   && <p className="text-xs text-muted-foreground">Banco: {datosBancarios.banco}</p>}
                              {datosBancarios.titular && <p className="text-xs text-muted-foreground">Titular: {datosBancarios.titular}</p>}
                            </div>
                          )
                        ) : (
                          <div className="space-y-2">
                            {[
                              { key: 'alias'  as keyof DatosBancarios, label: 'Alias', placeholder: 'zonda.legal' },
                              { key: 'cbu'    as keyof DatosBancarios, label: 'CBU',   placeholder: '000000000000000' },
                              { key: 'banco'  as keyof DatosBancarios, label: 'Banco', placeholder: 'Galicia' },
                              { key: 'titular' as keyof DatosBancarios, label: 'Titular', placeholder: 'Juan García' },
                            ].map(({ key, label, placeholder }) => (
                              <div key={key} className="flex items-center gap-2">
                                <label className="text-xs text-muted-foreground w-14 shrink-0">{label}</label>
                                <input
                                  type="text"
                                  value={bancosForm[key] ?? ''}
                                  onChange={e => setBancosForm(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={placeholder}
                                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                                />
                              </div>
                            ))}
                            <button
                              onClick={guardarBancos}
                              disabled={guardandoBancos}
                              className="w-full text-xs font-medium py-2 rounded-lg bg-foreground text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 mt-1"
                            >
                              {guardandoBancos ? 'Guardando...' : 'Guardar datos bancarios'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Sección link ── */}
                    {medioPago === 'link' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Link de pago</label>
                        <input
                          type="url"
                          value={linkPago}
                          onChange={e => setLinkPago(e.target.value)}
                          placeholder="https://mpago.la/..."
                          className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        />
                        <p className="text-xs text-muted-foreground">
                          Creá el link en tu proveedor (MercadoPago, Ualá, etc.) y pegalo acá.
                        </p>
                      </div>
                    )}

                    {/* Preview mensaje */}
                    {clienteNombre && monto && concepto && (
                      <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Vista previa del mensaje WhatsApp
                        </p>
                        <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">
                          {generarMensajeWA()}
                        </p>
                      </div>
                    )}

                    {errorEnvio && (
                      <p className="text-xs text-red-500 font-medium">{errorEnvio}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Contenido: Historial ── */}
            {paso === 'historial' && (
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loadingCobros && (
                  <p className="text-xs text-muted-foreground animate-pulse text-center py-8">Cargando historial...</p>
                )}
                {!loadingCobros && cobros.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-sm text-muted-foreground">No hay cobros registrados todavía.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {cobros.map(cobro => (
                    <div
                      key={cobro.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        cobro.estado === 'cobrado'
                          ? 'border-border bg-muted/20 opacity-60'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-semibold text-foreground">{formatPeso(cobro.monto)}</p>
                          <p className="text-xs text-muted-foreground truncate">{cobro.concepto}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {cobro.cliente_nombre}
                          {' · '}
                          {cobro.medio_pago === 'transferencia' ? '🏦' : '🔗'}
                          {' · '}
                          {formatFecha(cobro.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleCobrado(cobro)}
                        title={cobro.estado === 'cobrado' ? 'Marcar como pendiente' : 'Marcar como cobrado'}
                        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border text-xs transition-all ${
                          cobro.estado === 'cobrado'
                            ? 'bg-foreground text-primary-foreground border-foreground'
                            : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                        }`}
                      >
                        {cobro.estado === 'cobrado' ? '✓' : '○'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer con botón enviar (solo en formulario, no en enviado) */}
            {paso === 'formulario' && !enviado && (
              <div className="px-5 py-4 border-t border-border shrink-0">
                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-foreground text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {enviando ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/>
                        <path d="M4 12a8 8 0 018-8V0" stroke="currentColor" strokeWidth="3" className="opacity-75"/>
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                      </svg>
                      Enviar por WhatsApp
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
