/*
  # Simplificar Sistema de Roles - Todos los Usuarios con Acceso Completo
  
  ## Cambios
  
  1. Modificar políticas RLS para dar acceso completo a todos los usuarios autenticados
  2. Mantener el campo role en la tabla users solo para referencia
  3. Eliminar restricciones basadas en roles específicos
  
  ## Resultado
  
  Todos los usuarios autenticados pueden:
  - Cargar comprobantes
  - Revisar y editar comprobantes
  - Gestionar proveedores
  - Gestionar conceptos
  - Generar exportaciones
*/

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: SUPPLIERS
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage suppliers" ON suppliers;

CREATE POLICY "All authenticated users can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: INVOICES
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can update invoices" ON invoices;

CREATE POLICY "All authenticated users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: INVOICE_TAXES
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage invoice taxes" ON invoice_taxes;

CREATE POLICY "All authenticated users can manage invoice taxes"
  ON invoice_taxes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: TANGO_CONCEPTS
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage tango concepts" ON tango_concepts;

CREATE POLICY "All authenticated users can manage tango concepts"
  ON tango_concepts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: INVOICE_CONCEPTS
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage invoice concepts" ON invoice_concepts;

CREATE POLICY "All authenticated users can manage invoice concepts"
  ON invoice_concepts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: TAX_CODES
-- ============================================================================

DROP POLICY IF EXISTS "Users with EXPORTACION can manage tax codes" ON tax_codes;

CREATE POLICY "All authenticated users can manage tax codes"
  ON tax_codes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: EXPORT_BATCHES
-- ============================================================================

DROP POLICY IF EXISTS "Users with EXPORTACION can create export batches" ON export_batches;

CREATE POLICY "All authenticated users can create export batches"
  ON export_batches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: AUDIT_LOG
-- ============================================================================

DROP POLICY IF EXISTS "Users with EXPORTACION can view all audit logs" ON audit_log;

CREATE POLICY "All authenticated users can view all audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);