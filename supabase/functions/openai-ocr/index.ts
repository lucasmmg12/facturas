// Supabase Edge Function: openai-ocr
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

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
2. "TIQUE FACTURA A" o "TIQUE FACTURA B" son válidos.
3. Si es "C" o "TIQUE FACTURA C":
   - El "invoiceType" es "FACTURA_C".
   - El "invoiceTypeCode" es "011".
   - NO HAY IVA DISCRIMINADO. "ivaAmount" DEBE SER 0.
   - Todo el monto suele ser "Subtotal", ponlo en "netUntaxed" o "totalAmount".
   - Si dice "Responsable Monotributo", es Tipo C.
4. Si es "A" o "TIQUE FACTURA A":
   - El "invoiceType" es "FACTURA_A".
   - Busca IVA discriminado (21%, 10.5%, 27%).

FECHA (MUY IMPORTANTE):
- Busca explícitamente "Fecha" o "Fecha Emisión".
- Formato esperado: YYYY-MM-DD.
- IGNORA números de CUIT (ej: 30-12345678-9) o Ingresos Brutos para la fecha.

EMISOR (PROVEEDOR):
- 🎯 PRIORIDAD ABSOLUTA: Busca el texto que está INMEDIATAMENTE al lado de "Razón Social:". Ese es el nombre.
- Si no está "Razón Social:", busca el texto más grande/negrita arriba a la izquierda.
- ⛔ PROHIBIDO: NUNCA devuelvas "Domicilio Comercial" como nombre. "Domicilio Comercial" es una etiqueta de dirección, IGNÓRALA.
- Si el nombre extraído es "Domicilio Comercial", BUSCA DE NUEVO.
- El CUIT del emisor suele estar cerca de "CUIT:".
- Si el CUIT es 30-60992686-0 (Sanatorio Argentino), ESE ES EL RECEPTOR, busca el OTRO CUIT.

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

MONTOS Y NÚMEROS (CRÍTICO):
- ⚠️ CUIDADO con los puntos y comas.
- Si ves '325077.96', interpreta que el punto es DECIMAL => 325077.96.
- Si ves '325.077,96', interpreta que la coma es DECIMAL => 325077.96.
- Regla de oro: Si los últimos 2 dígitos están separados por un punto o coma, ES DECIMAL.
- NO conviertas '325077.96' en 32 millones.
- Devuelve SIEMPRE números (number), no strings.

EXTRAE SOLO JSON.
`.trim();

    const imageContent = base64Array.map(b64 => ({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${b64}`,
        detail: "high" // Forzar análisis de alta resolución
      }
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
        max_tokens: 4000, // Aumentar tokens para respuestas detalladas
        temperature: 0,
        response_format: { type: "json_object" } // Forzar JSON válido a nivel API
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
      JSON.stringify({
        success: true,
        data: content,
        usage: aiData.usage,
        meta: {
          version: "v2025-01-19-FIX-NUMBERS",
          timestamp: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
