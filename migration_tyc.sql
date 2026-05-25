-- ============================================================
-- ZONDA LEGAL — Migration TYC
-- Agrega soporte para el servicio de redacción de
-- Términos y Condiciones / Términos de Servicio
-- ============================================================

-- Índice de búsqueda (reutilizable si idx_tramites_tipo ya existe del NDA)
CREATE INDEX IF NOT EXISTS idx_tramites_tipo ON tramites(tipo);

-- ── workflow_etapas para TYC ─────────────────────────────────
-- 4 etapas: propuesta enviada → cuestionario completado → en redacción → entregado
INSERT INTO workflow_etapas (tipo, numero, descripcion) VALUES
  ('TYC', 1, 'Propuesta enviada — en espera del cuestionario del cliente'),
  ('TYC', 2, 'Cuestionario completado — en proceso de redacción por Zonda'),
  ('TYC', 3, 'Documento listo — en revisión final'),
  ('TYC', 4, 'Términos y Condiciones entregados al cliente')
ON CONFLICT DO NOTHING;
