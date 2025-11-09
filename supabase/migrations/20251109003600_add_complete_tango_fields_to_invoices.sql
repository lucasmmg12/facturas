/*
  # Add Complete Tango Export Fields to Invoices Table

  ## Overview
  This migration adds all required fields for complete Tango Gestión export compatibility.
  These fields match the 27-column template required by Tango for invoice import.

  ## New Columns Added

  ### Transaction Details
  - `currency_code` (text): Moneda CTE - Currency code (e.g., 'ARS', 'USD')
  - `exchange_rate` (numeric): Cotización - Exchange rate for foreign currency
  - `purchase_condition` (text): Condición de compra - Payment terms/conditions

  ### Additional Amounts
  - `advance_payment` (numeric): Anticipo o seña - Down payment or deposit amount
  - `discount` (numeric): Bonificación - Discount amount
  - `freight` (numeric): Flete - Shipping/freight charges
  - `interest` (numeric): Intereses - Interest charges

  ### Electronic Invoice Data
  - `is_electronic` (boolean): Es factura electrónica - Electronic invoice flag
  - `cai_cae` (text): CAI / CAE - Electronic authorization code
  - `cai_cae_expiration` (date): Fecha de vencimiento del CAI / CAE - Authorization expiration date
  - `non_computable_tax_credit` (numeric): Crédito fiscal no computable - Non-deductible tax credit

  ### Classification Codes
  - `expense_code` (text): Código de gasto - Expense classification code
  - `sector_code` (text): Código de sector - Business sector code
  - `classifier_code` (text): Código de clasificador - General classifier code
  - `afip_operation_type_code` (text): Código de tipo de operación AFIP - AFIP operation type
  - `afip_voucher_code` (text): Código de comprobante AFIP - AFIP voucher code

  ### Other Information
  - `destination_branch_number` (text): Nro. de sucursal destino - Destination branch number
  - `observations` (text): Observaciones - Additional observations/notes

  ## Notes
  - All new fields are nullable for backward compatibility with existing records
  - Default values are set where appropriate (e.g., currency_code defaults to 'ARS')
  - Numeric fields for amounts default to 0
  - Boolean fields default to false
*/

-- Add currency and exchange information
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'currency_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN currency_code text DEFAULT 'ARS';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'exchange_rate'
  ) THEN
    ALTER TABLE invoices ADD COLUMN exchange_rate numeric(15,6) DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'purchase_condition'
  ) THEN
    ALTER TABLE invoices ADD COLUMN purchase_condition text;
  END IF;
END $$;

-- Add additional amount fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'advance_payment'
  ) THEN
    ALTER TABLE invoices ADD COLUMN advance_payment numeric(15,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'discount'
  ) THEN
    ALTER TABLE invoices ADD COLUMN discount numeric(15,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'freight'
  ) THEN
    ALTER TABLE invoices ADD COLUMN freight numeric(15,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'interest'
  ) THEN
    ALTER TABLE invoices ADD COLUMN interest numeric(15,2) DEFAULT 0;
  END IF;
END $$;

-- Add electronic invoice fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'is_electronic'
  ) THEN
    ALTER TABLE invoices ADD COLUMN is_electronic boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'cai_cae'
  ) THEN
    ALTER TABLE invoices ADD COLUMN cai_cae text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'cai_cae_expiration'
  ) THEN
    ALTER TABLE invoices ADD COLUMN cai_cae_expiration date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'non_computable_tax_credit'
  ) THEN
    ALTER TABLE invoices ADD COLUMN non_computable_tax_credit numeric(15,2) DEFAULT 0;
  END IF;
END $$;

-- Add classification code fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'expense_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN expense_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'sector_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN sector_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'classifier_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN classifier_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'afip_operation_type_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN afip_operation_type_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'afip_voucher_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN afip_voucher_code text;
  END IF;
END $$;

-- Add other information fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'destination_branch_number'
  ) THEN
    ALTER TABLE invoices ADD COLUMN destination_branch_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'observations'
  ) THEN
    ALTER TABLE invoices ADD COLUMN observations text;
  END IF;
END $$;

-- Add index for electronic invoices
CREATE INDEX IF NOT EXISTS idx_invoices_is_electronic ON invoices(is_electronic);

-- Add comment to table documenting the complete field set
COMMENT ON TABLE invoices IS 'Complete invoice records with all 27 Tango Gestión export fields';
