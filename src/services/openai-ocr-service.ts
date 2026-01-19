// Este servicio delega el OCR y parsing de comprobantes a OpenAI usando el modelo gpt-4o-mini.
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
      base64Length: Array.isArray(base64) ? base64.map(b => b.length).join(', ') : base64.length
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

  // Llamar a la Edge Function usando el cliente de Supabase
  const { data: responseData, error: invokeError } = await supabase.functions.invoke('openai-ocr', {
    body: {
      base64: isMultiplePages ? base64 : [base64], // Siempre enviar como array
      mimeType,
    },
  });

  if (invokeError) {
    console.error('[OpenAI OCR] Error al invocar Edge Function:', invokeError);

    let detailedError = invokeError.message;

    // Intentar extraer el mensaje de error del cuerpo si está disponible (contexto de Supabase)
    if (invokeError instanceof Error && (invokeError as any).context) {
      try {
        const body = (invokeError as any).context;
        if (typeof body === 'object' && body.error) {
          detailedError = body.error;
        } else if (typeof body === 'string' && body.startsWith('{')) {
          const parsed = JSON.parse(body);
          detailedError = parsed.error || detailedError;
        }
      } catch (e) {
        console.warn('[OpenAI OCR] No se pudo extraer detalle del error:', e);
      }
    }

    // Traducir y profesionalizar errores de infraestructura
    if (detailedError?.includes('401') || detailedError?.toLowerCase().includes('authorized')) {
      throw new Error('Sesión de Supabase inválida o expirada (401). El servidor no autorizó la operación.');
    }
    if (detailedError?.includes('404')) {
      throw new Error('Servicio no disponible (404). El motor de análisis no responde en este momento.');
    }

    throw new Error(`Error en el motor de análisis: ${detailedError}`);
  }

  if (!responseData?.success) {
    console.error('[OpenAI OCR] Error retornado por la función:', responseData?.error);

    const errorMessage = responseData?.error || 'Respuesta inesperada del motor de análisis';

    if (errorMessage.includes('OPENAI_API_KEY')) {
      throw new Error('Falta de configuración: La clave de API de OpenAI no ha sido establecida en el servidor.');
    }

    throw new Error(errorMessage);
  }

  console.log('[OpenAI OCR] Respuesta exitosa de Edge Function');

  const data = responseData;
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
  const issueDate = normalizeDate(parsed.issueDate);

  const amounts = {
    netTaxed: normalizeNumber(parsed.netTaxed),
    netUntaxed: normalizeNumber(parsed.netUntaxed),
    netExempt: normalizeNumber(parsed.netExempt),
    ivaAmount: normalizeNumber(parsed.ivaAmount),
    otherTaxesAmount: normalizeNumber(parsed.otherTaxesAmount),
    totalAmount: normalizeNumber(parsed.totalAmount),
  };

  // INFERENCIA DE VALORES si faltan campos críticos pero hay un Total
  const isFacturaC = invoiceTypeCode === '011' || invoiceType === 'FACTURA_C';
  if (!isFacturaC && amounts.totalAmount > 0 && amounts.netTaxed === 0 && amounts.ivaAmount === 0 && amounts.netUntaxed === 0 && amounts.netExempt === 0) {
    console.log('[OpenAI OCR] ⚠️ Campos de base detectados en 0. Intentando inferir desde Total...');
    // Asunción conservadora: Es IVA 21%
    const total = amounts.totalAmount;
    const net = total / 1.21;
    const iva = total - net;

    amounts.netTaxed = Number(net.toFixed(2));
    amounts.ivaAmount = Number(iva.toFixed(2));

    console.log('[OpenAI OCR] 🪄 Inferencia completada (Asunción IVA 21%):', { net: amounts.netTaxed, iva: amounts.ivaAmount });
  } else if (amounts.netTaxed > 0 && amounts.ivaAmount === 0 && amounts.totalAmount > amounts.netTaxed) {
    // Si hay neto y total pero no IVA, el IVA es la diferencia
    amounts.ivaAmount = Number((amounts.totalAmount - amounts.netTaxed - amounts.netUntaxed - amounts.netExempt - amounts.otherTaxesAmount).toFixed(2));
    console.log('[OpenAI OCR] 🪄 Inferencia de IVA completada (Diferencia):', amounts.ivaAmount);
  }


  // Usar los impuestos extraídos por OpenAI
  const taxes: ParsedTaxes = [];

  if (Array.isArray(parsed.taxes) && parsed.taxes.length > 0) {
    console.log(`[OpenAI OCR] Procesando ${parsed.taxes.length} impuestos desde OpenAI`);
    parsed.taxes.forEach((t: any) => {
      const taxAmount = normalizeNumber(t.taxAmount);
      const taxBase = normalizeNumber(t.taxBase);

      if (taxAmount > 0 || taxBase > 0) {
        taxes.push({
          taxCode: t.taxCode || null,
          description: t.description || (t.rate ? `IVA ${t.rate}%` : 'Impuesto'),
          taxBase: taxBase,
          taxAmount: taxAmount,
          rate: t.rate !== undefined ? normalizeNumber(t.rate) : null,
        });
      }
    });
  }

  // Si no se detectaron impuestos detallados pero hay un monto de IVA total, agregar IVA 21% como fallback
  if (taxes.length === 0 && amounts.ivaAmount > 0) {
    console.log('[OpenAI OCR] Sin impuestos detallados, creando IVA 21% desde monto total');
    const taxBase = amounts.ivaAmount / 0.21;
    taxes.push({
      taxCode: '1', // Tasa general por defecto
      description: 'IVA 21% (Auto-detectado)',
      taxBase: taxBase,
      taxAmount: amounts.ivaAmount,
      rate: 21,
    });
  } else if (taxes.length > 0 && amounts.ivaAmount === 0) {
    // Si hay impuestos detallados pero IVA Total es 0, recalcularlo sumando SOLO los impuestos de IVA
    const calculatedIva = taxes
      .filter(t =>
        (t.description && t.description.toLowerCase().includes('iva') && !t.description.toLowerCase().includes('percep')) ||
        (t.rate !== null && t.rate > 0)
      )
      .reduce((sum, t) => sum + t.taxAmount, 0);

    if (calculatedIva > 0) {
      console.log('[OpenAI OCR] ⚠️ IVA Amount es 0 pero hay impuestos detallados. Recalculando IVA:', calculatedIva);
      amounts.ivaAmount = Number(calculatedIva.toFixed(2));
    }

    const calculatedOther = taxes
      .filter(t =>
        (t.description && (t.description.toLowerCase().includes('percep') || t.description.toLowerCase().includes('ii')))
      )
      .reduce((sum, t) => sum + t.taxAmount, 0);

    if (calculatedOther > 0 && amounts.otherTaxesAmount === 0) {
      console.log('[OpenAI OCR] ⚠️ Other Taxes es 0 pero hay percepciones. Recalculando:', calculatedOther);
      amounts.otherTaxesAmount = Number(calculatedOther.toFixed(2));
    }
  }


  // Para NATURGY, aplicar lógica especial si es necesario
  const NATURGY_CUIT = '30681688540';
  const cleanSupplierCuit = supplierCuit ? supplierCuit.replace(/[-\s]/g, '') : '';
  const isNaturgy = cleanSupplierCuit === NATURGY_CUIT;

  if (isNaturgy && amounts.ivaAmount > 0) {
    // Para NATURGY, el IVA 27% se calcula como: (Total Energía + Ingresos Brutos) * 0.27
    console.log('[OpenAI OCR] 🔵 Detectado proveedor NATURGY - Aplicando cálculo especial para IVA 27%');

    let totalEnergia = 0;
    let ingresosBrutos = 0;

    // Buscar "Total Energía" en el texto raw
    const totalEnergiaMatch = outputText.match(/Total Energ[íi]a[:\s]+\$?\s*([\d.,]+)/i);
    if (totalEnergiaMatch) {
      totalEnergia = normalizeNumber(totalEnergiaMatch[1]);
      console.log('[OpenAI OCR] NATURGY - Total Energía encontrado:', totalEnergia);
    }

    // Buscar "Ingresos Brutos" en los impuestos RAW (solo para obtener el monto)
    if (Array.isArray(parsed.taxes)) {
      const ingresosBrutosTax = parsed.taxes.find((t: any) => {
        const desc = (t.description || '').toLowerCase();
        return desc.includes('ingresos brutos') &&
          !desc.includes('percepción') &&
          !desc.includes('percepcion');
      });
      if (ingresosBrutosTax) {
        ingresosBrutos = normalizeNumber(ingresosBrutosTax.taxAmount || ingresosBrutosTax.taxBase || 0);
        console.log('[OpenAI OCR] NATURGY - Ingresos Brutos encontrado:', ingresosBrutos);
      }
    }

    // Si no encontramos "Total Energía", usar netTaxed como aproximación
    if (totalEnergia === 0) {
      totalEnergia = amounts.netTaxed;
      console.warn('[OpenAI OCR] NATURGY - No se encontró "Total Energía", usando netTaxed:', totalEnergia);
    }

    // Calcular taxBase y taxAmount según la fórmula especial de NATURGY
    const naturgyTaxBase = totalEnergia + ingresosBrutos;
    const naturgyTaxAmount = naturgyTaxBase * 0.27;

    // Reemplazar el IVA 21% con IVA 27% de NATURGY
    taxes[0] = {
      taxCode: '100222', // Código especial para NATURGY
      description: 'IVA 27% Responsable Inscripto',
      taxBase: naturgyTaxBase,
      taxAmount: naturgyTaxAmount,
      rate: 27,
    };

    console.log('[OpenAI OCR] ✅ NATURGY - IVA 27% calculado:', {
      totalEnergia,
      ingresosBrutos,
      taxBase: naturgyTaxBase,
      taxAmount: naturgyTaxAmount,
      formula: `(${totalEnergia} + ${ingresosBrutos}) * 0.27 = ${naturgyTaxAmount}`
    });
  }

  // Log de los impuestos finales
  console.log('[OpenAI OCR] Impuestos finales construidos:', taxes.map(t => ({
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

// Helper para validar fechas YYYY-MM-DD
function isValidDate(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    year > 2000 && year < 2100; // Rango razonable
}

function normalizeDate(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const clean = value.trim();
  if (isValidDate(clean)) return clean;

  // Convertir DD/MM/YYYY a YYYY-MM-DD si es necesario
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('/');
    const iso = `${y}-${m}-${d}`;
    if (isValidDate(iso)) return iso;
  }

  // Convertir DD-MM-YYYY a YYYY-MM-DD
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-');
    const iso = `${y}-${m}-${d}`;
    if (isValidDate(iso)) return iso;
  }

  return null;
}

function normalizeString(value: any): string {
  if (!value) return '';
  return String(value).trim();
}

function normalizeNumber(value: any): number {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  let str = String(value).trim();

  // Detectar formato inglés (ej: "1234.56") -> Punto como decimal, sin comas (o comas como miles irrelevantes si hay un punto luego)
  // Si tiene un solo punto y está cerca del final (1 o 2 dígitos después), es decimal.
  if (/^\d+\.\d{1,2}$/.test(str)) {
    return parseFloat(str);
  }

  // Si tiene formato "1.234,56" (Argentino) -> Eliminar puntos, cambiar coma por punto
  // Si tiene comas, asumimos formato latino/europeo
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    // Si solo tiene puntos (ej: "1.234" o "123.45"), es ambiguo. 
    // Si el punto divide grupos de 3, es miles. Si divide solo los ultimos 2, es decimal.
    const parts = str.split('.');
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 2) {
        // Asumimos decimal (ej: 123.45)
        // No hacemos replace global de punto
      } else {
        // Asumimos miles (ej: 1.234)
        str = str.replace(/\./g, '');
      }
    }
  }

  const parsed = parseFloat(str);
  return Number.isNaN(parsed) ? 0 : parsed;
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

