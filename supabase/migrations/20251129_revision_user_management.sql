/*
  # Gestión de Usuarios - Solo REVISION Puede Crear Usuarios
  
  ## Cambios
  1. Eliminar trigger de auto-registro público
  2. Eliminar política de auto-registro
  3. Crear política para que solo REVISION pueda crear usuarios
  4. Mantener función del trigger para uso manual por admin
*/

-- Eliminar trigger de auto-registro público
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Eliminar política de auto-registro
DROP POLICY IF EXISTS "Users can create their own profile" ON users;

-- Política: Solo usuarios con rol REVISION pueden crear otros usuarios
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

-- Mantener la función del trigger para uso manual cuando REVISION crea usuarios
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

