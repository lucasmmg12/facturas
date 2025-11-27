/*
  # Agregar Política DELETE para Comprobantes
  
  ## Problema
  La tabla invoices tenía políticas RLS para SELECT, INSERT y UPDATE, pero faltaba
  la política para DELETE, lo que impedía eliminar comprobantes.
  
  ## Solución
  Agregar política que permita a todos los usuarios autenticados eliminar comprobantes.
*/

-- ============================================================================
-- AGREGAR POLÍTICA DELETE: INVOICES
-- ============================================================================

CREATE POLICY "All authenticated users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

