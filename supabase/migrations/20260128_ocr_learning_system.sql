-- TABLA: ocr_learning_data (Aprendizaje dinámico)
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

-- Políticas de RLS
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_ocr_learning_supplier ON ocr_learning_data(supplier_cuit);

-- Campo para trucos estáticos en suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ocr_hints jsonb;

-- Comentario descriptivo
COMMENT ON TABLE ocr_learning_data IS 'Almacena correcciones de usuarios sobre resultados de OCR para mejorar futuros análisis.';
COMMENT ON COLUMN ocr_learning_data.original_data IS 'Los datos tal como los devolvió la IA originalmente.';
COMMENT ON COLUMN ocr_learning_data.corrected_data IS 'Los datos finales guardados por el usuario.';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ocr_raw_result jsonb;
