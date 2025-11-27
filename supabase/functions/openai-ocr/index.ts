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
      max_tokens: 2000, // Aumentado para facturas complejas con múltiples páginas
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
      console.log('[Supabase Edge Function] Texto extraído (primeros 500 chars):', outputText.substring(0, 500));
    } catch (extractError) {
      console.error('[Supabase Edge Function] Error al extraer texto:', extractError);
      console.error('[Supabase Edge Function] Respuesta completa de OpenAI:', JSON.stringify(data, null, 2));
      throw new Error(`Error al extraer contenido de OpenAI: ${extractError instanceof Error ? extractError.message : 'Error desconocido'}`);
    }

    // Intentar parsear como JSON para validar
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(outputText);
      console.log('[Supabase Edge Function] JSON parseado exitosamente');
    } catch (parseError) {
      console.error('[Supabase Edge Function] Error al parsear JSON:', parseError);
      console.error('[Supabase Edge Function] Texto completo recibido:', outputText);
      // Intentar extraer JSON si está dentro de markdown o texto adicional
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedJson = JSON.parse(jsonMatch[0]);
          console.log('[Supabase Edge Function] JSON extraído de texto con markdown');
          outputText = jsonMatch[0]; // Usar el JSON extraído
        } catch {
          throw new Error(`OpenAI devolvió un formato inesperado. No se pudo parsear como JSON. Texto recibido: ${outputText.substring(0, 200)}...`);
        }
      } else {
        throw new Error(`OpenAI devolvió un formato inesperado. No se encontró JSON válido. Texto recibido: ${outputText.substring(0, 200)}...`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: outputText,
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

IMPORTANTE - EXTRACCIÓN DE IMPORTES:
- Para CADA impuesto que identifiques, DEBES extraer TANTO la base imponible (taxBase) COMO el monto del impuesto (taxAmount)
- Para IVA: busca la columna o línea que muestre el monto del IVA calculado. Ejemplo: si dice "Base: $10.000, Imp: $2.100", entonces taxBase=10000 y taxAmount=2100
- Para percepciones: el taxAmount es el monto de la percepción que aparece en la factura
- NUNCA dejes taxAmount en 0 o null si el impuesto aparece en la factura con un monto
- Si hay una tabla de impuestos al final del documento, revisa CADA fila y extrae ambos valores (base y monto)

7. Si hay múltiples alícuotas de IVA en la misma factura, crea un registro separado para cada uno
8. La base imponible (taxBase) es el monto sobre el cual se calculó el impuesto
9. El taxAmount es el monto del impuesto calculado - DEBE ser mayor que 0 si el impuesto aparece en la factura
10. El rate debe coincidir con la tasa del código seleccionado

EJEMPLOS:
Si en la factura aparece una tabla de IVA como:
"IVA 21% | Base: $43.491,75 | Imp: $9.133,27"
→ taxCode: "1", description: "IVA 21%", taxBase: 43491.75, taxAmount: 9133.27, rate: 21

Si aparece "IVA 10.5%" con "Base: $5.681,16 | Imp: $596,52":
→ taxCode: "2", description: "IVA 10.5%", taxBase: 5681.16, taxAmount: 596.52, rate: 10.5

Si aparece "Percepción IVA" o "Percepción IVA 1.5%" con monto "$6.639,10":
→ taxCode: "10", description: "Percepción IVA 1.5%", taxBase: 234751.49, taxAmount: 6639.10, rate: null

Si aparece "Percepción IIBB", "Percepción Ingresos Brutos", "Percep I.B. 3%", "Percep I.B. SIRCREB" o cualquier variación de percepción de Ingresos Brutos con monto "$7.870,31":
→ taxCode: "52", description: "Percepción I.B. 3%" (o la descripción exacta que aparece en la factura), taxBase: 262343.75, taxAmount: 7870.31, rate: null

IMPORTANTE: Si un impuesto aparece en la factura, SIEMPRE debe tener un taxAmount mayor que 0. Si solo ves la base pero no el monto, calcula el monto basándote en la tasa del impuesto.

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

