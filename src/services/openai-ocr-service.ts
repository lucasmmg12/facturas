// Este servicio delega el OCR y parsing de comprobantes a OpenAI usando el modelo gpt-4.1-mini.
// Convierte el archivo a base64, envía la solicitud y normaliza la respuesta al formato OCRResult.

import type { OCRResult } from './ocr-service';
import { validateCUIT } from '../utils/validators';
import { getInvoiceTypeFromCode } from '../utils/invoice-types';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

type PDFPageProxy = any;

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

const CONFIDENCE_WEIGHTS = {
  supplierCuit: 0.25,
  invoiceType: 0.15,
  pointOfSale: 0.1,
  invoiceNumber: 0.15,
  issueDate: 0.15,
  totalAmount: 0.2,
};

type ParsedTaxes = Array<{
  taxType: string;
  taxBase: number;
  taxAmount: number;
  rate: number | null;
}>;

export async function extractDataWithOpenAI(file: File): Promise<OCRResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('Falta configurar la variable VITE_OPENAI_API_KEY en el archivo .env');
  }

  const { base64, mimeType } = await fileToBase64(file);
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

  if (import.meta.env?.DEV) {
    console.debug('[OpenAI OCR] Enviando solicitud:', {
      model: requestBody.model,
      endpoint: OPENAI_ENDPOINT,
      promptLength: prompt.length,
      imageSize: base64.length,
    });
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OpenAI OCR] Error en la respuesta:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(`OpenAI OCR falló (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (import.meta.env?.DEV) {
    console.debug('[OpenAI OCR] Respuesta completa:', data);
  }

  const outputText = extractOutputText(data);

  let parsed: any;
  try {
    parsed = JSON.parse(outputText);

    if (import.meta.env?.DEV) {
      console.debug('[OpenAI OCR] JSON parseado exitosamente:', parsed);
    }
  } catch (error) {
    console.error('[OpenAI OCR] Error al parsear JSON:', error);
    console.error('[OpenAI OCR] Texto recibido:', outputText);
    throw new Error('OpenAI devolvió un formato inesperado (no JSON válido)');
  }

  const supplierCuit = sanitizeCUIT(parsed.supplierCuit);
  const invoiceTypeCode = normalizeInvoiceTypeCode(parsed.invoiceTypeCode ?? parsed.invoiceType);
  const invoiceType = invoiceTypeCode ? getInvoiceTypeFromCode(invoiceTypeCode) : null;
  const pointOfSale = normalizeString(parsed.pointOfSale);
  const invoiceNumber = normalizeString(parsed.invoiceNumber);
  const issueDate = normalizeString(parsed.issueDate);
  const caiCae = normalizeString(parsed.caiCae ?? parsed.cae ?? parsed.cai);
  const caiCaeExpiration = normalizeDateToISO(
    parsed.caiCaeExpiration ?? parsed.caeExpiration ?? parsed.caiExpiration
  );

  const amounts = {
    netTaxed: normalizeNumber(parsed.netTaxed),
    netUntaxed: normalizeNumber(parsed.netUntaxed),
    netExempt: normalizeNumber(parsed.netExempt),
    ivaAmount: normalizeNumber(parsed.ivaAmount),
    otherTaxesAmount: normalizeNumber(parsed.otherTaxesAmount),
    totalAmount: normalizeNumber(parsed.totalAmount),
  };

  const taxes = normalizeTaxes(parsed.taxes);

  const confidence = calculateConfidence({
    supplierCuit,
    invoiceType,
    pointOfSale,
    invoiceNumber,
    issueDate,
    totalAmount: amounts.totalAmount,
  });

  return {
    supplierCuit,
    supplierName: parsed.supplierName ?? null,
    invoiceType,
    pointOfSale,
    invoiceNumber,
    issueDate,
    receiverCuit: sanitizeCUIT(parsed.receiverCuit),
    receiverName: parsed.receiverName ?? null,
    ...amounts,
    taxes,
    confidence,
    caiCae,
    caiCaeExpiration,
    rawText: outputText,
  };
}

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
  "caiCae": "string|null",
  "caiCaeExpiration": "YYYY-MM-DD|null",
  "netTaxed": "number",
  "netUntaxed": "number",
  "netExempt": "number",
  "ivaAmount": "number",
  "otherTaxesAmount": "number",
  "totalAmount": "number",
  "taxes": [
    { "taxType": "string", "taxBase": "number", "taxAmount": "number", "rate": "number|null" }
  ]
}
Usa null si no encuentras un dato. Usa números con punto decimal.
`;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type === 'application/pdf') {
    return convertPdfToPngBase64(file).then((base64) => ({
      base64,
      mimeType: 'image/png',
    }));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve({ base64, mimeType: file.type || 'application/octet-stream' });
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

GlobalWorkerOptions.workerSrc = pdfWorker;

async function convertPdfToPngBase64(file: File): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('La conversión de PDF a imagen solo está disponible en el navegador');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await pdf.getPage(1);
  const imageBase64 = await renderPageToBase64(page);
  return imageBase64;
}

