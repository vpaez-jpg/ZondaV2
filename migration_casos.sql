-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo de Gestión de Casos Libres
-- Ejecutar en el Editor SQL de Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla principal de casos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS casos (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id        UUID        NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,

  -- Datos del cliente (puede no tener portal todavía)
  cliente_nombre    TEXT        NOT NULL,
  cliente_email     TEXT,
  cliente_whatsapp  TEXT,
  cliente_id        UUID        REFERENCES perfiles(id) ON DELETE SET NULL,

  -- Datos del caso
  titulo            TEXT        NOT NULL,
  tipo_caso         TEXT        NOT NULL DEFAULT 'General',
  descripcion       TEXT,
  estado            TEXT        NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo', 'finalizado', 'archivado')),
  etapa_actual      INTEGER     NOT NULL DEFAULT 1,

  -- Invitación al portal
  invitation_token  UUID        DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Etapas personalizadas del caso (timeline) ────────────────────────────
CREATE TABLE IF NOT EXISTS caso_etapas (
  id                   UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id              UUID    NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  numero               INTEGER NOT NULL,
  titulo               TEXT    NOT NULL,
  descripcion_juridica TEXT,                 -- lenguaje técnico (visible al abogado)
  descripcion_cliente  TEXT,                 -- traducción amigable (visible al cliente)
  completada           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (caso_id, numero)
);

-- ── 3. Notas / actualizaciones con traducción IA ────────────────────────────
CREATE TABLE IF NOT EXISTS caso_notas (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id          UUID    NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  texto_juridico   TEXT    NOT NULL,         -- lo que escribe el abogado
  texto_cliente    TEXT,                     -- traducción generada por IA
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       UUID    REFERENCES perfiles(id)
);

-- ── 4. Trigger updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_casos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS casos_updated_at ON casos;
CREATE TRIGGER casos_updated_at
  BEFORE UPDATE ON casos
  FOR EACH ROW EXECUTE FUNCTION update_casos_updated_at();

-- ── 5. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_casos_partner_id       ON casos(partner_id);
CREATE INDEX IF NOT EXISTS idx_casos_cliente_id       ON casos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_casos_invitation_token ON casos(invitation_token);
CREATE INDEX IF NOT EXISTS idx_caso_etapas_caso_id    ON caso_etapas(caso_id);
CREATE INDEX IF NOT EXISTS idx_caso_notas_caso_id     ON caso_notas(caso_id);

-- ── 6. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE casos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE caso_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caso_notas  ENABLE ROW LEVEL SECURITY;

-- Partner: acceso total a sus casos
CREATE POLICY "partner_crud_casos" ON casos
  FOR ALL USING (partner_id = auth.uid());

-- Cliente: puede leer su propio caso
CREATE POLICY "cliente_read_caso" ON casos
  FOR SELECT USING (cliente_id = auth.uid());

-- Invitación pública (lectura por token — el token es el secret)
-- Nota: se accede via service_role desde el API route /api/invitacion/[token]

-- Partner: acceso total a etapas de sus casos
CREATE POLICY "partner_crud_caso_etapas" ON caso_etapas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM casos
      WHERE casos.id = caso_etapas.caso_id
        AND casos.partner_id = auth.uid()
    )
  );

-- Cliente: puede leer etapas de su caso
CREATE POLICY "cliente_read_caso_etapas" ON caso_etapas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM casos
      WHERE casos.id = caso_etapas.caso_id
        AND casos.cliente_id = auth.uid()
    )
  );

-- Partner: acceso total a notas de sus casos
CREATE POLICY "partner_crud_caso_notas" ON caso_notas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM casos
      WHERE casos.id = caso_notas.caso_id
        AND casos.partner_id = auth.uid()
    )
  );

-- Cliente: puede leer notas de su caso
CREATE POLICY "cliente_read_caso_notas" ON caso_notas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM casos
      WHERE casos.id = caso_notas.caso_id
        AND casos.cliente_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN DE MIGRACIÓN
-- Verificar ejecutando: SELECT * FROM casos LIMIT 1;
-- ═══════════════════════════════════════════════════════════════════════════
