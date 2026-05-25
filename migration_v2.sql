-- ============================================================
-- ZONDA LEGAL v2 — Migration v2
-- Tablas: caso_documentos, caso_mensajes, intake_forms, intake_respuestas
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. CASO_DOCUMENTOS
--    Archivos adjuntos a un caso (subidos por partner o cliente)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS caso_documentos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id      uuid NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  descripcion  text,
  url          text NOT NULL,        -- URL pública del archivo (Supabase Storage o externa)
  storage_path text,                 -- path interno en Supabase Storage (para eliminar)
  tipo_mime    text,
  tamanio      bigint,               -- bytes
  subido_por   uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  rol_subidor  text NOT NULL DEFAULT 'partner', -- 'partner' | 'cliente'
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE caso_documentos ENABLE ROW LEVEL SECURITY;

-- Partner puede ver y subir docs de sus casos
CREATE POLICY "partner_caso_documentos_select" ON caso_documentos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.partner_id = auth.uid()
    )
  );

CREATE POLICY "partner_caso_documentos_insert" ON caso_documentos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.partner_id = auth.uid()
    )
  );

CREATE POLICY "partner_caso_documentos_delete" ON caso_documentos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.partner_id = auth.uid()
    )
  );

-- Cliente puede ver docs de su propio caso (y subir los suyos)
CREATE POLICY "cliente_caso_documentos_select" ON caso_documentos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.cliente_id = auth.uid()
    )
  );

CREATE POLICY "cliente_caso_documentos_insert" ON caso_documentos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.cliente_id = auth.uid()
    )
    AND rol_subidor = 'cliente'
  );

-- ──────────────────────────────────────────────────────────────
-- 2. CASO_MENSAJES
--    Chat entre partner y cliente dentro de un caso
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS caso_mensajes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id    uuid NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  autor_id   uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  autor_rol  text NOT NULL,          -- 'partner' | 'cliente'
  texto      text NOT NULL,
  leido      boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE caso_mensajes ENABLE ROW LEVEL SECURITY;

-- Partner puede leer/escribir mensajes de sus casos
CREATE POLICY "partner_caso_mensajes_select" ON caso_mensajes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.partner_id = auth.uid()
    )
  );

CREATE POLICY "partner_caso_mensajes_insert" ON caso_mensajes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.partner_id = auth.uid()
    )
    AND autor_id = auth.uid()
    AND autor_rol = 'partner'
  );

-- Partner puede marcar mensajes del cliente como leídos
CREATE POLICY "partner_caso_mensajes_update" ON caso_mensajes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.partner_id = auth.uid()
    )
  );

-- Cliente puede leer/escribir mensajes de su caso
CREATE POLICY "cliente_caso_mensajes_select" ON caso_mensajes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.cliente_id = auth.uid()
    )
  );

CREATE POLICY "cliente_caso_mensajes_insert" ON caso_mensajes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.cliente_id = auth.uid()
    )
    AND autor_id = auth.uid()
    AND autor_rol = 'cliente'
  );

-- Cliente puede marcar mensajes del partner como leídos
CREATE POLICY "cliente_caso_mensajes_update" ON caso_mensajes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM casos c
      WHERE c.id = caso_id AND c.cliente_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 3. INTAKE_FORMS
--    Formularios de captación generados por IA desde el asistente
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_forms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  token             text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(20), 'hex'),
  titulo            text NOT NULL DEFAULT 'Formulario de datos',
  descripcion       text,            -- contexto del caso para mostrar al cliente
  campos            jsonb NOT NULL,  -- [{ id, tipo, etiqueta, requerido, opciones?, acepta_archivo? }]
  cliente_nombre    text,
  cliente_whatsapp  text,
  cliente_email     text,
  estado            text NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'completado'
  caso_id           uuid REFERENCES casos(id) ON DELETE SET NULL,  -- si aplica
  created_at        timestamptz NOT NULL DEFAULT now(),
  completado_at     timestamptz
);

ALTER TABLE intake_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_intake_forms_all" ON intake_forms
  FOR ALL USING (partner_id = auth.uid());

-- Acceso público por token (sin autenticación)
CREATE POLICY "public_intake_forms_select" ON intake_forms
  FOR SELECT USING (true);  -- la seguridad la da el token opaco

-- ──────────────────────────────────────────────────────────────
-- 4. INTAKE_RESPUESTAS
--    Respuestas del cliente al formulario de intake
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_respuestas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     uuid NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  respuestas  jsonb NOT NULL,  -- { campo_id: valor }
  archivos    jsonb,           -- [{ campo_id, nombre, url, storage_path, tipo_mime, tamanio }]
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intake_respuestas ENABLE ROW LEVEL SECURITY;

-- Solo el partner propietario puede ver las respuestas
CREATE POLICY "partner_intake_respuestas_select" ON intake_respuestas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM intake_forms f
      WHERE f.id = form_id AND f.partner_id = auth.uid()
    )
  );

-- Inserción pública (cliente que completa el form, sin estar logueado)
CREATE POLICY "public_intake_respuestas_insert" ON intake_respuestas
  FOR INSERT WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 5. ÍNDICES
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_caso_documentos_caso_id ON caso_documentos(caso_id);
CREATE INDEX IF NOT EXISTS idx_caso_mensajes_caso_id   ON caso_mensajes(caso_id);
CREATE INDEX IF NOT EXISTS idx_caso_mensajes_autor_id  ON caso_mensajes(autor_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_partner_id ON intake_forms(partner_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_token      ON intake_forms(token);
CREATE INDEX IF NOT EXISTS idx_intake_respuestas_form  ON intake_respuestas(form_id);

-- ──────────────────────────────────────────────────────────────
-- 6. SUPABASE STORAGE — instrucciones
-- ──────────────────────────────────────────────────────────────
-- En el panel de Supabase → Storage → New bucket:
--
--   Bucket: "caso-docs"
--   Public: NO (privado, acceso por URL firmada)
--
--   Bucket: "intake-archivos"
--   Public: SÍ (los clientes suben sin estar logueados)
--
-- Policies para "caso-docs":
--   - Partners: INSERT/SELECT en path {partner_id}/*
--   - Clientes: INSERT en path {caso_id}/cliente/*, SELECT en {caso_id}/*
--
-- Por ahora las URLs de documentos pueden ser públicas temporales (signedUrl)
-- generadas desde el backend al momento de mostrarlas.
-- ──────────────────────────────────────────────────────────────
