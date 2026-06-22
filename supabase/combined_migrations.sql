/*
  # Sistema de GestiÃ³n de Comprobantes para Tango
  
  ## DescripciÃ³n General
  Sistema completo para automatizar la carga, procesamiento, revisiÃ³n y exportaciÃ³n de 
  comprobantes de compra con destino a Tango GestiÃ³n.
  
  ## 1. Tablas Principales
  
  ### users
  - GestiÃ³n de usuarios con roles (CARGA, REVISION, EXPORTACION)
  - Campos: id, email, full_name, role, active, created_at
  
  ### suppliers (proveedores)
  - CatÃ¡logo de proveedores con mapeo a cÃ³digos Tango
  - Campos: id, cuit, razon_social, tango_supplier_code, active, etc.
  - Ãndice Ãºnico por CUIT para evitar duplicados
  
  ### files (archivos fuente)
  - Almacena metadata de archivos subidos (PDFs e imÃ¡genes)
  - Campos: id, original_filename, file_path, file_type, converted_to_pdf, uploaded_by, etc.
  
  ### invoices (comprobantes)
  - Registro central de cada comprobante procesado
  - Campos: internal_invoice_id (Ãºnico), supplier_id, invoice_type, point_of_sale, 
    invoice_number, issue_date, amounts, status, etc.
  - Clave lÃ³gica Ãºnica: cuit + tipo + punto_venta + nÃºmero
  - Estados: UPLOADED, PROCESSED, PENDING_REVIEW, READY_FOR_EXPORT, EXPORTED, ERROR
  
  ### invoice_taxes (IVA y otros impuestos)
  - Detalle de impuestos por comprobante
  - Campos: invoice_id, tax_code, tax_base, tax_amount, etc.
  
  ### invoice_concepts (conceptos/centros de costo)
  - DistribuciÃ³n de montos por concepto contable
  - Campos: invoice_id, tango_concept_code, amount, etc.
  
  ### tango_concepts (maestro de conceptos)
  - CatÃ¡logo dinÃ¡mico de conceptos contables
  - Campos: tango_concept_code, description, active
  
  ### tax_codes (configuraciÃ³n de impuestos)
  - Mapeo de tipos de impuestos a cÃ³digos Tango
  - Campos: code, tango_code, description, tax_type, rate
  
  ### export_batches (lotes de exportaciÃ³n)
  - Registro de archivos generados para Tango
  - Campos: id, filename, generated_by, generated_at, invoice_count
  
  ### audit_log (trazabilidad)
  - Registro de todas las acciones importantes
  - Campos: user_id, action, entity_type, entity_id, changes, timestamp
  
  ## 2. Seguridad (RLS)
  - Todas las tablas con RLS habilitado
  - PolÃ­ticas basadas en roles y auth.uid()
  - Control de acceso segÃºn permisos de cada rol
  
  ## 3. Notas Importantes
  - Se usa internal_invoice_id como clave Ãºnica para relacionar encabezados, impuestos y conceptos
  - Sistema de deduplicaciÃ³n basado en clave lÃ³gica compuesta
  - Trazabilidad completa de quiÃ©n hizo quÃ© y cuÃ¡ndo
  - Preparado para futuras integraciones sin afectar el core
*/

-- ============================================================================
-- EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('CARGA', 'REVISION', 'EXPORTACION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'UPLOADED', 
    'PROCESSED', 
    'PENDING_REVIEW', 
    'READY_FOR_EXPORT', 
    'EXPORTED', 
    'ERROR'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_type AS ENUM (
    'FACTURA_A', 
    'FACTURA_B', 
    'FACTURA_C', 
    'FACTURA_M',
    'NOTA_CREDITO_A',
    'NOTA_CREDITO_B',
    'NOTA_CREDITO_C',
    'NOTA_DEBITO_A',
    'NOTA_DEBITO_B',
    'NOTA_DEBITO_C'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLA: users
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'CARGA',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- ============================================================================
-- TABLA: suppliers
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuit text UNIQUE NOT NULL,
  razon_social text NOT NULL,
  tango_supplier_code text,
  address text,
  city text,
  province text,
  postal_code text,
  phone text,
  email text,
  iva_condition text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users with REVISION or EXPORTACION can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role IN ('REVISION', 'EXPORTACION')
    )
  );

