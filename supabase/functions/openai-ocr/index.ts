// Supabase Edge Function: openai-ocr
// Version: Stable with Error Propagation (Always returns 200 to client to avoid opaque errors)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRRequest {
  base64: string | string[];
  mimeType: string;
}

Deno.serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Falta el header de autorización');
    }

    // Usar Service Role solo si es absolutamente necesario, aquí usamos anon key + auth header para validar usuario
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sesión expirada o inválida. Recarga la página.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 } // Return 200 to see error in client
      );
    }

    if (!OPENAI_API_KEY) {
      throw new Error('Configuración incompleta: Falta OPENAI_API_KEY en el servidor.');
    }

    // 3. Parse Body
    let requestData: OCRRequest;
    try {
      requestData = await req.json();
    } catch {
      throw new Error('El cuerpo de la solicitud no es un JSON válido');
    }

    if (!requestData.base64 || !requestData.mimeType) {
      throw new Error('Faltan datos de la imagen (base64 o mimeType)');
    }

    const base64Array = Array.isArray(requestData.base64) ? requestData.base64 : [requestData.base64];

    // 4. Build Prompt (Hardcoded for stability)
    const taxCodesList = [
      { code: '1', description: 'IVA TASA GENERAL (21%)', rate: 21 },
      { code: '2', description: 'IVA TASA REDUCIDA (10.5%)', rate: 10.5 },
      { code: 'IVA_27', description: 'IVA 27%', rate: 27 },
      { code: 'PERC_IIBB', description: 'PERCEPCIÓN IIBB', rate: null },
      { code: 'PERC_IVA', description: 'PERCEPCIÓN IVA', rate: null },
    ];

    const prompt = `
Extrae los datos de esta factura y responde SOLO con JSON.

IMPUESTOS DISPONIBLES (Úsalos en "taxCode" si coinciden):
${taxCodesList.map(t => `- ${t.code}: ${t.description} ${t.rate ? `(${t.rate}%)` : ''}`).join('\n')}

ESTRUCTURA JSON ESPERADA:
{
  "supplierCuit": "string (solo números, ej: 30123456789)",
  "supplierName": "string",
  "invoiceType": "string (A, B, C, M, Nota de Credito A, etc)",
  "invoiceTypeCode": "string (ej: 001, 006, 011)",
  "pointOfSale": "string (ej: 00005)",
  "invoiceNumber": "string (ej: 00000123. NO incluyas el punto de venta aquí)",
  "issueDate": "string (YYYY-MM-DD)",
  "receiverCuit": "string",
  "receiverName": "string",
  "netTaxed": number (Subtotal neto gravado),
  "netUntaxed": number (Conceptos no gravados),
  "netExempt": number (Exento),
  "ivaAmount": number (Total IVA),
  "otherTaxesAmount": number (Total otros tributos/percepciones),
  "totalAmount": number (Total final),
  "currency": "string (ARS o USD)",
  "exchangeRate": number (1 si es ARS),
  "caiCae": "string",
  "caiCaeExpiration": "string (YYYY-MM-DD)",
  "taxes": [
    { 
      "taxCode": "string o null", 
      "description": "string (nombre real del impuesto en factura)",
      "taxBase": number (base imponible), 
      "taxAmount": number (monto del impuesto), 
      "rate": number (alícuota, ej: 21, 10.5, 27)
    }
  ]
}

REGLAS:
1. Extrae TODOS los ítems de la sección "Liquidación de Impuestos", "Tributos" o "Detalle IVA".
2. Si ves "Percepción IIBB" o "Ingresos Brutos", inclúyelo con taxCode "PERC_IIBB".
3. Si el "Neto Gravado" no aparece explícitamente, calcúlalo sumando las bases de los impuestos IVA.
4. Si el OCR falla en algún número, intenta inferirlo (ej: Total = Neto + IVA).
5. Receptor: Si ves CUIT 30609926860 (Sanatorio Argentino), ese es el RECEPTOR, NO el emisor.
`.trim();

    // 5. Call OpenAI
    const imageContent = base64Array.map(b64 => ({
      type: 'image_url',
      image_url: { url: `data:${requestData.mimeType};base64,${b64}` }
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
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imageContent
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0,
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI Error:', errText);
      return new Response(
        JSON.stringify({ success: false, error: `Error de OpenAI (${response.status}): ${errText}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    // Clean JSON markdown
    let cleanJson = content.replace(/```json\n?|```/g, '').trim();
    // Sometimes there is text before/after
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }

    return new Response(
      JSON.stringify({ success: true, data: cleanJson, usage: aiData.usage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err) {
    console.error('Edge Function Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Error desconocido en el servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 } // Always 200 to allow client parsing
    );
  }
});
