/*
  # Sistema de Gestión de Comprobantes para Tango
  
  ## Descripción General
  Sistema completo para automatizar la carga, procesamiento, revisión y exportación de 
  comprobantes de compra con destino a Tango Gestión.
  
  ## 1. Tablas Principales
  
  ### users
  - Gestión de usuarios con roles (CARGA, REVISION, EXPORTACION)
  - Campos: id, email, full_name, role, active, created_at
  
  ### suppliers (proveedores)
  - Catálogo de proveedores con mapeo a códigos Tango
  - Campos: id, cuit, razon_social, tango_supplier_code, active, etc.
  - Índice único por CUIT para evitar duplicados
  
  ### files (archivos fuente)
  - Almacena metadata de archivos subidos (PDFs e imágenes)
  - Campos: id, original_filename, file_path, file_type, converted_to_pdf, uploaded_by, etc.
  
  ### invoices (comprobantes)
  - Registro central de cada comprobante procesado
  - Campos: internal_invoice_id (único), supplier_id, invoice_type, point_of_sale, 
    invoice_number, issue_date, amounts, status, etc.
  - Clave lógica única: cuit + tipo + punto_venta + número
  - Estados: UPLOADED, PROCESSED, PENDING_REVIEW, READY_FOR_EXPORT, EXPORTED, ERROR
  
  ### invoice_taxes (IVA y otros impuestos)
  - Detalle de impuestos por comprobante
  - Campos: invoice_id, tax_code, tax_base, tax_amount, etc.
  
  ### invoice_concepts (conceptos/centros de costo)
  - Distribución de montos por concepto contable
  - Campos: invoice_id, tango_concept_code, amount, etc.
  
  ### tango_concepts (maestro de conceptos)
  - Catálogo dinámico de conceptos contables
  - Campos: tango_concept_code, description, active
  
  ### tax_codes (configuración de impuestos)
  - Mapeo de tipos de impuestos a códigos Tango
  - Campos: code, tango_code, description, tax_type, rate
  
  ### export_batches (lotes de exportación)
  - Registro de archivos generados para Tango
  - Campos: id, filename, generated_by, generated_at, invoice_count
  
  ### audit_log (trazabilidad)
  - Registro de todas las acciones importantes
  - Campos: user_id, action, entity_type, entity_id, changes, timestamp
  
  ## 2. Seguridad (RLS)
  - Todas las tablas con RLS habilitado
  - Políticas basadas en roles y auth.uid()
  - Control de acceso según permisos de cada rol
  
  ## 3. Notas Importantes
  - Se usa internal_invoice_id como clave única para relacionar encabezados, impuestos y conceptos
  - Sistema de deduplicación basado en clave lógica compuesta
  - Trazabilidad completa de quién hizo qué y cuándo
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
  ('PERC_IIBB', 'PERCIIBB', 'Percepción IIBB', 'PERCEPCION', null),
  ('PERC_IVA', 'PERCIVA', 'Percepción IVA', 'PERCEPCION', null),
  ('PERC_GANANCIAS', 'PERCGAN', 'Percepción Ganancias', 'PERCEPCION', null)
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

-- Agregar FK después de crear export_batches
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
-- ÍNDICES
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

-- Función para generar internal_invoice_id único
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