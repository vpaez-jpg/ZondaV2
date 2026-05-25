-- ============================================================
-- Migración: tabla cobros — Gestor de Cobros de Zonda Legal
-- Correr en el SQL Editor de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS cobros (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,

  -- Clasificación
  tipo                      TEXT NOT NULL CHECK (tipo IN ('directo', 'litigio')),
  concepto                  TEXT NOT NULL,

  -- Cliente (referencia interna o nombre libre)
  cliente_id                UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  cliente_nombre            TEXT,

  -- Monto base
  moneda                    TEXT NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),
  monto_total               NUMERIC(15, 2) NOT NULL CHECK (monto_total >= 0),

  -- Pago en cuotas (tipo = 'directo')
  forma_pago                TEXT CHECK (forma_pago IN ('unico', 'cuotas')),
  num_cuotas                INTEGER CHECK (num_cuotas > 0),
  monto_cuota               NUMERIC(15, 2),
  con_interes               BOOLEAN NOT NULL DEFAULT FALSE,
  tasa_interes              NUMERIC(6, 4),          -- % mensual, ej: 3.5
  cuotas_pagadas            INTEGER NOT NULL DEFAULT 0,

  -- Estado de cobro
  estado                    TEXT NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'parcial', 'cobrado', 'cancelado')),
  monto_cobrado             NUMERIC(15, 2) NOT NULL DEFAULT 0,
  fecha_vencimiento         DATE,

  -- Campos exclusivos de litigio (tipo = 'litigio')
  parte_contraria           TEXT,
  monto_litigio             NUMERIC(15, 2),          -- valor total en disputa
  porcentaje_acordado       NUMERIC(5, 2),           -- 0-100
  expectativa_cobro         NUMERIC(15, 2),          -- calculado: monto_litigio * porcentaje / 100
  probabilidad              TEXT CHECK (probabilidad IN ('alta', 'media', 'baja')),
  etapa_litigio             TEXT,
  fecha_estimada_resolucion DATE,

  -- General
  notas                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS cobros_partner_id_idx ON cobros (partner_id);
CREATE INDEX IF NOT EXISTS cobros_tipo_idx        ON cobros (tipo);
CREATE INDEX IF NOT EXISTS cobros_estado_idx      ON cobros (estado);

-- Row Level Security
ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_own_cobros" ON cobros
  FOR ALL
  USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cobros_updated_at
  BEFORE UPDATE ON cobros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
