// Supabase Edge Function para procesar OCR con OpenAI
// Actúa como proxy para evitar problemas de CORS y proteger la API key

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRRequest {
  base64: string | string[]; // Puede ser una imagen o array de imágenes (múltiples páginas)
  mimeType: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verificar autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error('Usuario no autenticado');
    }

    // Verificar que tenemos la API key de OpenAI
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada en el servidor');
    }

    // Obtener el body
    const requestData: OCRRequest = await req.json();

    if (!requestData.base64 || !requestData.mimeType) {
      throw new Error('Faltan parámetros: base64 y mimeType son requeridos');
    }

    // Normalizar: siempre trabajar con array
    const base64Array = Array.isArray(requestData.base64) 
      ? requestData.base64 
      : [requestData.base64];
    
    const pagesCount = base64Array.length;
    const mimeType = requestData.mimeType;

    console.log('[Supabase Edge Function] Procesando OCR para usuario:', user.id);
    console.log('[Supabase Edge Function] Cantidad de páginas:', pagesCount);
    console.log('[Supabase Edge Function] Tamaños de imágenes:', base64Array.map((b, i) => `Página ${i + 1}: ${b.length} chars`).join(', '));

    // Validar que las imágenes no estén vacías y no sean demasiado grandes
    const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB por imagen (límite de OpenAI)
    for (let i = 0; i < base64Array.length; i++) {
      if (!base64Array[i] || base64Array[i].length === 0) {
        throw new Error(`La página ${i + 1} está vacía`);
      }
      // El tamaño en base64 es aproximadamente 4/3 del tamaño original
      const estimatedSize = (base64Array[i].length * 3) / 4;
      if (estimatedSize > MAX_IMAGE_SIZE) {
        throw new Error(`La página ${i + 1} es demasiado grande (${(estimatedSize / 1024 / 1024).toFixed(2)}MB). Máximo permitido: ${(MAX_IMAGE_SIZE / 1024 / 1024).toFixed(2)}MB`);
      }
    }

    // Obtener tax_codes activos de la base de datos
    const { data: taxCodes, error: taxCodesError } = await supabaseClient
      .from('tax_codes')
      .select('code, description, rate, tax_type')
      .eq('active', true)
      .order('code');

    if (taxCodesError) {
      console.warn('[Supabase Edge Function] Error al obtener tax_codes:', taxCodesError);
    }

    const prompt = buildPrompt(pagesCount > 1, taxCodes || []);

    // Construir el contenido con todas las imágenes
    // IMPORTANTE: Verificar que el base64 no tenga el prefijo data: ya incluido
    const imageContent = base64Array.map((imgBase64, index) => {
      // Asegurar que el base64 esté limpio (sin prefijo data:)
      let cleanBase64 = imgBase64;
      if (imgBase64.includes(',')) {
        cleanBase64 = imgBase64.split(',')[1] || imgBase64;
      }
      
      // Validar que el base64 sea válido
      if (!cleanBase64 || cleanBase64.length === 0) {
        throw new Error(`La imagen de la página ${index + 1} está vacía después de limpiar`);
      }

      return {
        type: 'image_url' as const,
        image_url: {
          url: `data:${mimeType};base64,${cleanBase64}`,
        },
      };
    });

    const requestBody = {
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContent, // Enviar todas las imágenes
          ],
        },
      ],
      max_tokens: 6000, // Aumentado a 6000 para facturas complejas con múltiples páginas e impuestos
    };

    const totalRequestSize = JSON.stringify(requestBody).length;
    const totalSizeMB = (totalRequestSize / 1024 / 1024).toFixed(2);
    const totalBase64MB = (base64Array.reduce((sum, b) => sum + b.length, 0) * 3 / 4 / 1024 / 1024).toFixed(2);
    
    console.log('[Supabase Edge Function] Request body preparado:', {
      model: requestBody.model,
      imagesCount: imageContent.length,
      promptLength: prompt.length,
      maxTokens: requestBody.max_tokens,
      totalRequestSize: `${totalSizeMB}MB`,
      totalBase64Size: `${totalBase64MB}MB`
    });

    // Validar tamaño total del request (OpenAI tiene límites)
    if (totalRequestSize > 25 * 1024 * 1024) { // 25MB límite aproximado
      throw new Error(`El request es demasiado grande (${totalSizeMB}MB). Reduce el tamaño de las imágenes o procesa menos páginas a la vez.`);
    }

    console.log('[Supabase Edge Function] Enviando solicitud a OpenAI...');

    // Validar que el request body sea válido antes de enviarlo
    try {
      const testStringify = JSON.stringify(requestBody);
      if (testStringify.length === 0) {
        throw new Error('El request body está vacío');
      }
      console.log('[Supabase Edge Function] Request body serializado correctamente, tamaño:', testStringify.length);
    } catch (stringifyError) {
      console.error('[Supabase Edge Function] Error al serializar request body:', stringifyError);
      throw new Error(`Error al preparar el request: ${stringifyError instanceof Error ? stringifyError.message : 'Error desconocido'}`);
    }

    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[Supabase Edge Function] Respuesta recibida de OpenAI:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Supabase Edge Function] Error de OpenAI - Respuesta completa:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        bodyLength: errorText.length,
        imagesCount: imageContent.length,
        totalBase64Size: base64Array.reduce((sum, b) => sum + b.length, 0),
        firstImageSize: base64Array[0]?.length || 0,
        requestBodySize: JSON.stringify(requestBody).length,
      });

      let errorDetail = '';
      let errorType = '';
      let errorCode = '';
      let errorParam = '';
      
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.error?.code || errorText;
        errorType = errorJson.error?.type || '';
        errorCode = errorJson.error?.code || '';
        errorParam = errorJson.error?.param || '';
        
        console.error('[Supabase Edge Function] Detalles del error parseado:', {
          message: errorJson.error?.message,
          type: errorJson.error?.type,
          code: errorJson.error?.code,
          param: errorJson.error?.param,
          fullError: JSON.stringify(errorJson, null, 2),
        });
      } catch (parseError) {
        console.error('[Supabase Edge Function] No se pudo parsear el error como JSON:', parseError);
        errorDetail = errorText || response.statusText;
      }

      // Si es error 400, puede ser problema de formato, tamaño o límites
      if (response.status === 400) {
        const totalSize = base64Array.reduce((sum, b) => sum + b.length, 0);
        const sizeMB = (totalSize * 3) / 4 / 1024 / 1024; // Aproximación del tamaño en MB
        const requestSizeMB = (JSON.stringify(requestBody).length / 1024 / 1024).toFixed(2);
        
        let errorMessage = `OpenAI rechazó la solicitud (400): ${errorDetail}`;
        if (errorType) errorMessage += `\nTipo: ${errorType}`;
        if (errorCode) errorMessage += `\nCódigo: ${errorCode}`;
        if (errorParam) errorMessage += `\nParámetro: ${errorParam}`;
        errorMessage += `\nImágenes: ${pagesCount}, Tamaño imágenes: ${sizeMB.toFixed(2)}MB, Tamaño request: ${requestSizeMB}MB`;
        errorMessage += `\nVerifica el formato de las imágenes o reduce el tamaño/resolución.`;
        
        throw new Error(errorMessage);
      }

      throw new Error(`OpenAI falló (${response.status}): ${errorDetail}`);
    }

    const data = await response.json();
    console.log('[Supabase Edge Function] Respuesta de OpenAI recibida exitosamente');
    console.log('[Supabase Edge Function] Estructura de respuesta:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length || 0,
      firstChoiceHasMessage: !!data.choices?.[0]?.message,
      firstChoiceHasContent: !!data.choices?.[0]?.message?.content,
      contentType: typeof data.choices?.[0]?.message?.content,
    });

    // Extraer el contenido
    let outputText: string;
    try {
      outputText = extractOutputText(data);
      console.log('[Supabase Edge Function] Texto extraído (primeros 1000 chars):', outputText.substring(0, 1000));
      console.log('[Supabase Edge Function] Longitud total del texto:', outputText.length);
    } catch (extractError) {
      console.error('[Supabase Edge Function] Error al extraer texto:', extractError);
      console.error('[Supabase Edge Function] Respuesta completa de OpenAI:', JSON.stringify(data, null, 2));
      throw new Error(`Error al extraer contenido de OpenAI: ${extractError instanceof Error ? extractError.message : 'Error desconocido'}`);
    }

    // Intentar parsear como JSON - con múltiples estrategias
    let parsedJson: any;
    let finalOutputText = outputText;
    
    try {
      // Intento 1: Parsear directamente
      parsedJson = JSON.parse(outputText);
      console.log('[Supabase Edge Function] JSON parseado exitosamente (parseo directo)');
    } catch (parseError) {
      console.warn('[Supabase Edge Function] Error al parsear JSON directamente, intentando estrategias alternativas...');
      console.log('[Supabase Edge Function] Texto completo recibido (primeros 2000 chars):', outputText.substring(0, 2000));
      
      // Intento 2: Buscar JSON dentro del texto (puede estar en markdown o con texto adicional)
      const jsonPatterns = [
        /\{[\s\S]*\}/,  // Cualquier objeto JSON
        /```json\s*(\{[\s\S]*?\})\s*```/i,  // JSON en bloque de código markdown
        /```\s*(\{[\s\S]*?\})\s*```/i,  // JSON en bloque de código sin especificar json
      ];
      
      let jsonFound = false;
      for (const pattern of jsonPatterns) {
        const match = outputText.match(pattern);
        if (match) {
          const jsonCandidate = match[1] || match[0];
          try {
            parsedJson = JSON.parse(jsonCandidate);
            finalOutputText = jsonCandidate;
            console.log('[Supabase Edge Function] JSON extraído usando patrón:', pattern.toString());
            jsonFound = true;
            break;
          } catch {
            // Continuar con el siguiente patrón
          }
        }
      }
      
      if (!jsonFound) {
        // Intento 3: Buscar desde el primer { hasta el último }
        const firstBrace = outputText.indexOf('{');
        const lastBrace = outputText.lastIndexOf('}');
        
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          const jsonCandidate = outputText.substring(firstBrace, lastBrace + 1);
          try {
            parsedJson = JSON.parse(jsonCandidate);
            finalOutputText = jsonCandidate;
            console.log('[Supabase Edge Function] JSON extraído desde primer { hasta último }');
            jsonFound = true;
          } catch {
            // Continuar
          }
        }
      }
      
      if (!jsonFound) {
        // Intento 4: Intentar reparar JSON común (comillas no escapadas, etc.)
        let repairedJson = outputText;
        
        // Buscar el primer { y último }
        const firstBrace = repairedJson.indexOf('{');
        const lastBrace = repairedJson.lastIndexOf('}');
        
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          repairedJson = repairedJson.substring(firstBrace, lastBrace + 1);
          
          // Intentar reparar JSON truncado o con problemas comunes
          // Si termina abruptamente, intentar cerrar objetos/arrays
          let openBraces = (repairedJson.match(/\{/g) || []).length;
          let closeBraces = (repairedJson.match(/\}/g) || []).length;
          let openBrackets = (repairedJson.match(/\[/g) || []).length;
          let closeBrackets = (repairedJson.match(/\]/g) || []).length;
          
          // Cerrar objetos/arrays abiertos
          while (openBraces > closeBraces) {
            repairedJson += '}';
            closeBraces++;
          }
          while (openBrackets > closeBrackets) {
            repairedJson += ']';
            closeBrackets++;
          }
          
          try {
            parsedJson = JSON.parse(repairedJson);
            finalOutputText = repairedJson;
            console.log('[Supabase Edge Function] JSON reparado y parseado exitosamente');
            jsonFound = true;
          } catch {
            // Último intento fallido
          }
        }
        
        if (!jsonFound) {
          console.error('[Supabase Edge Function] No se pudo extraer JSON válido después de todos los intentos');
          console.error('[Supabase Edge Function] Texto completo (últimos 1000 chars):', outputText.substring(Math.max(0, outputText.length - 1000)));
          throw new Error(
            `OpenAI devolvió un formato inesperado. No se pudo extraer JSON válido.\n` +
            `Texto recibido (primeros 500 chars): ${outputText.substring(0, 500)}...\n` +
            `Longitud total: ${outputText.length} caracteres`
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: finalOutputText, // Usar el texto final extraído/reparado
        usage: data.usage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[Supabase Edge Function] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

function buildPrompt(
  hasMultiplePages: boolean = false,
  taxCodes: Array<{ code: string; description: string; rate: number | null; tax_type: string }> = []
): string {
  // Construir sección de códigos de impuestos disponibles
  let taxCodesSection = '';
  if (taxCodes.length > 0) {
    taxCodesSection = `\n\nCÓDIGOS DE IMPUESTOS DISPONIBLES EN LA BASE DE DATOS:\n`;
    taxCodes.forEach((tc) => {
      const rateInfo = tc.rate !== null ? ` (tasa: ${tc.rate}%)` : '';
      taxCodesSection += `- Código "${tc.code}": ${tc.description}${rateInfo} (tipo: ${tc.tax_type})\n`;
    });
    taxCodesSection += `\nDEBES usar EXACTAMENTE estos códigos en el campo "taxCode" del JSON.\n`;
  }

  const multiplePagesWarning = hasMultiplePages 
    ? `\n\n🚨 CRÍTICO - MÚLTIPLES PÁGINAS DETECTADAS 🚨\n\nEste comprobante tiene MÚLTIPLES PÁGINAS. DEBES revisar ABSOLUTAMENTE TODAS las páginas, especialmente:\n- La ÚLTIMA PÁGINA donde suelen estar los TOTALES, IMPUESTOS y CAE\n- Las páginas intermedias donde pueden estar detalles de productos/servicios\n- La primera página donde están los datos del proveedor y receptor\n\nNO te detengas en la primera página. Revisa CADA página completa antes de extraer los datos finales.\nLos valores de netTaxed, netUntaxed, netExempt, ivaAmount, otherTaxesAmount y totalAmount están en la ÚLTIMA PÁGINA.\nLos impuestos detallados (taxes array) también están en la ÚLTIMA PÁGINA.\n`
    : `\n\n⚠️ IMPORTANTE: Revisa TODO el documento completo. Los totales e impuestos suelen estar al final del documento.\n`;

  return `
Extrae los datos del comprobante argentino adjunto y responde SOLO con JSON válido, sin texto adicional.

${multiplePagesWarning}
${taxCodesSection}
Estructura esperada:
{
  "supplierCuit": "string|null",
  "supplierName": "string|null",
  "receiverCuit": "string|null",
  "receiverName": "string|null",
  "invoiceTypeCode": "string|null",
  "invoiceType": "string|null",
  "pointOfSale": "string|null",
  "invoiceNumber": "string|null",
  "issueDate": "YYYY-MM-DD|null",
  "netTaxed": "number",
  "netUntaxed": "number",
  "netExempt": "number",
  "ivaAmount": "number",
  "otherTaxesAmount": "number",
  "totalAmount": "number",
  "caiCae": "string|null",
  "caiCaeExpiration": "YYYY-MM-DD|null",
  "taxes": [
    { 
      "taxCode": "string (debe ser uno de los códigos disponibles arriba)",
      "description": "string",
      "taxBase": "number",
      "taxAmount": "number",
      "rate": "number|null"
    }
  ]
}

IMPORTANTE PARA CAE: Busca el CAE (Código de Autorización Electrónica) que es un número de 14 dígitos. También busca la fecha de vencimiento del CAE.

INSTRUCCIONES CRÍTICAS PARA IMPUESTOS:
1. Revisa TODAS las páginas del documento si hay múltiples
2. Los totales e impuestos suelen estar al final del documento
3. Busca el CAE en todas las páginas
4. Identifica CADA línea de impuesto por separado en la factura
5. Compara la descripción del impuesto en la factura con la lista de códigos disponibles arriba
6. Usa EXACTAMENTE el código (campo "code") que corresponda según la descripción y tasa

REGLAS ESPECÍFICAS PARA PERCEPCIONES:
- CUALQUIER percepción de Ingresos Brutos (IIBB) debe usar el código "52", sin excepciones
- Esto incluye: "Percepción IIBB", "Percepción Ingresos Brutos", "Percep I.B.", "Percep I.B. SIRCREB", "Percepción SIRCREB", o cualquier variación
- NUNCA uses el código "59" para percepciones de Ingresos Brutos (ese es un impuesto bancario que no aparece en estos comprobantes)
- Para percepciones de IVA, usa el código "10"
- Para percepciones de Ganancias, usa el código correspondiente si está disponible

IMPORTANTE - EXTRACCIÓN DE IMPORTES (CRÍTICO):

═══════════════════════════════════════════════════════════════════════════════
SECCIÓN 1: CÓMO EXTRAER taxBase (BASE IMPONIBLE) CORRECTAMENTE
═══════════════════════════════════════════════════════════════════════════════

PROCESO OBLIGATORIO PARA EXTRAER taxBase DE IVA:

1. LOCALIZA LA TABLA DE IVA EN LA FACTURA:
   - Busca al final del documento (después de productos/servicios, antes de totales)
   - La tabla puede tener formato de tabla o líneas de texto
   - Busca encabezados como: "Alicuota", "Base Imponible", "Base", "Importe", "Impuesto"

2. IDENTIFICA CADA FILA DE LA TABLA:
   - Cada alícuota de IVA tiene su PROPIA FILA independiente
   - Ejemplo de estructura:
     ┌──────────┬──────────────────┬──────────────┐
     │ Alicuota │ Base Imponible   │ Importe      │
     ├──────────┼──────────────────┼──────────────┤
     │ 21%      │ $43.491,75       │ $9.133,27    │  ← FILA 1
     │ 10.5%    │ $5.681,16        │ $596,52      │  ← FILA 2
     └──────────┴──────────────────┴──────────────┘

3. PARA IVA 21% (taxCode "1"):
   a) Busca la FILA que contiene "21%" o "21,00%" o "IVA 21%" en la columna de alícuota
   b) Lee el valor de la columna "Base Imponible" o "Base" de ESA FILA ESPECÍFICA
   c) Ese valor es el taxBase para IVA 21%
   d) EJEMPLO: Si la fila dice "21% | Base: $43.491,75", entonces taxBase = 43491.75
   e) ❌ NO uses el total "Neto Gravado" ($49.172,91 en el ejemplo)
   f) ❌ NO uses la suma de todas las bases
   g) ✅ USA SOLO el valor de la columna "Base" de la fila de 21%

4. PARA IVA 10.5% (taxCode "2"):
   a) Busca la FILA que contiene "10.5%" o "10,50%" o "IVA 10.5%" en la columna de alícuota
   b) Lee el valor de la columna "Base Imponible" o "Base" de ESA FILA ESPECÍFICA
   c) Ese valor es el taxBase para IVA 10.5%
   d) EJEMPLO: Si la fila dice "10.5% | Base: $5.681,16", entonces taxBase = 5681.16
   e) ❌ NO uses el total "Neto Gravado"
   f) ❌ NO uses el mismo valor que usaste para IVA 21%
   g) ✅ USA SOLO el valor de la columna "Base" de la fila de 10.5%

5. VALIDACIÓN POST-EXTRACCIÓN:
   - Si hay múltiples alícuotas, la SUMA de todos los taxBase debe ser ≈ netTaxed
   - Pero cada taxBase individual debe ser diferente (a menos que sea el único IVA)
   - Si todos los taxBase son iguales al netTaxed, ESTÁS EXTRAYENDO MAL

═══════════════════════════════════════════════════════════════════════════════
SECCIÓN 2: CÓMO CALCULAR taxAmount (MONTO DEL IMPUESTO)
═══════════════════════════════════════════════════════════════════════════════

REGLA ABSOLUTA: taxAmount = taxBase * (rate / 100)

PARA IVA CON TASA CONOCIDA:
- IVA 21% (taxCode "1"): taxAmount = taxBase * 0.21
- IVA 10.5% (taxCode "2"): taxAmount = taxBase * 0.105
- IVA 27%: taxAmount = taxBase * 0.27
- IVA 5%: taxAmount = taxBase * 0.05
- IVA 2.5%: taxAmount = taxBase * 0.025

EJEMPLO PRÁCTICO:
- Si taxBase = 43491.75 y rate = 21
- Entonces taxAmount = 43491.75 * 0.21 = 9133.2675 ≈ 9133.27
- ❌ NO uses el valor "Imp: $9.133,27" que aparece en la factura
- ✅ SIEMPRE calcula: taxAmount = taxBase * (rate / 100)

PARA PERCEPCIONES (rate = null):
- Si no hay tasa, usa el valor que aparece explícitamente en la factura
- taxBase puede ser el subtotal o un monto específico según la factura

═══════════════════════════════════════════════════════════════════════════════
SECCIÓN 3: EJEMPLOS COMPLETOS PASO A PASO
═══════════════════════════════════════════════════════════════════════════════

EJEMPLO 1 - FACTURA CON MÚLTIPLES ALÍCUOTAS DE IVA:

Factura muestra:
- Neto Gravado: $49.172,91
- Tabla de IVA:
  ┌──────────┬──────────────────┬──────────────┐
  │ 21%      │ $43.491,75       │ $9.133,27    │
  │ 10.5%    │ $5.681,16        │ $596,52      │
  └──────────┴──────────────────┴──────────────┘

RESPUESTA CORRECTA:
{
  "taxes": [
    {
      "taxCode": "1",
      "description": "IVA 21%",
      "taxBase": 43491.75,        ← De la fila de 21%
      "taxAmount": 9133.27,       ← Calculado: 43491.75 * 0.21
      "rate": 21
    },
    {
      "taxCode": "2",
      "description": "IVA 10.5%",
      "taxBase": 5681.16,         ← De la fila de 10.5%
      "taxAmount": 596.52,        ← Calculado: 5681.16 * 0.105
      "rate": 10.5
    }
  ]
}

RESPUESTA INCORRECTA (NO HAGAS ESTO):
{
  "taxes": [
    {
      "taxCode": "1",
      "taxBase": 49172.91,        ← ❌ ERROR: Usó el netTaxed total
      "taxAmount": 10326.31,      ← ❌ ERROR: Calculado desde base incorrecta
    }
  ]
}

EJEMPLO 2 - FACTURA CON UNA SOLA ALÍCUOTA DE IVA:

Factura muestra:
- Neto Gravado: $42.060.284,43
- Tabla de IVA:
  ┌──────────┬──────────────────────┬──────────────┐
  │ 21%      │ $42.060.284,43       │ $8.832.659,73│
  └──────────┴──────────────────────┴──────────────┘

RESPUESTA CORRECTA:
{
  "taxes": [
    {
      "taxCode": "1",
      "description": "IVA 21%",
      "taxBase": 42060284.43,     ← De la fila de 21% (puede coincidir con netTaxed si es único IVA)
      "taxAmount": 8832659.73,    ← Calculado: 42060284.43 * 0.21
      "rate": 21
    }
  ]
}

EJEMPLO 3 - PERCEPCIONES:

Si aparece "Percepción IVA" o "Percepción IVA 1.5%" con monto "$6.639,10":
→ taxCode: "10", description: "Percepción IVA 1.5%", taxBase: 234751.49, taxAmount: 6639.10, rate: null

Si aparece "Percepción IIBB", "Percepción Ingresos Brutos", "Percep I.B. 3%", "Percep I.B. SIRCREB" o cualquier variación de percepción de Ingresos Brutos con monto "$7.870,31":
→ taxCode: "52", description: "Percepción I.B. 3%" (o la descripción exacta que aparece en la factura), taxBase: 262343.75, taxAmount: 7870.31, rate: null

═══════════════════════════════════════════════════════════════════════════════
SECCIÓN 4: CHECKLIST ANTES DE EXTRAER taxBase
═══════════════════════════════════════════════════════════════════════════════

Antes de extraer taxBase, verifica:
☐ ¿Encontré la tabla de IVA en la factura?
☐ ¿Identifiqué cada fila de la tabla por separado?
☐ ¿Estoy usando el valor de la columna "Base" de la fila correcta?
☐ ¿El taxBase que extraje corresponde a la alícuota correcta?
☐ Si hay múltiples alícuotas, ¿cada una tiene su propio taxBase diferente?
☐ ¿La suma de todos los taxBase es aproximadamente igual al netTaxed?
☐ ¿NO estoy usando el netTaxed total como taxBase de un impuesto individual?

═══════════════════════════════════════════════════════════════════════════════

IMPORTANTE: Si un impuesto aparece en la factura, SIEMPRE debe tener un taxAmount mayor que 0. 
Si no puedes encontrar el monto explícito en la factura, usa null (NO calcules el monto).

Usa null si no encuentras un dato. Usa números con punto decimal (no comas).
`;
}

function extractOutputText(data: any): string {
  // Verificar estructura básica
  if (!data) {
    throw new Error('OpenAI no devolvió datos');
  }

  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    console.error('[Supabase Edge Function] Estructura inesperada - no hay choices:', JSON.stringify(data, null, 2));
    throw new Error('OpenAI no devolvió choices en la respuesta');
  }

  const firstChoice = data.choices[0];
  if (!firstChoice?.message) {
    console.error('[Supabase Edge Function] Estructura inesperada - no hay message:', JSON.stringify(firstChoice, null, 2));
    throw new Error('OpenAI no devolvió message en la respuesta');
  }

  const messageContent = firstChoice.message.content;

  if (!messageContent) {
    console.error('[Supabase Edge Function] Estructura inesperada - no hay content:', JSON.stringify(firstChoice.message, null, 2));
    throw new Error('OpenAI no devolvió content en el message');
  }

  // Si el contenido es un array (puede pasar con vision models), extraer el texto
  if (Array.isArray(messageContent)) {
    const textParts = messageContent
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join(' ');
    
    if (textParts) {
      return cleanJsonText(textParts);
    }
    throw new Error('OpenAI devolvió un array de contenido sin partes de texto');
  }

  if (typeof messageContent === 'string' && messageContent.trim()) {
    return cleanJsonText(messageContent);
  }

  throw new Error(`OpenAI devolvió un tipo de contenido inesperado: ${typeof messageContent}`);
}

function cleanJsonText(text: string): string {
  let cleaned = text.trim();

  // Remover markdown code blocks
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '');
  }

  // Remover texto antes del primer { si existe
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) {
    cleaned = cleaned.substring(firstBrace);
  }

  // Remover texto después del último } si existe
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.substring(0, lastBrace + 1);
  }

  return cleaned.trim();
}

