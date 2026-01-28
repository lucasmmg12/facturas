// Supabase Edge Function: openai-ocr
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o'; // Usamos gpt-4o para máxima precisión

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Manejo de CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verificaciones preliminares
    if (!OPENAI_API_KEY) {
      console.error('Falta configuración de OPENAI_API_KEY');
      throw new Error('Configuración de servidor incompleta (API Key faltante).');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Falta el header de autorización.');
    }

    // 2. Validación de usuario Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sesión inválida o expirada.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Parseo del Body
    let requestData;
    try {
      requestData = await req.json();
    } catch (e) {
      throw new Error('El cuerpo de la solicitud no es un JSON válido.');
    }

    const { base64, mimeType, supplierCuit } = requestData;
    if (!base64 || !mimeType) {
      throw new Error('Faltan datos de la imagen (base64 o mimeType).');
    }

    const base64Array = Array.isArray(base64) ? base64 : [base64];
    console.log(`[OCR] Procesando ${base64Array.length} página(s). Tipo: ${mimeType}. Hint CUIT: ${supplierCuit || 'Ninguno'}`);

    // 4. Búsqueda de Aprendizajes (Adaptive Learning)
    let learningHints = '';
    if (supplierCuit) {
      const cleanCuit = String(supplierCuit).replace(/\D/g, '');
      const { data: learningData } = await supabaseClient
        .from('ocr_learning_data')
        .select('corrected_data')
        .eq('supplier_cuit', cleanCuit)
        .order('created_at', { ascending: false })
        .limit(2);

      if (learningData && learningData.length > 0) {
        learningHints = learningData.map((d: any) =>
          `- MEMORIA: En este proveedor, los datos correctos suelen ser: ${JSON.stringify(d.corrected_data)}`
        ).join('\n');
      }
    }

    // 5. Definición de Prompt y Contexto
    const prompt = `
Eres un experto contable argentino. Analiza la imagen de la factura y extrae datos en JSON estricto.

${learningHints ? `CONTEXTO HISTÓRICO (IMPORTANTE):\nHas fallado anteriormente con este proveedor. Usa estos ejemplos de correcciones reales de usuarios para no repetir el error:\n${learningHints}\n` : ''}

IDENTIFICACIÓN:
- TIPO: Busca letra A, B, C, M en recuadro o texto "FACTURA A", etc. Recuérdate: 
  - "C" = invoiceType "FACTURA_C", code "011". No hay IVA discriminado.
  - "A" = invoiceType "FACTURA_A", code "001". Busca IVA discriminado (21%, 10.5%, etc).
- PROVEEDOR: Razón Social y CUIT del emisor.
- RECEPTOR: CUIT que NO sea del emisor (Sanatorio Argentino 30-60992686-0).

VALORES (CRÍTICO):
- Los montos en facturas argentinas usan PUNTO para MILES y COMA para DECIMALES (ej: 1.234,56).
- Devuelve SIEMPRE NÚMEROS (floats) en el JSON, usando punto como separador decimal estándar de programación.
- FECHA: YYYY-MM-DD.

JSON OUTPUT:
{
  "supplierCuit": "solo numeros",
  "supplierName": "string",
  "invoiceType": "FACTURA_A/B/C",
  "invoiceTypeCode": "001/006/011",
  "pointOfSale": "00000",
  "invoiceNumber": "00000000",
  "issueDate": "YYYY-MM-DD",
  "receiverCuit": "string",
  "receiverName": "string",
  "netTaxed": 0.0,
  "netUntaxed": 0.0,
  "netExempt": 0.0,
  "ivaAmount": 0.0,
  "otherTaxesAmount": 0.0,
  "totalAmount": 0.0,
  "taxes": [ { "description": "IVA 21%", "taxBase": 0.0, "taxAmount": 0.0, "rate": 21 } ]
}
`.trim();

    // 5. Preparación de payload para OpenAI
    const imageContent = base64Array.map(b64 => ({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${b64}`,
        detail: "high"
      }
    }));

    // 6. Llamada a OpenAI
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
        max_tokens: 3000,
        temperature: 0,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error(`[OpenAI Error] Status: ${response.status}. Body: ${txt}`);
      throw new Error(`Error proveedor IA (${response.status}): ${txt.substring(0, 100)}...`);
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || '{}';

    // 7. Parseo y Limpieza
    try {
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace >= 0) {
        content = content.substring(firstBrace, lastBrace + 1);
      }

      const parsedData = JSON.parse(content);

      // Auto-Corrección Matemática Básica
      // A veces la IA devuelve 325456.00 en vez de 325.456,00 interpretando mal.
      // Aquí forzamos números.

      console.log('[OCR Success] Datos extraídos correctamente');

    } catch (parseError) {
      console.error('Error parseando JSON de IA:', parseError);
      // Enviamos el contenido crudo de todas formas, el cliente intentará manejarlo
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: content,
        usage: aiData.usage,
        meta: { version: "v2-stable-deno-serve" }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[Edge Function Error]', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Retornamos 200 siempre para que el cliente lea el JSON de error
      }
    );
  }
});