-- ============================================================================
-- TABLA: files
-- ============================================================================

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_filename text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size integer,
  is_image boolean DEFAULT false,
  converted_to_pdf boolean DEFAULT false,
  converted_pdf_path text,
  uploaded_by uuid REFERENCES users(id) NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all files"
  ON files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can upload files"
  ON files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = uploaded_by
    )
  );

-- ============================================================================
-- TABLA: invoices
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  internal_invoice_id text UNIQUE NOT NULL,
  file_id uuid REFERENCES files(id),
  supplier_id uuid REFERENCES suppliers(id),
  supplier_cuit text NOT NULL,
  supplier_name text NOT NULL,
  invoice_type invoice_type NOT NULL,
  point_of_sale text NOT NULL,
  invoice_number text NOT NULL,
  issue_date date NOT NULL,
  accounting_date date,
  receiver_cuit text,
  receiver_name text,
  net_taxed numeric(15,2) DEFAULT 0,
  net_untaxed numeric(15,2) DEFAULT 0,
  net_exempt numeric(15,2) DEFAULT 0,
  iva_amount numeric(15,2) DEFAULT 0,
  other_taxes_amount numeric(15,2) DEFAULT 0,
  total_amount numeric(15,2) NOT NULL,
  status invoice_status DEFAULT 'UPLOADED',
  ocr_confidence numeric(3,2),
  validation_errors jsonb,
  notes text,
  exported boolean DEFAULT false,
  export_batch_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id) NOT NULL,
  updated_by uuid REFERENCES users(id),
  CONSTRAINT unique_invoice_key UNIQUE (supplier_cuit, invoice_type, point_of_sale, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users with CARGA role can create invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = created_by
    )
  );

CREATE POLICY "Users with REVISION or EXPORTACION can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role IN ('REVISION', 'EXPORTACION', 'CARGA')
    )
  );

-- ============================================================================
-- TABLA: tax_codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  tango_code text NOT NULL,
  description text NOT NULL,
  tax_type text NOT NULL,
  rate numeric(5,2),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tax_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all tax codes"
  ON tax_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users with EXPORTACION can manage tax codes"
  ON tax_codes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'EXPORTACION'
    )
  );

-- Datos iniciales de tax_codes
INSERT INTO tax_codes (code, tango_code, description, tax_type, rate) VALUES
  ('IVA_21', 'IVA21', 'IVA 21%', 'IVA', 21.00),
  ('IVA_10_5', 'IVA10.5', 'IVA 10.5%', 'IVA', 10.50),
  ('IVA_27', 'IVA27', 'IVA 27%', 'IVA', 27.00),
  ('IVA_5', 'IVA5', 'IVA 5%', 'IVA', 5.00),
  ('IVA_2_5', 'IVA2.5', 'IVA 2.5%', 'IVA', 2.50),
  ('EXENTO', 'EXENTO', 'Exento', 'EXENTO', 0.00),
  ('NO_GRAVADO', 'NOGRAV', 'No Gravado', 'NO_GRAVADO', 0.00),
  ('PERC_IIBB', 'PERCIIBB', 'PercepciÃ³n IIBB', 'PERCEPCION', null),
  ('PERC_IVA', 'PERCIVA', 'PercepciÃ³n IVA', 'PERCEPCION', null),
  ('PERC_GANANCIAS', 'PERCGAN', 'PercepciÃ³n Ganancias', 'PERCEPCION', null)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- TABLA: invoice_taxes
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_taxes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  tax_code_id uuid REFERENCES tax_codes(id) NOT NULL,
  tax_base numeric(15,2) DEFAULT 0,
  tax_amount numeric(15,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all invoice taxes"
  ON invoice_taxes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users with CARGA role can create invoice taxes"
  ON invoice_taxes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users with REVISION or EXPORTACION can manage invoice taxes"
  ON invoice_taxes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role IN ('REVISION', 'EXPORTACION', 'CARGA')
    )
  );

