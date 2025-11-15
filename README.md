# Supabase Edge Functions

## Edge Function: openai-ocr

Esta Edge Function actúa como proxy entre el frontend y la API de OpenAI para procesar OCR de comprobantes. Soluciona el problema de CORS que existe cuando se intenta llamar directamente a OpenAI desde bolt.new u otros entornos de sandbox.

### Configuración

#### 1. Instalar Supabase CLI

```bash
npm install -g supabase
```

#### 2. Iniciar sesión en Supabase

```bash
supabase login
```

#### 3. Link con tu proyecto

```bash
supabase link --project-ref TU_PROJECT_REF
```

Puedes obtener el `PROJECT_REF` desde la URL de tu proyecto de Supabase:
`https://app.supabase.com/project/TU_PROJECT_REF`

#### 4. Configurar la API Key de OpenAI

La Edge Function necesita acceso a la API key de OpenAI. Configúrala como secreto:

```bash
supabase secrets set OPENAI_API_KEY=tu_api_key_de_openai
```

#### 5. Desplegar la Edge Function

Desde la raíz del proyecto:

```bash
supabase functions deploy openai-ocr
```

O si estás en el directorio `project`:

```bash
cd ..
supabase functions deploy openai-ocr --project-ref TU_PROJECT_REF
```

### Verificar el despliegue

Una vez desplegada, puedes verificar que funciona:

```bash
curl -i --location --request POST 'https://TU_PROJECT_REF.supabase.co/functions/v1/openai-ocr' \
  --header 'Authorization: Bearer TU_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"base64":"test","mimeType":"image/png"}'
```

### Monitorear logs

Para ver los logs de la función en tiempo real:

```bash
supabase functions logs openai-ocr
```

### Actualizar la función

Si haces cambios en el código, simplemente vuelve a desplegar:

```bash
supabase functions deploy openai-ocr
```

### Variables de entorno necesarias

La Edge Function automáticamente tiene acceso a:
- `SUPABASE_URL` - URL de tu proyecto
- `SUPABASE_ANON_KEY` - API key anónima
- `OPENAI_API_KEY` - Configurada manualmente (ver paso 4)

### Troubleshooting

#### Error: "No authorization header"
- Verifica que el frontend esté enviando el token de autenticación
- Verifica que el usuario esté logueado

#### Error: "OPENAI_API_KEY no configurada"
- Ejecuta: `supabase secrets set OPENAI_API_KEY=tu_api_key`
- Vuelve a desplegar la función

#### Error: "Usuario no autenticado"
- El usuario debe estar logueado en la aplicación
- Verifica que el token de sesión sea válido

### Costos

Esta Edge Function utiliza:
- **Supabase Edge Functions**: Gratuitas hasta 500K invocaciones/mes
- **OpenAI API**: Costo según el uso de la API (modelo gpt-4o)

### Seguridad

✅ La API key de OpenAI nunca se expone en el frontend
✅ Solo usuarios autenticados pueden usar la función
✅ CORS está configurado correctamente
✅ Los logs no exponen información sensible