async function renderPageToBase64(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo inicializar el canvas para renderizar el PDF');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1] ?? '';
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

  console.error('[OpenAI OCR] Estructura de respuesta inesperada:', data);
  throw new Error('OpenAI no devolvió contenido legible en el formato esperado');
}

function sanitizeCUIT(value: any): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return validateCUIT(digits) ? digits : null;
}

function normalizeInvoiceTypeCode(value: any): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().toUpperCase();

  if (/^\d{1,3}$/.test(trimmed)) {
    return trimmed.padStart(3, '0');
  }

  const mapping: Record<string, string> = {
    'FACTURA A': '001',
    'FACTURA B': '006',
    'FACTURA C': '011',
    'FACTURA M': '051',
    'NOTA DE CREDITO A': '003',
    'NOTA DE CREDITO B': '008',
    'NOTA DE CREDITO C': '013',
    'NOTA DE DEBITO A': '002',
    'NOTA DE DEBITO B': '007',
    'NOTA DE DEBITO C': '012',
  };

  const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return mapping[normalized] ?? null;
}

function normalizeString(value: any): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDateToISO(value: any): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/);
  if (!match) return null;
  let [, day, month, year] = match;
  if (!day || !month || !year) return null;
  if (year.length === 2) {
    year = `20${year}`;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeNumber(value: any): number {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  const sanitized = String(value).replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(sanitized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeTaxes(taxes: any): ParsedTaxes {
  if (!Array.isArray(taxes)) {
    return [];
  }

  return taxes
    .map((tax: any) => ({
      taxType: typeof tax?.taxType === 'string' ? tax.taxType : 'OTRO',
      taxBase: normalizeNumber(tax?.taxBase),
      taxAmount: normalizeNumber(tax?.taxAmount),
      rate: typeof tax?.rate === 'number' ? tax.rate : null,
    }))
    .filter((tax) => tax.taxAmount !== 0 || tax.taxBase !== 0);
}

function calculateConfidence(data: {
  supplierCuit: string | null;
  invoiceType: ReturnType<typeof getInvoiceTypeFromCode>;
  pointOfSale: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  totalAmount: number;
}): number {
  let score = 0;

  if (data.supplierCuit) score += CONFIDENCE_WEIGHTS.supplierCuit;
  if (data.invoiceType) score += CONFIDENCE_WEIGHTS.invoiceType;
  if (data.pointOfSale) score += CONFIDENCE_WEIGHTS.pointOfSale;
  if (data.invoiceNumber) score += CONFIDENCE_WEIGHTS.invoiceNumber;
  if (data.issueDate) score += CONFIDENCE_WEIGHTS.issueDate;
  if (data.totalAmount > 0) score += CONFIDENCE_WEIGHTS.totalAmount;

  return Math.round(Math.min(score, 1) * 100) / 100;
}

