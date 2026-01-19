# Instrucciones para Aplicar Migraciones en Supabase

## Problema
La aplicación muestra error "Could not find the table 'public.users'" porque las migraciones no se han ejecutado en el nuevo proyecto de Supabase.

## Solución: Ejecutar Migraciones Manualmente

### Paso 1: Acceder al SQL Editor
1. Ve a: https://supabase.com/dashboard/project/aaxkcmkbcjstvedwcljl
2. En el menú lateral, haz clic en **SQL Editor**
3. Haz clic en **New Query**

### Paso 2: Ejecutar las Migraciones en Orden

Copia y pega cada archivo SQL en el editor y ejecuta con "Run" (Ctrl+Enter).
**IMPORTANTE:** Ejecutar en este orden exacto:

#### 1. Migración Base (OBLIGATORIA)
**Archivo:** `supabase/migrations/20251108222712_create_invoice_management_system.sql`
- Crea todas las tablas principales
- Configura RLS (Row Level Security)
- Inserta datos iniciales

#### 2. Simplificación de Roles
**Archivo:** `supabase/migrations/20251108224015_simplify_roles_all_users_full_access.sql`
- Ajusta políticas de acceso

#### 3. Campos Adicionales de Tango
**Archivo:** `supabase/migrations/20251109003600_add_complete_tango_fields_to_invoices.sql`
- Agrega campos necesarios para exportación a Tango

#### 4. Fix de Registro de Usuarios
**Archivo:** `supabase/migrations/20251115_fix_user_registration.sql`
- Corrige el flujo de registro

#### 5. Política de Eliminación
**Archivo:** `supabase/migrations/20251127173444_add_delete_policy_for_invoices.sql`
- Permite eliminar facturas

#### 6. ID Numérico Interno
**Archivo:** `supabase/migrations/20251127180000_make_internal_invoice_id_numeric.sql`
- Convierte internal_invoice_id a numérico

#### 7. Códigos de Impuestos Numéricos
**Archivo:** `supabase/migrations/20251127195612_update_tax_codes_to_numeric.sql`
- Actualiza códigos de impuestos

#### 8. Aislamiento de Usuarios
**Archivo:** `supabase/migrations/20251128_add_user_isolation_policies.sql`
- Políticas de seguridad por usuario

#### 9. Revisión de Gestión de Usuarios
**Archivo:** `supabase/migrations/20251129_revision_user_management.sql`
- Ajustes finales de gestión de usuarios

### Paso 3: Verificar
Después de ejecutar todas las migraciones, ejecuta esta consulta para verificar:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Deberías ver estas tablas:
- audit_log
- export_batches
- files
- invoice_concepts
- invoice_taxes
- invoices
- suppliers
- tango_concepts
- tax_codes
- users

### Paso 4: Crear Usuario en la Tabla Public
Después de ejecutar las migraciones, necesitas crear un registro en la tabla `users` para tu usuario de prueba:

```sql
-- Primero, obtén el UUID del usuario de auth
SELECT id, email FROM auth.users WHERE email = 'usuario.prueba.tango@gmail.com';

-- Luego, inserta en la tabla users (reemplaza 'UUID_AQUI' con el UUID obtenido)
INSERT INTO public.users (auth_user_id, email, full_name, role, active)
VALUES (
  'UUID_AQUI',  -- Reemplaza con el UUID del paso anterior
  'usuario.prueba.tango@gmail.com',
  'Usuario de Prueba',
  'EXPORTACION',  -- Puede ser 'CARGA', 'REVISION', o 'EXPORTACION'
  true
);
```

## Alternativa Rápida (Todo en Uno)
Si prefieres ejecutar todo de una vez, puedes copiar el contenido de todos los archivos en un solo query, pero es más seguro hacerlo paso a paso para detectar errores.

### Paso 5: Configurar OpenAI (OCR Inteligente)
Para que el análisis de facturas con IA funcione, debes configurar la API Key de OpenAI como un "Secret" en Supabase:

1. Ve a **Settings** → **Edge Functions**.
2. Haz clic en **Add Secret**.
3. Name: `OPENAI_API_KEY`.
4. Value: (Copia el valor de `VITE_OPENAI_API_KEY` de tu archivo `.env`).

O vía CLI:
```bash
npx supabase secrets set OPENAI_API_KEY=tu_clave_aqui
```

## Notas Importantes
- Las migraciones usan `CREATE TABLE IF NOT EXISTS`, así que son seguras de ejecutar múltiples veces
- Si alguna migración falla, revisa el error y corrígelo antes de continuar
- Algunas migraciones dependen de las anteriores, por eso el orden es importante
- **API Key:** El sistema utiliza la clave configurada en el archivo `.env` localmente, pero para las Edge Functions de Supabase (producción), es obligatorio el Paso 5.