-- ============================================================================
-- TABLA: tango_concepts
-- ============================================================================

CREATE TABLE IF NOT EXISTS tango_concepts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tango_concept_code text UNIQUE NOT NULL,
  description text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

ALTER TABLE tango_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all tango concepts"
  ON tango_concepts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create tango concepts"
  ON tango_concepts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = created_by
    )
  );

CREATE POLICY "Users with REVISION or EXPORTACION can manage tango concepts"
  ON tango_concepts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role IN ('REVISION', 'EXPORTACION')
    )
  );

-- ============================================================================
-- TABLA: invoice_concepts
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_concepts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  tango_concept_id uuid REFERENCES tango_concepts(id) NOT NULL,
  amount numeric(15,2) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all invoice concepts"
  ON invoice_concepts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create invoice concepts"
  ON invoice_concepts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users with REVISION or EXPORTACION can manage invoice concepts"
  ON invoice_concepts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role IN ('REVISION', 'EXPORTACION', 'CARGA')
    )
  );

-- ============================================================================
-- TABLA: export_batches
-- ============================================================================

CREATE TABLE IF NOT EXISTS export_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename text NOT NULL,
  file_path text,
  invoice_count integer DEFAULT 0,
  total_amount numeric(15,2) DEFAULT 0,
  generated_by uuid REFERENCES users(id) NOT NULL,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE export_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all export batches"
  ON export_batches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users with EXPORTACION can create export batches"
  ON export_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'EXPORTACION'
      AND users.id = generated_by
    )
  );

-- Agregar FK despuÃ©s de crear export_batches
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'invoices_export_batch_id_fkey'
  ) THEN
    ALTER TABLE invoices 
    ADD CONSTRAINT invoices_export_batch_id_fkey 
    FOREIGN KEY (export_batch_id) REFERENCES export_batches(id);
  END IF;
END $$;

-- ============================================================================
-- TABLA: audit_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  changes jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users with EXPORTACION can view all audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'EXPORTACION'
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- ÃNDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_export_batch ON invoices(export_batch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoice_taxes_invoice ON invoice_taxes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_concepts_invoice ON invoice_concepts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_cuit ON suppliers(cuit);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);

-- ============================================================================
-- FUNCIONES AUXILIARES
-- ============================================================================

-- FunciÃ³n para generar internal_invoice_id Ãºnico
CREATE OR REPLACE FUNCTION generate_internal_invoice_id()
RETURNS text AS $$
BEGIN
  RETURN 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 8));
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-generar internal_invoice_id
CREATE OR REPLACE FUNCTION set_internal_invoice_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.internal_invoice_id IS NULL THEN
    NEW.internal_invoice_id := generate_internal_invoice_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_set_internal_invoice_id'
  ) THEN
    CREATE TRIGGER trigger_set_internal_invoice_id
      BEFORE INSERT ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION set_internal_invoice_id();
  END IF;
END $$;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_invoices_updated_at'
  ) THEN
    CREATE TRIGGER trigger_invoices_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_suppliers_updated_at'
  ) THEN
    CREATE TRIGGER trigger_suppliers_updated_at
      BEFORE UPDATE ON suppliers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_users_updated_at'
  ) THEN
    CREATE TRIGGER trigger_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
/*
  # Simplificar Sistema de Roles - Todos los Usuarios con Acceso Completo
  
  ## Cambios
  
  1. Modificar polÃ­ticas RLS para dar acceso completo a todos los usuarios autenticados
  2. Mantener el campo role en la tabla users solo para referencia
  3. Eliminar restricciones basadas en roles especÃ­ficos
  
  ## Resultado
  
  Todos los usuarios autenticados pueden:
  - Cargar comprobantes
  - Revisar y editar comprobantes
  - Gestionar proveedores
  - Gestionar conceptos
  - Generar exportaciones
*/

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: SUPPLIERS
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage suppliers" ON suppliers;

CREATE POLICY "All authenticated users can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: INVOICES
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can update invoices" ON invoices;

