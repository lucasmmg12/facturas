// Supabase Edge Function para procesar OCR con OpenAI
// Actúa como proxy para evitar problemas de CORS y proteger la API key

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

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
    console.log('[Supabase Edge Function] Iniciando ejecución de la función...');

    // Verificar autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[Supabase Edge Function] Error: No authorization header');
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
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('[Supabase Edge Function] Error de autenticación:', userError);
      throw new Error('Usuario no autenticado o sesión inválida');
    }

    // Verificar que tenemos la API key de OpenAI
    if (!OPENAI_API_KEY) {
      console.error('[Supabase Edge Function] Error: OPENAI_API_KEY no configurada');
      throw new Error('OPENAI_API_KEY no configurada en el servidor');
    }

    // Obtener el body
    let requestData: OCRRequest;
    try {
      requestData = await req.json();
    } catch (e) {
      console.error('[Supabase Edge Function] Error al parsear JSON del request:', e);
      throw new Error('El cuerpo de la solicitud no es un JSON válido');
    }

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
    const imageContent = base64Array.map((imgBase64, index) => {
      let cleanBase64 = imgBase64;
      if (imgBase64.includes(',')) {
        cleanBase64 = imgBase64.split(',')[1] || imgBase64;
      }

      if (!cleanBase64 || cleanBase64.length === 0) {
        throw new Error(`La imagen de la página ${index + 1} está vacía`);
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
            ...imageContent,
          ],
        },
      ],
      max_tokens: 6000,
    };

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
      console.error('[Supabase Edge Function] Error de OpenAI:', errorText);
      throw new Error(`OpenAI falló (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let outputText = extractOutputText(data);

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
    console.error('[Supabase Edge Function] Catch error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error interno desconocido',
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
  let taxCodesSection = '';
  if (taxCodes.length > 0) {
    taxCodesSection = `\n\nCÓDIGOS DE IMPUESTOS DISPONIBLES:\n`;
    taxCodes.forEach((tc) => {
      const rateInfo = tc.rate !== null ? ` (tasa: ${tc.rate}%)` : '';
      taxCodesSection += `- Código "${tc.code}": ${tc.description}${rateInfo}\n`;
    });
  }

  return `
Extrae los datos del comprobante argentino adjunto y responde SOLO con JSON válido.
${hasMultiplePages ? '\nEste comprobante tiene MÚLTIPLES PÁGINAS. Revisa todas para obtener totales e impuestos.\n' : ''}
${taxCodesSection}

Estructura:
{
  "supplierCuit": "string",
  "supplierName": "string",
  "invoiceType": "string",
  "pointOfSale": "string",
  "invoiceNumber": "string",
  "issueDate": "YYYY-MM-DD",
  "netTaxed": number,
  "netUntaxed": number,
  "netExempt": number,
  "ivaAmount": number,
  "otherTaxesAmount": number,
  "totalAmount": number,
  "caiCae": "string",
  "caiCaeExpiration": "YYYY-MM-DD",
  "taxes": [
    { "taxCode": "string", "taxBase": number, "taxAmount": number, "rate": number }
  ]
}
`;
}

function extractOutputText(data: any): string {
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No se recibió contenido de OpenAI');

  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '');
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
}
