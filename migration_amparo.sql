-- Migración: workflow_etapas para servicios de amparo judicial
-- Ejecutar en Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_tramites_tipo ON tramites(tipo);

INSERT INTO workflow_etapas (tipo, numero, descripcion) VALUES
  ('ART9',      1, 'Propuesta enviada — en espera de documentación del cliente'),
  ('ART9',      2, 'Documentación recibida — en proceso de redacción del escrito'),
  ('ART9',      3, 'Escrito listo — en revisión final'),
  ('ART9',      4, 'Escrito de inicio entregado al cliente'),
  ('GANANCIAS', 1, 'Propuesta enviada — en espera de documentación del cliente'),
  ('GANANCIAS', 2, 'Documentación recibida — en proceso de redacción del escrito'),
  ('GANANCIAS', 3, 'Escrito listo — en revisión final'),
  ('GANANCIAS', 4, 'Escrito de inicio entregado al cliente')
ON CONFLICT DO NOTHING;