CREATE POLICY "All authenticated users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: INVOICE_TAXES
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage invoice taxes" ON invoice_taxes;

CREATE POLICY "All authenticated users can manage invoice taxes"
  ON invoice_taxes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: TANGO_CONCEPTS
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage tango concepts" ON tango_concepts;

CREATE POLICY "All authenticated users can manage tango concepts"
  ON tango_concepts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: INVOICE_CONCEPTS
-- ============================================================================

DROP POLICY IF EXISTS "Users with REVISION or EXPORTACION can manage invoice concepts" ON invoice_concepts;

CREATE POLICY "All authenticated users can manage invoice concepts"
  ON invoice_concepts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: TAX_CODES
-- ============================================================================

DROP POLICY IF EXISTS "Users with EXPORTACION can manage tax codes" ON tax_codes;

CREATE POLICY "All authenticated users can manage tax codes"
  ON tax_codes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: EXPORT_BATCHES
-- ============================================================================

DROP POLICY IF EXISTS "Users with EXPORTACION can create export batches" ON export_batches;

CREATE POLICY "All authenticated users can create export batches"
  ON export_batches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: AUDIT_LOG
-- ============================================================================

DROP POLICY IF EXISTS "Users with EXPORTACION can view all audit logs" ON audit_log;

CREATE POLICY "All authenticated users can view all audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);
/*
  # Add Complete Tango Export Fields to Invoices Table

  ## Overview
  This migration adds all required fields for complete Tango GestiÃ³n export compatibility.
  These fields match the 27-column template required by Tango for invoice import.

  ## New Columns Added

  ### Transaction Details
  - `currency_code` (text): Moneda CTE - Currency code (e.g., 'ARS', 'USD')
  - `exchange_rate` (numeric): CotizaciÃ³n - Exchange rate for foreign currency
  - `purchase_condition` (text): CondiciÃ³n de compra - Payment terms/conditions

  ### Additional Amounts
  - `advance_payment` (numeric): Anticipo o seÃ±a - Down payment or deposit amount
  - `discount` (numeric): BonificaciÃ³n - Discount amount
  - `freight` (numeric): Flete - Shipping/freight charges
  - `interest` (numeric): Intereses - Interest charges

  ### Electronic Invoice Data
  - `is_electronic` (boolean): Es factura electrÃ³nica - Electronic invoice flag
  - `cai_cae` (text): CAI / CAE - Electronic authorization code
  - `cai_cae_expiration` (date): Fecha de vencimiento del CAI / CAE - Authorization expiration date
  - `non_computable_tax_credit` (numeric): CrÃ©dito fiscal no computable - Non-deductible tax credit

  ### Classification Codes
  - `expense_code` (text): CÃ³digo de gasto - Expense classification code
  - `sector_code` (text): CÃ³digo de sector - Business sector code
  - `classifier_code` (text): CÃ³digo de clasificador - General classifier code
  - `afip_operation_type_code` (text): CÃ³digo de tipo de operaciÃ³n AFIP - AFIP operation type
  - `afip_voucher_code` (text): CÃ³digo de comprobante AFIP - AFIP voucher code

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
COMMENT ON TABLE invoices IS 'Complete invoice records with all 27 Tango GestiÃ³n export fields';
-- Permitir que usuarios autenticados puedan crear su perfil
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Permitir que usuarios puedan actualizar su propio perfil
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Crear funciÃ³n para auto-crear perfil de usuario al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'REVISION')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para ejecutar la funciÃ³n cuando se crea un usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

/*
  # Agregar PolÃ­tica DELETE para Comprobantes
  
  ## Problema
  La tabla invoices tenÃ­a polÃ­ticas RLS para SELECT, INSERT y UPDATE, pero faltaba
  la polÃ­tica para DELETE, lo que impedÃ­a eliminar comprobantes.
  
  ## SoluciÃ³n
  Agregar polÃ­tica que permita a todos los usuarios autenticados eliminar comprobantes.
*/

-- ============================================================================
-- AGREGAR POLÃTICA DELETE: INVOICES
-- ============================================================================

