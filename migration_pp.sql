-- ============================================================
-- ZONDA LEGAL — Migration PP (Políticas de Privacidad)
-- Agrega soporte para el servicio de redacción de
-- Políticas de Privacidad
-- ============================================================

-- Índice de búsqueda (reutilizable)
CREATE INDEX IF NOT EXISTS idx_tramites_tipo ON tramites(tipo);

-- ── workflow_etapas para PP ──────────────────────────────────
-- 4 etapas: propuesta enviada → cuestionario completado → en redacción → entregado
INSERT INTO workflow_etapas (tipo, numero, descripcion) VALUES
  ('PP', 1, 'Propuesta enviada — en espera del cuestionario del cliente'),
  ('PP', 2, 'Cuestionario completado — en proceso de redacción por Zonda'),
  ('PP', 3, 'Documento listo — en revisión final'),
  ('PP', 4, 'Políticas de Privacidad entregadas al cliente')
ON CONFLICT DO NOTHING;
