-- ============================================================
-- Migración: agrega columna "area" a la tabla cobros
-- Correr en el SQL Editor de Supabase (después de migration.sql)
-- ============================================================

ALTER TABLE cobros ADD COLUMN IF NOT EXISTS area TEXT;
