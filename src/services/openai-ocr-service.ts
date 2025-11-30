// Este servicio delega el OCR y parsing de comprobantes a OpenAI usando el modelo gpt-4.1-mini.
// Convierte el archivo a base64, envía la solicitud y normaliza la respuesta al formato OCRResult.

import type { OCRResult } from './ocr-service';
import { validateCUIT } from '../utils/validators';
import { getInvoiceTypeFromCode } from '../utils/invoice-types';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';
import { supabase } from '../lib/supabase';

type PDFPageProxy = any;

const CONFIDENCE_WEIGHTS = {
  supplierCuit: 0.25,
  invoiceType: 0.15,
  pointOfSale: 0.1,
  invoiceNumber: 0.15,
  issueDate: 0.15,
  totalAmount: 0.2,
};

type ParsedTaxes = Array<{
  taxCode: string;
  description: string;
  taxBase: number;
  taxAmount: number;
  rate: number | null;
}>;

export async function extractDataWithOpenAI(file: File): Promise<OCRResult> {
  console.log('[OpenAI OCR] Iniciando extracción vía Supabase Edge Function', {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });

  // Convertir archivo a base64 (puede ser string o array de strings para múltiples páginas)
  let base64: string | string[];
  let mimeType: string;
  
  try {
    console.log('[OpenAI OCR] Convirtiendo archivo a base64...');
    const result = await fileToBase64(file);
    base64 = result.base64;
    mimeType = result.mimeType;
    
    const isMultiplePages = Array.isArray(base64);
    console.log('[OpenAI OCR] Archivo convertido exitosamente', {
      mimeType,
      isMultiplePages,
      pagesCount: isMultiplePages ? base64.length : 1,
      base64Length: isMultiplePages ? base64.map(b => b.length).join(', ') : base64.length
    });
  } catch (error) {
    console.error('[OpenAI OCR] Error al convertir archivo:', error);
    throw new Error(`Error al procesar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }

  // Obtener el token de sesión
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('No hay sesión activa. Por favor inicia sesión.');
  }

  // Obtener la URL de la Edge Function
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL no está configurada');
  }

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/openai-ocr`;

  const isMultiplePages = Array.isArray(base64);
  const pagesCount = isMultiplePages ? base64.length : 1;
  console.log('[OpenAI OCR] Llamando a Supabase Edge Function:', {
    url: edgeFunctionUrl,
    isMultiplePages,
    pagesCount,
    mimeType: mimeType
  });

  // Llamar a la Edge Function
  let response: Response;
  try {
    response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64: isMultiplePages ? base64 : [base64], // Siempre enviar como array
        mimeType,
      }),
    });
  } catch (error) {
    console.error('[OpenAI OCR] Error de red al conectar con Edge Function:', error);
    throw new Error(`Error de conexión: ${error instanceof Error ? error.message : 'Error de red'}`);
  }

  const data = await response.json();

  if (!response.ok || !data.success) {
    console.error('[OpenAI OCR] Error en Edge Function:', {
      status: response.status,
      data,
    });
    throw new Error(data.error || 'Error al procesar con OpenAI');
  }

  console.log('[OpenAI OCR] Respuesta exitosa de Edge Function');

  const outputText = data.data;
  const usage = data.usage; // Información de tokens de OpenAI
  
  // Calcular costo estimado si hay información de tokens
  let estimatedCost: number | undefined;
  if (usage) {
    estimatedCost = calculateEstimatedCost(usage);
    console.log('[OpenAI OCR] Tokens consumidos:', {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      estimatedCost: `$${estimatedCost.toFixed(4)}`,
    });
  }
  console.log('[OpenAI OCR] Texto extraído (primeros 500 chars):', outputText.substring(0, 500));

  let parsed: any;
  try {
    parsed = JSON.parse(outputText);
    console.log('[OpenAI OCR] JSON parseado exitosamente:', {
      hasSupplierCuit: !!parsed.supplierCuit,
      hasInvoiceType: !!parsed.invoiceType,
      hasInvoiceNumber: !!parsed.invoiceNumber,
      totalAmount: parsed.totalAmount
    });
  } catch (error) {
    console.error('[OpenAI OCR] Error al parsear JSON:', error);
    console.error('[OpenAI OCR] Texto recibido completo:', outputText);
    throw new Error('OpenAI devolvió un formato inesperado (no JSON válido)');
  }

  const supplierCuit = sanitizeCUIT(parsed.supplierCuit);
  const invoiceTypeCode = normalizeInvoiceTypeCode(parsed.invoiceTypeCode ?? parsed.invoiceType);
  const invoiceType = invoiceTypeCode ? getInvoiceTypeFromCode(invoiceTypeCode) : null;
  const pointOfSale = normalizeString(parsed.pointOfSale);
  const invoiceNumber = normalizeString(parsed.invoiceNumber);
  const issueDate = normalizeString(parsed.issueDate);

  const amounts = {
    netTaxed: normalizeNumber(parsed.netTaxed),
    netUntaxed: normalizeNumber(parsed.netUntaxed),
    netExempt: normalizeNumber(parsed.netExempt),
    ivaAmount: normalizeNumber(parsed.ivaAmount),
    otherTaxesAmount: normalizeNumber(parsed.otherTaxesAmount),
    totalAmount: normalizeNumber(parsed.totalAmount),
  };

  // Log de los impuestos RAW antes de normalizar para debugging
  console.log('[OpenAI OCR] Impuestos RAW de OpenAI:', JSON.stringify(parsed.taxes, null, 2));
  
  const taxes = normalizeTaxes(parsed.taxes, amounts);
  
  // Log de los impuestos después de normalizar
  console.log('[OpenAI OCR] Impuestos normalizados:', taxes.map(t => ({
    taxCode: t.taxCode,
    description: t.description,
    taxBase: t.taxBase,
    taxAmount: t.taxAmount,
    rate: t.rate
  })));
  
  const caiCae = normalizeString(parsed.caiCae ?? parsed.cae ?? parsed.cai);
  const caiCaeExpiration = normalizeString(parsed.caiCaeExpiration ?? parsed.caeExpiration ?? parsed.caiExpiration);

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
    caiCae,
    caiCaeExpiration,
    confidence,
    rawText: outputText,
    pagesCount: file.type === 'application/pdf' ? pagesCount : undefined,
    tokens: usage ? {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      estimatedCost,
    } : undefined,
  };
}

