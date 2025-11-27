-- Actualizar códigos de impuestos a valores numéricos según requerimientos
-- IVA_21 → 1
-- IVA_10_5 → 2
-- PERC_IVA → 10
-- PERC_IIBB → 52

UPDATE tax_codes SET code = '1' WHERE code = 'IVA_21';
UPDATE tax_codes SET code = '2' WHERE code = 'IVA_10_5';
UPDATE tax_codes SET code = '10' WHERE code = 'PERC_IVA';
UPDATE tax_codes SET code = '52' WHERE code = 'PERC_IIBB';

-- Nota: Los demás códigos (IVA_27, IVA_5, IVA_2_5, EXENTO, NO_GRAVADO, PERC_GANANCIAS, OTRO)
-- se mantienen con sus valores actuales hasta que se especifiquen nuevos códigos numéricos

