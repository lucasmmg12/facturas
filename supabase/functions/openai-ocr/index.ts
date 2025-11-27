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

    // Validar que las imágenes no estén vacías
    for (let i = 0; i < base64Array.length; i++) {
      if (!base64Array[i] || base64Array[i].length === 0) {
        throw new Error(`La página ${i + 1} está vacía`);
      }
    }

    const prompt = buildPrompt(pagesCount > 1);

    // Construir el contenido con todas las imágenes
    const imageContent = base64Array.map((imgBase64) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${mimeType};base64,${imgBase64}`,
      },
    }));

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

    console.log('[Supabase Edge Function] Request body preparado:', {
      model: requestBody.model,
      imagesCount: imageContent.length,
      promptLength: prompt.length,
      maxTokens: requestBody.max_tokens
    });

    console.log('[Supabase Edge Function] Enviando solicitud a OpenAI...');

    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Supabase Edge Function] Error de OpenAI:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        imagesCount: imageContent.length,
        totalBase64Size: base64Array.reduce((sum, b) => sum + b.length, 0),
      });

      let errorDetail = '';
      let errorType = '';
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.error?.code || errorText;
        errorType = errorJson.error?.type || '';
        console.error('[Supabase Edge Function] Detalles del error:', {
          message: errorJson.error?.message,
          type: errorJson.error?.type,
          code: errorJson.error?.code,
          param: errorJson.error?.param,
        });
      } catch {
        errorDetail = errorText || response.statusText;
      }

      // Si es error 400, puede ser problema de formato, tamaño o límites
      if (response.status === 400) {
        const totalSize = base64Array.reduce((sum, b) => sum + b.length, 0);
        const sizeMB = (totalSize * 3) / 4 / 1024 / 1024; // Aproximación del tamaño en MB
        throw new Error(
          `OpenAI rechazó la solicitud (400): ${errorDetail}. ` +
          `Imágenes: ${pagesCount}, Tamaño total aprox: ${sizeMB.toFixed(2)}MB. ` +
          `Verifica el formato de las imágenes o reduce el tamaño/resolución.`
        );
      }

      throw new Error(`OpenAI falló (${response.status}): ${errorDetail}`);
    }

    const data = await response.json();
    console.log('[Supabase Edge Function] Respuesta de OpenAI recibida exitosamente');

    // Extraer el contenido
    const outputText = extractOutputText(data);

    // Intentar parsear como JSON para validar
    try {
      JSON.parse(outputText);
    } catch {
      console.error('[Supabase Edge Function] OpenAI no devolvió JSON válido:', outputText);
      throw new Error('OpenAI devolvió un formato inesperado');
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

function buildPrompt(hasMultiplePages: boolean = false): string {
  const multiplePagesWarning = hasMultiplePages 
    ? `\n\n⚠️ IMPORTANTE: Este comprobante tiene MÚLTIPLES PÁGINAS. Debes revisar TODAS las páginas.\nLos totales, impuestos y CAE suelen estar en la ÚLTIMA PÁGINA. Revisa cuidadosamente cada página para extraer todos los datos.\n`
    : '';

  return `
Extrae los datos del comprobante argentino adjunto y responde SOLO con JSON válido, sin texto adicional.
${multiplePagesWarning}
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
      "taxCode": "IVA_21|IVA_10_5|IVA_27|IVA_5|IVA_2_5|PERC_IIBB|PERC_IVA|PERC_GANANCIAS|EXENTO|NO_GRAVADO|OTRO",
      "description": "string",
      "taxBase": "number",
      "taxAmount": "number",
      "rate": "number|null"
    }
  ]
}

IMPORTANTE PARA CAE: Busca el CAE (Código de Autorización Electrónica) que es un número de 14 dígitos. También busca la fecha de vencimiento del CAE.

INSTRUCCIONES CRÍTICAS PARA IMPUESTOS:
1. Identifica CADA línea de impuesto por separado en la factura
2. Para IVA, especifica la alícuota EXACTA usando el taxCode correcto:
   - Si dice "IVA 21%" o "21.00%" → taxCode: "IVA_21", rate: 21
   - Si dice "IVA 10.5%" o "10.50%" → taxCode: "IVA_10_5", rate: 10.5
   - Si dice "IVA 27%" → taxCode: "IVA_27", rate: 27
   - Si dice "IVA 5%" → taxCode: "IVA_5", rate: 5
   - Si dice "IVA 2.5%" → taxCode: "IVA_2_5", rate: 2.5
3. Para percepciones y retenciones:
   - Percepción IIBB o Ingresos Brutos → taxCode: "PERC_IIBB"
   - Percepción IVA → taxCode: "PERC_IVA"
   - Percepción Ganancias → taxCode: "PERC_GANANCIAS"
4. Para otros impuestos:
   - Exento → taxCode: "EXENTO"
   - No Gravado → taxCode: "NO_GRAVADO"
   - Cualquier otro impuesto no identificado → taxCode: "OTRO"
5. Si hay múltiples alícuotas de IVA en la misma factura (ej: productos con 21% y 10.5%), crea un registro separado para cada uno
6. La base imponible (taxBase) es el monto sobre el cual se calculó el impuesto
7. El taxAmount es el monto del impuesto calculado

EJEMPLO de factura con IVA mixto:
"taxes": [
  { "taxCode": "IVA_21", "description": "IVA 21%", "taxBase": 10000, "taxAmount": 2100, "rate": 21 },
  { "taxCode": "IVA_10_5", "description": "IVA 10.5%", "taxBase": 5000, "taxAmount": 525, "rate": 10.5 },
  { "taxCode": "PERC_IIBB", "description": "Percepción IIBB", "taxBase": 0, "taxAmount": 150, "rate": null }
]

Usa null si no encuentras un dato. Usa números con punto decimal (no comas).
`;
}

function extractOutputText(data: any): string {
  if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
    const messageContent = data.choices[0]?.message?.content;

    if (typeof messageContent === 'string' && messageContent.trim()) {
      let cleaned = messageContent.trim();

      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      return cleaned.trim();
    }
  }

  throw new Error('OpenAI no devolvió contenido legible en el formato esperado');
}