function fileToBase64(file: File): Promise<{ base64: string | string[]; mimeType: string }> {
  if (file.type === 'application/pdf') {
    // Para PDFs, retornar array de imágenes (una por página)
    return convertPdfToPngBase64(file).then((pages) => ({
      base64: pages,
      mimeType: 'image/jpeg', // Cambiado a JPEG porque ahora comprimimos
    }));
  }

  // Para imágenes, comprimir y retornar string único
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const img = new Image();
        img.src = reader.result as string;
        
        await new Promise((imgResolve, imgReject) => {
          img.onload = imgResolve;
          img.onerror = imgReject;
        });

        // Redimensionar y comprimir la imagen si es muy grande
        const MAX_DIMENSION = 2048; // OpenAI recomienda máximo 2048px
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('No se pudo obtener el contexto del canvas');
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Comprimir como JPEG con calidad 0.85
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({ base64, mimeType: 'image/jpeg' });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Error al procesar la imagen'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

GlobalWorkerOptions.workerSrc = pdfWorker;

async function convertPdfToPngBase64(file: File): Promise<string[]> {
  if (typeof window === 'undefined') {
    throw new Error('La conversión de PDF a imagen solo está disponible en el navegador');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  
  const pages: string[] = [];
  const totalPages = pdf.numPages;
  
  console.log(`[OpenAI OCR] Procesando PDF con ${totalPages} página(s)...`);
  
  // Procesar TODAS las páginas del PDF
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    console.log(`[OpenAI OCR] Procesando página ${pageNum} de ${totalPages}...`);
    const page = await pdf.getPage(pageNum);
    const imageBase64 = await renderPageToBase64(page);
    pages.push(imageBase64);
  }
  
  console.log(`[OpenAI OCR] PDF procesado exitosamente: ${pages.length} página(s) convertida(s) a imágenes`);
  
  return pages;
}

async function renderPageToBase64(page: PDFPageProxy): Promise<string> {
  // Reducir escala para evitar imágenes demasiado grandes (OpenAI tiene límites)
  // Scale 1.2 es suficiente para OCR y reduce significativamente el tamaño
  // También limitamos las dimensiones máximas a 2048px como recomienda OpenAI
  let viewport = page.getViewport({ scale: 1.2 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo inicializar el canvas para renderizar el PDF');
  }

  // Limitar dimensiones máximas a 2048px (recomendación de OpenAI)
  const MAX_DIMENSION = 2048;
  if (viewport.width > MAX_DIMENSION || viewport.height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / viewport.width, MAX_DIMENSION / viewport.height);
    viewport = page.getViewport({ scale: 1.2 * ratio });
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;

  // Comprimir la imagen usando JPEG con calidad 0.75 para reducir aún más el tamaño
  // Calidad 0.75 sigue siendo suficiente para OCR pero reduce significativamente el tamaño
  const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
  const base64 = dataUrl.split(',')[1] ?? '';
  
  // Log del tamaño para debugging
  const sizeKB = (base64.length * 3 / 4 / 1024).toFixed(2);
  console.log(`[OpenAI OCR] Imagen renderizada: ${viewport.width}x${viewport.height}px, tamaño: ${sizeKB}KB`);
  
  return base64;
}

function sanitizeCUIT(value: any): string | null {
  if (!value) {
    console.log('[OpenAI OCR] sanitizeCUIT: valor vacío o null');
    return null;
  }
  
  const digits = String(value).replace(/\D/g, '');
  console.log('[OpenAI OCR] sanitizeCUIT: procesando', {
    original: value,
    digitsOnly: digits,
    length: digits.length,
  });
  
  // Validar formato básico: debe tener 11 dígitos
  if (digits.length !== 11 || !/^\d+$/.test(digits)) {
    console.log('[OpenAI OCR] sanitizeCUIT: formato inválido (no tiene 11 dígitos)');
    return null;
  }
  
  // Intentar validar con el algoritmo de dígito verificador
  const isValid = validateCUIT(digits);
  console.log('[OpenAI OCR] sanitizeCUIT: validación', {
    isValid,
    digits,
  });
  
  // Si no pasa la validación del dígito verificador, pero tiene 11 dígitos,
  // lo aceptamos de todas formas (puede ser un CUIT válido que el algoritmo no reconoce)
  if (!isValid) {
    console.warn('[OpenAI OCR] sanitizeCUIT: CUIT no pasa validación de dígito verificador, pero se acepta por tener 11 dígitos:', digits);
  }
  
  return digits;
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

function normalizeNumber(value: any): number {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  const sanitized = String(value).replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(sanitized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeTaxes(taxes: any, amounts: { netTaxed: number; ivaAmount: number; totalAmount: number }): ParsedTaxes {
  if (!Array.isArray(taxes)) {
    return [];
  }

  return taxes
    .map((tax: any) => {
      const taxCode = typeof tax?.taxCode === 'string' ? tax.taxCode : (typeof tax?.taxType === 'string' ? tax.taxType : 'OTRO');
      const description = typeof tax?.description === 'string' ? tax.description : '';
      const taxBase = normalizeNumber(tax?.taxBase);
      let taxAmount = normalizeNumber(tax?.taxAmount);
      const rate = typeof tax?.rate === 'number' ? tax.rate : null;

      // REGLA FUNDAMENTAL: taxAmount = taxBase * rate
      // Siempre calcular taxAmount correctamente, especialmente para IVA
      let taxAmountIsCorrect = false;
      if (rate !== null && rate > 0 && taxBase > 0) {
        const calculatedTaxAmount = taxBase * (rate / 100);
        const currentDifference = Math.abs(taxAmount - calculatedTaxAmount);
        const tolerance = Math.max(calculatedTaxAmount * 0.01, 0.01); // 1% de tolerancia
        
        // Verificar si el taxAmount actual coincide con el cálculo
        if (currentDifference <= tolerance) {
          taxAmountIsCorrect = true;
          // No hacer nada, está correcto
        } else {
          // Si el taxAmount actual no coincide con el cálculo, corregirlo
          console.warn('[OpenAI OCR] taxAmount no coincide con cálculo, corrigiendo:', {
            taxCode,
            description,
            taxBase,
            taxAmountOriginal: taxAmount,
            calculatedTaxAmount,
            rate,
            difference: currentDifference,
          });
          taxAmount = calculatedTaxAmount;
          taxAmountIsCorrect = true; // Ahora está correcto después de la corrección
          console.log('[OpenAI OCR] ✅ Corregido: taxAmount = taxBase * rate');
        }
      }
      
      // CORRECCIÓN ESPECIAL PARA IVA: Solo corregir si hay un problema real
      // Si taxAmount = taxBase * rate está correcto, NO corregir aunque taxBase = netTaxed
      // (porque cuando hay una sola alícuota de IVA, taxBase puede ser igual a netTaxed)
      if ((taxCode === '1' || taxCode === '2') && !taxAmountIsCorrect) {
        // Es IVA 21% o IVA 10.5% y el taxAmount no está correcto
        const isIVA21 = taxCode === '1';
        const expectedRate = isIVA21 ? 21 : 10.5;
        
        // DETECCIÓN: Si taxBase es igual o muy similar al netTaxed total
        const netTaxedDifference = amounts.netTaxed > 0 ? Math.abs((taxBase - amounts.netTaxed) / amounts.netTaxed) * 100 : 100;
        const isTaxBaseEqualToNetTaxed = netTaxedDifference < 1; // Menos del 1% de diferencia
        
        if (isTaxBaseEqualToNetTaxed && amounts.netTaxed > 0) {
          console.warn('[OpenAI OCR] Detectado posible problema: taxBase igual a Neto Gravado y taxAmount incorrecto:', {
            taxCode,
            description,
            taxBase,
            taxAmount,
            netTaxed: amounts.netTaxed,
            expectedTaxAmount: taxBase * (expectedRate / 100),
          });
          
          // Calcular el taxAmount correcto desde el taxBase
          const calculatedTaxAmount = taxBase * (expectedRate / 100);
          taxAmount = calculatedTaxAmount;
          console.log('[OpenAI OCR] ✅ Corregido: taxAmount = taxBase * rate');
        }
      }

      return {
        taxCode,
        description,
        taxBase,
        taxAmount,
        rate,
      };
    })
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

/**
 * Calcula el costo estimado basado en el uso de tokens
 * Precios de gpt-4o (a partir de 2024):
 * - Input: $2.50 por 1M tokens
 * - Output: $10.00 por 1M tokens
 */
function calculateEstimatedCost(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): number {
  const INPUT_COST_PER_MILLION = 2.50;
  const OUTPUT_COST_PER_MILLION = 10.00;

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;

  const inputCost = (promptTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (completionTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

  return inputCost + outputCost;
}

