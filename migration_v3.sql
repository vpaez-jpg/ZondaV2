-- ============================================================
-- migration_v3.sql — Datos bancarios del partner + Cobros solicitados
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ── 1. Datos bancarios del partner ──────────────────────────────────────────
-- Guarda los datos para recibir transferencias. Un registro por partner.

CREATE TABLE IF NOT EXISTS partner_datos_bancarios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  alias      text,
  cbu        text,
  banco      text,
  titular    text,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (partner_id)
);

ALTER TABLE partner_datos_bancarios ENABLE ROW LEVEL SECURITY;

-- Solo el partner dueño puede leer y modificar sus datos
CREATE POLICY "partner_datos_bancarios_self"
  ON partner_datos_bancarios
  USING     (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());


-- ── 2. Cobros solicitados ────────────────────────────────────────────────────
-- Historial de solicitudes de pago enviadas a clientes.

CREATE TABLE IF NOT EXISTS cobros_solicitados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  cliente_nombre   text NOT NULL,
  cliente_whatsapp text,
  monto            numeric(12, 2) NOT NULL CHECK (monto > 0),
  concepto         text NOT NULL,
  medio_pago       text NOT NULL CHECK (medio_pago IN ('transferencia', 'link')),
  link_pago        text,                -- solo cuando medio_pago = 'link'
  estado           text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'cobrado')),
  created_at       timestamp with time zone DEFAULT now()
);

ALTER TABLE cobros_solicitados ENABLE ROW LEVEL SECURITY;

-- Solo el partner dueño puede ver y crear sus cobros
CREATE POLICY "cobros_solicitados_self"
  ON cobros_solicitados
  USING     (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());


-- ── 3. Índices de performance ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cobros_partner_id
  ON cobros_solicitados (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_datos_bancarios_partner_id
  ON partner_datos_bancarios (partner_id);
