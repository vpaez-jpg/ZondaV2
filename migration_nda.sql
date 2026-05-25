-- ============================================================
-- ZONDA LEGAL — Migration NDA
-- Agrega soporte para el servicio de redacción de NDAs
-- (Acuerdos de Confidencialidad / Convenios de No Divulgación)
-- ============================================================

-- Si el campo "tipo" en la tabla tramites tiene una restricción CHECK,
-- la siguiente instrucción la elimina para agregar 'NDA' como valor válido.
-- Si no existe la restricción, este bloque termina sin hacer nada.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'tramites'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%tipo%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE tramites DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Agregar nueva restricción que incluye NDA
-- (Si tipo ya es text libre sin CHECK, esta línea no es estrictamente necesaria,
--  pero la documentamos para dejar claro los valores válidos)
-- ALTER TABLE tramites
--   ADD CONSTRAINT tramites_tipo_check
--   CHECK (tipo IN ('MARCAS', 'DNDA', 'SAS', 'NDA'));

-- Índice de búsqueda eficiente para NDA tramites en el backoffice
CREATE INDEX IF NOT EXISTS idx_tramites_tipo ON tramites(tipo);

-- ── workflow_etapas para NDA ─────────────────────────────────
-- 4 etapas: propuesta enviada → cuestionario completado → en redacción → entregado
INSERT INTO workflow_etapas (tipo, numero, descripcion) VALUES
  ('NDA', 1, 'Propuesta enviada — en espera del cuestionario del cliente'),
  ('NDA', 2, 'Cuestionario completado — en proceso de redacción por Zonda'),
  ('NDA', 3, 'Documento listo — en revisión final'),
  ('NDA', 4, 'NDA entregado al cliente')
ON CONFLICT DO NOTHING;
