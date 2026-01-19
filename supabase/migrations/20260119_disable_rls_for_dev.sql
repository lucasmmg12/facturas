-- Migración para desactivar RLS temporalmente y permitir operaciones básicas
-- Esta migración hace las políticas más permisivas para desarrollo

-- ============================================================================
-- DESACTIVAR RLS EN TABLAS PRINCIPALES (SOLO PARA DESARROLLO)
-- ============================================================================

-- Opción 1: Desactivar RLS completamente (MÁS SIMPLE)
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS files DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tax_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoice_taxes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tango_concepts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoice_concepts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS export_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_log DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- NOTA IMPORTANTE
-- ============================================================================
-- Esta configuración es SOLO para desarrollo/testing
-- En producción, deberías:
-- 1. Mantener RLS habilitado
-- 2. Configurar políticas apropiadas
-- 3. Usar service_role key solo en backend
-- 
-- Para reactivar RLS en el futuro:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- (y así con todas las tablas)
