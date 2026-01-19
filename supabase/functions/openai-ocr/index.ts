// Supabase Edge Function: openai-ocr
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta el header de autorización');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      // Return 200 with error property to be handled by client gracefully
      return new Response(
        JSON.stringify({ success: false, error: 'Sesión inválida.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENAI_API_KEY) throw new Error('Falta configuración de OPENAI_API_KEY');

    let requestData;
    try {
      requestData = await req.json();
    } catch {
      throw new Error('JSON inválido en el body');
    }

    const { base64, mimeType } = requestData;
    if (!base64 || !mimeType) throw new Error('Faltan datos de imagen');

    const base64Array = Array.isArray(base64) ? base64 : [base64];

    // DEFINICIÓN HARDCODED DE IMPUESTOS PARA ROBUSTEZ
    const taxCodesList = [
      { code: '1', description: 'IVA 21%', rate: 21 },
      { code: '2', description: 'IVA 10.5%', rate: 10.5 },
      { code: 'IVA_27', description: 'IVA 27%', rate: 27 },
      { code: 'PERC_IIBB', description: 'PERCEPCIÓN IIBB', rate: null },
      { code: 'PERC_IVA', description: 'PERCEPCIÓN IVA', rate: null },
    ];

    const prompt = `
Analiza la imagen de la factura argentina y devuelve un JSON.

REGLAS CRÍTICAS - TIPO DE FACTURA:
1. Mira la letra en el recuadro superior (A, B, C, M).
2. Si es "C" (Factura C):
   - El "invoiceType" es "FACTURA_C".
   - El "invoiceTypeCode" es "011".
   - NO HAY IVA DISCRIMINADO. "ivaAmount" DEBE SER 0.
   - Todo el monto suele ser "Subtotal", ponlo en "totalAmount".
   - NO intentes calcular IVA del total.
   - Si dice "Responsable Monotributo", confirma que es Tipo C.

3. Si es "A" (Factura A):
   - El "invoiceType" es "FACTURA_A".
   - Busca IVA discriminado (21%, 10.5%, 27%).

ESTRUCTURA JSON:
{
  "supplierCuit": "string (solo números)",
  "supplierName": "string",
  "invoiceType": "string (FACTURA_A, FACTURA_C, FACTURA_B, etc)",
  "invoiceTypeCode": "string (001, 006, 011, etc)",
  "pointOfSale": "string (5 dígitos)",
  "invoiceNumber": "string (8 dígitos)",
  "issueDate": "string (YYYY-MM-DD)",
  "receiverCuit": "string",
  "receiverName": "string",
  "netTaxed": number (Neto Gravado),
  "netUntaxed": number (No Gravado),
  "netExempt": number (Exento),
  "ivaAmount": number (IVA Total),
  "otherTaxesAmount": number (Otros Impuestos/Percepciones),
  "totalAmount": number (Total Final),
  "currency": "string (ARS/USD)",
  "exchangeRate": number,
  "taxes": [
    { "taxCode": "string", "description": "string", "taxBase": number, "taxAmount": number, "rate": number }
  ]
}

IMPUESTOS (Solo si están explícitos en la factura):
${JSON.stringify(taxCodesList)}

EXTRAE SOLO JSON.
`.trim();

    const imageContent = base64Array.map(b64 => ({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${b64}` }
    }));

    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }, ...imageContent] }
        ],
        max_tokens: 2000,
        temperature: 0,
      })
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`OpenAI Error ${response.status}: ${txt}`);
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || '{}';

    // Limpieza de JSON
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace >= 0) {
      content = content.substring(firstBrace, lastBrace + 1);
    }

    return new Response(
      JSON.stringify({ success: true, data: content, usage: aiData.usage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
