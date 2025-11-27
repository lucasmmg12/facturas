/*
  # Cambiar internal_invoice_id a numérico
  
  ## Problema
  El internal_invoice_id actualmente se genera como texto con formato 'INV-YYYYMMDD-XXXXXXXX',
  pero debe ser numérico para cumplir con los requisitos de Tango.
  
  ## Solución
  1. Crear una secuencia para generar números únicos
  2. Modificar la función de generación para usar números secuenciales
  3. Actualizar los registros existentes (opcional, solo si es necesario)
*/

-- ============================================================================
-- CREAR SECUENCIA PARA ID NUMÉRICO
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS invoice_id_sequence
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- ============================================================================
-- ACTUALIZAR FUNCIÓN DE GENERACIÓN
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_internal_invoice_id()
RETURNS text AS $$
DECLARE
  next_id bigint;
BEGIN
  -- Obtener el siguiente número de la secuencia
  next_id := nextval('invoice_id_sequence');
  
  -- Retornar como texto numérico (sin prefijos ni guiones)
  RETURN next_id::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ACTUALIZAR REGISTROS EXISTENTES (OPCIONAL)
-- ============================================================================
-- Si hay registros existentes con IDs no numéricos, podemos actualizarlos
-- Descomentar si es necesario:

-- DO $$
-- DECLARE
--   rec record;
--   new_id bigint;
-- BEGIN
--   FOR rec IN 
--     SELECT id, internal_invoice_id 
--     FROM invoices 
--     WHERE internal_invoice_id !~ '^[0-9]+$'
--   LOOP
--     new_id := nextval('invoice_id_sequence');
--     UPDATE invoices 
--     SET internal_invoice_id = new_id::text 
--     WHERE id = rec.id;
--   END LOOP;
-- END $$;

