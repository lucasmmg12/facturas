/*
  # Aislar Datos por Usuario - Sesiones Individuales
  
  ## Problema
  Las políticas RLS actuales permiten que todos los usuarios vean todos los datos.
  Esto no es seguro y viola la privacidad de los usuarios.
  
  ## Solución
  Modificar las políticas RLS para que cada usuario solo pueda ver y gestionar
  sus propios datos basándose en el campo created_by o user_id.
  
  ## Cambios
  1. INVOICES: Solo ver facturas creadas por el usuario
  2. FILES: Solo ver archivos subidos por el usuario
  3. AUDIT_LOG: Solo ver logs del usuario
  4. EXPORT_BATCHES: Solo ver exportaciones del usuario
*/

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: INVOICES
-- ============================================================================

-- Eliminar política que permite ver todas las facturas
DROP POLICY IF EXISTS "Users can view all invoices" ON invoices;

-- Nueva política: Solo ver facturas propias
CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = invoices.created_by
    )
  );

-- Actualizar política de INSERT para asegurar que created_by sea del usuario actual
DROP POLICY IF EXISTS "Users with CARGA role can create invoices" ON invoices;

CREATE POLICY "Users can create own invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = invoices.created_by
    )
  );

-- Actualizar política de UPDATE: Solo actualizar facturas propias
DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can update invoices" ON invoices;

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = invoices.created_by
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = invoices.created_by
    )
  );

-- Actualizar política de DELETE: Solo eliminar facturas propias
DROP POLICY IF EXISTS "All authenticated users can delete invoices" ON invoices;

CREATE POLICY "Users can delete own invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = invoices.created_by
    )
  );

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: FILES
-- ============================================================================

-- Eliminar política que permite ver todos los archivos
DROP POLICY IF EXISTS "Users can view all files" ON files;

-- Nueva política: Solo ver archivos propios
CREATE POLICY "Users can view own files"
  ON files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = files.uploaded_by
    )
  );

-- La política de INSERT ya está correcta (solo permite subir archivos propios)

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: AUDIT_LOG
-- ============================================================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_log;
DROP POLICY IF EXISTS "Users with EXPORTACION can view all audit logs" ON audit_log;

-- Nueva política: Solo ver logs propios
CREATE POLICY "Users can view own audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = audit_log.user_id
    )
  );

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: EXPORT_BATCHES
-- ============================================================================

-- Eliminar política que permite ver todas las exportaciones
DROP POLICY IF EXISTS "Users can view all export batches" ON export_batches;

-- Nueva política: Solo ver exportaciones propias
CREATE POLICY "Users can view own export batches"
  ON export_batches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = export_batches.generated_by
    )
  );

-- Actualizar política de INSERT
DROP POLICY IF EXISTS "Users with EXPORTACION can create export batches" ON export_batches;

CREATE POLICY "Users can create own export batches"
  ON export_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = export_batches.generated_by
    )
  );

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: INVOICE_TAXES
-- ============================================================================

-- Las facturas de impuestos están relacionadas con invoices, así que heredan
-- la seguridad de las facturas. Pero asegurémonos de que solo se puedan ver
-- impuestos de facturas propias.

DROP POLICY IF EXISTS "All authenticated users can manage invoice taxes" ON invoice_taxes;

CREATE POLICY "Users can manage own invoice taxes"
  ON invoice_taxes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN users ON users.id = invoices.created_by
      WHERE users.auth_user_id = auth.uid()
      AND invoices.id = invoice_taxes.invoice_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN users ON users.id = invoices.created_by
      WHERE users.auth_user_id = auth.uid()
      AND invoices.id = invoice_taxes.invoice_id
    )
  );

-- ============================================================================
-- ACTUALIZAR POLÍTICAS: INVOICE_CONCEPTS
-- ============================================================================

-- Similar a invoice_taxes, solo conceptos de facturas propias

DROP POLICY IF EXISTS "All authenticated users can manage invoice concepts" ON invoice_concepts;

CREATE POLICY "Users can manage own invoice concepts"
  ON invoice_concepts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN users ON users.id = invoices.created_by
      WHERE users.auth_user_id = auth.uid()
      AND invoices.id = invoice_concepts.invoice_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN users ON users.id = invoices.created_by
      WHERE users.auth_user_id = auth.uid()
      AND invoices.id = invoice_concepts.invoice_id
    )
  );

