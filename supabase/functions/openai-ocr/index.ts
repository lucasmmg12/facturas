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
  base64: string;
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
    const { base64, mimeType }: OCRRequest = await req.json();

    if (!base64 || !mimeType) {
      throw new Error('Faltan parámetros: base64 y mimeType son requeridos');
    }

    console.log('[Supabase Edge Function] Procesando OCR para usuario:', user.id);
    console.log('[Supabase Edge Function] Tamaño de imagen:', base64.length);

    const prompt = buildPrompt();

    const requestBody = {
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1200,
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
      console.error('[Supabase Edge Function] Error de OpenAI:', {
        status: response.status,
        body: errorText,
      });

      let errorDetail = '';
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorJson.error?.code || errorText;
      } catch {
        errorDetail = errorText || response.statusText;
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

function buildPrompt(): string {
  return `
Extrae los datos del comprobante argentino adjunto y responde SOLO con JSON válido, sin texto adicional.
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
    { "taxType": "string", "taxBase": "number", "taxAmount": "number", "rate": "number|null" }
  ]
}
IMPORTANTE: Busca el CAE (Código de Autorización Electrónica) que es un número de 14 dígitos. También busca la fecha de vencimiento del CAE.
Usa null si no encuentras un dato. Usa números con punto decimal.
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