CREATE POLICY "All authenticated users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

/*
  # Cambiar internal_invoice_id a numÃ©rico
  
  ## Problema
  El internal_invoice_id actualmente se genera como texto con formato 'INV-YYYYMMDD-XXXXXXXX',
  pero debe ser numÃ©rico para cumplir con los requisitos de Tango.
  
  ## SoluciÃ³n
  1. Crear una secuencia para generar nÃºmeros Ãºnicos
  2. Modificar la funciÃ³n de generaciÃ³n para usar nÃºmeros secuenciales
  3. Actualizar los registros existentes (opcional, solo si es necesario)
*/

-- ============================================================================
-- CREAR SECUENCIA PARA ID NUMÃ‰RICO
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS invoice_id_sequence
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- ============================================================================
-- ACTUALIZAR FUNCIÃ“N DE GENERACIÃ“N
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_internal_invoice_id()
RETURNS text AS $$
DECLARE
  next_id bigint;
BEGIN
  -- Obtener el siguiente nÃºmero de la secuencia
  next_id := nextval('invoice_id_sequence');
  
  -- Retornar como texto numÃ©rico (sin prefijos ni guiones)
  RETURN next_id::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ACTUALIZAR REGISTROS EXISTENTES (OPCIONAL)
-- ============================================================================
-- Si hay registros existentes con IDs no numÃ©ricos, podemos actualizarlos
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

-- Actualizar cÃ³digos de impuestos a valores numÃ©ricos segÃºn requerimientos
-- IVA_21 â†’ 1
-- IVA_10_5 â†’ 2
-- PERC_IVA â†’ 10
-- PERC_IIBB â†’ 52

UPDATE tax_codes SET code = '1' WHERE code = 'IVA_21';
UPDATE tax_codes SET code = '2' WHERE code = 'IVA_10_5';
UPDATE tax_codes SET code = '10' WHERE code = 'PERC_IVA';
UPDATE tax_codes SET code = '52' WHERE code = 'PERC_IIBB';

-- Nota: Los demÃ¡s cÃ³digos (IVA_27, IVA_5, IVA_2_5, EXENTO, NO_GRAVADO, PERC_GANANCIAS, OTRO)
-- se mantienen con sus valores actuales hasta que se especifiquen nuevos cÃ³digos numÃ©ricos

/*
  # Aislar Datos por Usuario - Sesiones Individuales
  
  ## Problema
  Las polÃ­ticas RLS actuales permiten que todos los usuarios vean todos los datos.
  Esto no es seguro y viola la privacidad de los usuarios.
  
  ## SoluciÃ³n
  Modificar las polÃ­ticas RLS para que cada usuario solo pueda ver y gestionar
  sus propios datos basÃ¡ndose en el campo created_by o user_id.
  
  ## Cambios
  1. INVOICES: Solo ver facturas creadas por el usuario
  2. FILES: Solo ver archivos subidos por el usuario
  3. AUDIT_LOG: Solo ver logs del usuario
  4. EXPORT_BATCHES: Solo ver exportaciones del usuario
*/

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: INVOICES
-- ============================================================================

-- Eliminar polÃ­tica que permite ver todas las facturas
DROP POLICY IF EXISTS "Users can view all invoices" ON invoices;

-- Nueva polÃ­tica: Solo ver facturas propias
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

-- Actualizar polÃ­tica de INSERT para asegurar que created_by sea del usuario actual
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

-- Actualizar polÃ­tica de UPDATE: Solo actualizar facturas propias
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

-- Actualizar polÃ­tica de DELETE: Solo eliminar facturas propias
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
-- ACTUALIZAR POLÃTICAS: FILES
-- ============================================================================

-- Eliminar polÃ­tica que permite ver todos los archivos
DROP POLICY IF EXISTS "Users can view all files" ON files;

-- Nueva polÃ­tica: Solo ver archivos propios
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

-- La polÃ­tica de INSERT ya estÃ¡ correcta (solo permite subir archivos propios)

-- ============================================================================
-- ACTUALIZAR POLÃTICAS: AUDIT_LOG
-- ============================================================================

