-- ============================================================
-- Migración: integración Google Calendar — Zonda Legal
-- Correr en el SQL Editor de Supabase
-- ============================================================

-- Tabla para almacenar los tokens OAuth de Google por partner
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id         UUID PRIMARY KEY REFERENCES perfiles(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,                    -- puede ser NULL si ya teníamos uno
  token_expiry    TIMESTAMPTZ NOT NULL,    -- cuándo vence el access_token
  google_email    TEXT,                    -- email de la cuenta Google conectada
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: cada partner solo ve/edita su propio token
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_own_google_token" ON google_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger updated_at (reutiliza la función si ya existe)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_tokens_updated_at
  BEFORE UPDATE ON google_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tabla para trackear qué vencimientos de Zonda ya tienen evento en Google Calendar
-- (para no duplicar al sincronizar)
CREATE TABLE IF NOT EXISTS vencimientos_google (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  vencimiento_id  TEXT NOT NULL,           -- ID del vencimiento en localStorage
  google_event_id TEXT NOT NULL,           -- ID del evento en Google Calendar
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, vencimiento_id)
);

ALTER TABLE vencimientos_google ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_own_vencimientos_google" ON vencimientos_google
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