-- Eliminar polÃ­ticas existentes
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_log;
DROP POLICY IF EXISTS "Users with EXPORTACION can view all audit logs" ON audit_log;

-- Nueva polÃ­tica: Solo ver logs propios
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
-- ACTUALIZAR POLÃTICAS: EXPORT_BATCHES
-- ============================================================================

-- Eliminar polÃ­tica que permite ver todas las exportaciones
DROP POLICY IF EXISTS "Users can view all export batches" ON export_batches;

-- Nueva polÃ­tica: Solo ver exportaciones propias
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

-- Actualizar polÃ­tica de INSERT
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
-- ACTUALIZAR POLÃTICAS: INVOICE_TAXES
-- ============================================================================

-- Las facturas de impuestos estÃ¡n relacionadas con invoices, asÃ­ que heredan
-- la seguridad de las facturas. Pero asegurÃ©monos de que solo se puedan ver
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
-- ACTUALIZAR POLÃTICAS: INVOICE_CONCEPTS
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

/*
  # GestiÃ³n de Usuarios - Solo REVISION Puede Crear Usuarios
  
  ## Cambios
  1. Eliminar trigger de auto-registro pÃºblico
  2. Eliminar polÃ­tica de auto-registro
  3. Crear polÃ­tica para que solo REVISION pueda crear usuarios
  4. Mantener funciÃ³n del trigger para uso manual por admin
*/

-- Eliminar trigger de auto-registro pÃºblico
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Eliminar polÃ­tica de auto-registro
DROP POLICY IF EXISTS "Users can create their own profile" ON users;

-- PolÃ­tica: Solo usuarios con rol REVISION pueden crear otros usuarios
CREATE POLICY "Only REVISION role can create users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'REVISION'
    )
  );

-- Mantener la funciÃ³n del trigger para uso manual cuando REVISION crea usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'REVISION')
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'Error al crear perfil: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- MigraciÃ³n para desactivar RLS temporalmente y permitir operaciones bÃ¡sicas
-- Esta migraciÃ³n hace las polÃ­ticas mÃ¡s permisivas para desarrollo

-- ============================================================================
-- DESACTIVAR RLS EN TABLAS PRINCIPALES (SOLO PARA DESARROLLO)
-- ============================================================================

-- OpciÃ³n 1: Desactivar RLS completamente (MÃS SIMPLE)
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
-- Esta configuraciÃ³n es SOLO para desarrollo/testing
-- En producciÃ³n, deberÃ­as:
-- 1. Mantener RLS habilitado
-- 2. Configurar polÃ­ticas apropiadas
-- 3. Usar service_role key solo en backend
-- 
-- Para reactivar RLS en el futuro:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- (y asÃ­ con todas las tablas)
-- TABLA: ocr_learning_data (Aprendizaje dinÃ¡mico)
CREATE TABLE IF NOT EXISTS ocr_learning_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_cuit text NOT NULL,
  original_data jsonb NOT NULL,
  corrected_data jsonb NOT NULL,
  improvement_hint text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Habilitar RLS
ALTER TABLE ocr_learning_data ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas de RLS
CREATE POLICY "Users can view all ocr learning data"
  ON ocr_learning_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert ocr learning data"
  ON ocr_learning_data FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.id = ocr_learning_data.created_by
    )
  );

-- Ãndices
CREATE INDEX IF NOT EXISTS idx_ocr_learning_supplier ON ocr_learning_data(supplier_cuit);

-- Campo para trucos estÃ¡ticos en suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ocr_hints jsonb;

-- Comentario descriptivo
COMMENT ON TABLE ocr_learning_data IS 'Almacena correcciones de usuarios sobre resultados de OCR para mejorar futuros anÃ¡lisis.';
COMMENT ON COLUMN ocr_learning_data.original_data IS 'Los datos tal como los devolviÃ³ la IA originalmente.';
COMMENT ON COLUMN ocr_learning_data.corrected_data IS 'Los datos finales guardados por el usuario.';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ocr_raw_result jsonb;
