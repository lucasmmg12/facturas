// Este archivo implementa el servicio de OCR y parsing de comprobantes.
// Extrae datos estructurados de PDFs usando técnicas de reconocimiento de patrones.
// Diseñado de forma modular para permitir mejoras sin afectar otros componentes.

import type { InvoiceType } from '../lib/database.types';
import { validateCUIT } from '../utils/validators';
import { getInvoiceTypeFromCode } from '../utils/invoice-types';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';
import { createWorker, type Worker } from 'tesseract.js';

export interface OCRResult {
  supplierCuit: string | null;
  supplierName: string | null;
  invoiceType: InvoiceType | null;
  pointOfSale: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  receiverCuit: string | null;
  receiverName: string | null;
  netTaxed: number;
  netUntaxed: number;
  netExempt: number;
  ivaAmount: number;
  otherTaxesAmount: number;
  totalAmount: number;
  taxes: Array<{
    taxCode: string;
    description: string;
    taxBase: number;
    taxAmount: number;
    rate: number | null;
  }>;
  caiCae: string | null;
  caiCaeExpiration: string | null;
  confidence: number;
  rawText?: string;
  // Información de tokens (solo para OpenAI)
  tokens?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimatedCost?: number;
  };
}

export async function extractDataFromPDF(file: File): Promise<OCRResult> {
  try {
    const text = await extractTextFromFile(file);

    const supplierCuit = extractCUIT(text, 'proveedor');
    const supplierName = extractSupplierName(text);
    const invoiceTypeCode = extractInvoiceType(text);
    const invoiceType = invoiceTypeCode ? getInvoiceTypeFromCode(invoiceTypeCode) : null;
    const pointOfSale = extractPointOfSale(text);
    const invoiceNumber = extractInvoiceNumber(text);
    const issueDate = extractDate(text);
    const receiverCuit = extractCUIT(text, 'receptor');
    const receiverName = extractReceiverName(text);

    const amounts = extractAmounts(text);
    const taxes = extractTaxes(text);
    const caiCae = extractCAE(text);
    const caiCaeExpiration = extractCAEExpiration(text);

    const confidence = calculateConfidence({
      supplierCuit,
      invoiceType,
      pointOfSale,
      invoiceNumber,
      issueDate,
      totalAmount: amounts.totalAmount,
    });

    if (import.meta.env?.DEV && (!supplierCuit || !invoiceType || !invoiceNumber)) {
      console.warn('[OCR] Campos faltantes detectados', {
        supplierCuit,
        invoiceType,
        invoiceNumber,
        pointOfSale,
        issueDate,
        totalAmount: amounts.totalAmount,
      });
      console.debug('[OCR] Texto bruto recibido:', text);
    }

    return {
      supplierCuit,
      supplierName,
      invoiceType,
      pointOfSale,
      invoiceNumber,
      issueDate,
      receiverCuit,
      receiverName,
      ...amounts,
      taxes,
      caiCae,
      caiCaeExpiration,
      confidence,
      rawText: text,
    };
  } catch (error) {
    console.error('Error extracting data from PDF:', error);
    throw error;
  }
}

GlobalWorkerOptions.workerSrc = pdfWorker;

let ocrWorkerInstance: Worker | null = null;
let ocrWorkerPromise: Promise<Worker> | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (ocrWorkerInstance) {
    return ocrWorkerInstance;
  }

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const worker = await createWorker({
        logger: () => undefined,
      });
      await worker.load();
      await worker.loadLanguage('spa');
      await worker.initialize('spa');
      ocrWorkerInstance = worker;
      return worker;
    })();
  }

  return ocrWorkerPromise;
}

async function extractTextFromFile(file: File): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('El OCR solo está disponible en el entorno del navegador');
  }

  if (file.type === 'application/pdf') {
    return extractTextFromPDF(file);
  }

  return recognizeImageBlob(file);
}

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  let text = '';

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractTextFromPage(page);

    if (pageText.trim()) {
      text += `${pageText}\n`;
      continue;
    }

    const ocrText = await recognizePageWithOCR(page);
    text += `${ocrText}\n`;
  }

  return text;
}

async function extractTextFromPage(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  const strings = content.items
    .map((item) => {
      if (typeof (item as any).str === 'string') {
        return (item as any).str;
      }
      return '';
    })
    .filter(Boolean);

  return strings.join(' ');
}

async function recognizePageWithOCR(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo inicializar el canvas para OCR');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;

  const blob = await canvasToBlob(canvas);
  return recognizeImageBlob(blob);
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('No se pudo generar un blob desde el canvas'));
      }
    }, 'image/png');
  });
}

async function recognizeImageBlob(blob: Blob): Promise<string> {
  const worker = await getTesseractWorker();
  const dataUrl = await blobToDataURL(blob);
  const { data } = await worker.recognize(dataUrl);
  return data.text;
}

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el blob'));
    reader.readAsDataURL(blob);
  });
}

function extractCUIT(text: string, type: 'proveedor' | 'receptor'): string | null {
  const cuitPatterns = [
    /CUIT[:\s]*(\d{2}[-\s]?\d{8}[-\s]?\d{1})/gi,
    /(\d{2}[-\s]?\d{8}[-\s]?\d{1})/g,
  ];

  for (const pattern of cuitPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const cuit = matches[type === 'proveedor' ? 0 : 1]?.replace(/[^0-9]/g, '') || null;
      if (cuit && validateCUIT(cuit)) {
        return cuit;
      }
    }
  }

  return null;
}

function extractSupplierName(text: string): string | null {
  const patterns = [
    /Razón Social[:\s]+([A-Za-z0-9\s,.]+)/i,
    /Denominación[:\s]+([A-Za-z0-9\s,.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractReceiverName(text: string): string | null {
  const patterns = [
    /Denominación del comprador[:\s]+([A-Za-z0-9\s,.]+)/i,
    /Comprador[:\s]+([A-Za-z0-9\s,.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractInvoiceType(text: string): string | null {
  const patterns = [
    /Tipo de Comprobante[:\s]+(\d{3})/i,
    /Comprobante[:\s]+(\d{3})/i,
    /Factura\s+([ABC])/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].padStart(3, '0');
    }
  }

  return null;
}

function extractPointOfSale(text: string): string | null {
  const patterns = [
    /Punto de Venta[:\s]+(\d{4,5})/i,
    /P\.?\s*V\.?[:\s]+(\d{4,5})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].padStart(5, '0');
    }
  }

  return null;
}

function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /Número[:\s]+(\d{8})/i,
    /Nro[:\s]+(\d{8})/i,
    /(\d{4,5})[-\s](\d{8})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const number = match[2] || match[1];
      if (number) {
        return number.padStart(8, '0');
      }
    }
  }

  return null;
}

function extractDate(text: string): string | null {
  const patterns = [
    /Fecha de Emisión[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
    /Fecha[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
    /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2] && match[3]) {
      const day = match[1];
      const month = match[2];
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

function extractAmounts(text: string): {
  netTaxed: number;
  netUntaxed: number;
  netExempt: number;
  ivaAmount: number;
  otherTaxesAmount: number;
  totalAmount: number;
} {
  const amountPattern = /\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/;

  const netTaxedMatch = text.match(/Neto Gravado[:\s]+\$?\s*([\d.,]+)/i);
  const netUntaxedMatch = text.match(/No Gravado[:\s]+\$?\s*([\d.,]+)/i);
  const netExemptMatch = text.match(/Exento[:\s]+\$?\s*([\d.,]+)/i);
  const ivaMatch = text.match(/IVA[:\s]+\$?\s*([\d.,]+)/i);
  const totalMatch = text.match(/Total[:\s]+\$?\s*([\d.,]+)/i);

  const parseAmount = (match: RegExpMatchArray | null): number => {
    if (!match || !match[1]) return 0;
    return parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
  };

  return {
    netTaxed: parseAmount(netTaxedMatch),
    netUntaxed: parseAmount(netUntaxedMatch),
    netExempt: parseAmount(netExemptMatch),
    ivaAmount: parseAmount(ivaMatch),
    otherTaxesAmount: 0,
    totalAmount: parseAmount(totalMatch),
  };
}

function extractTaxes(text: string): Array<{
  taxCode: string;
  description: string;
  taxBase: number;
  taxAmount: number;
  rate: number | null;
}> {
  const taxes: Array<{
    taxCode: string;
    description: string;
    taxBase: number;
    taxAmount: number;
    rate: number | null;
  }> = [];

  const ivaPatterns = [
    /IVA\s+(21|10\.5|27|5|2\.5)%[:\s]+Base[:\s]+\$?\s*([\d.,]+)[:\s]+Imp[:\s]+\$?\s*([\d.,]+)/gi,
  ];

  for (const pattern of ivaPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const rate = parseFloat(match[1]);
      const base = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
      const amount = parseFloat(match[3].replace(/\./g, '').replace(',', '.'));
      const taxCode = `IVA_${match[1].replace('.', '_')}`;

      taxes.push({
        taxCode,
        description: `IVA ${match[1]}%`,
        taxBase: base,
        taxAmount: amount,
        rate,
      });
    }
  }

  return taxes;
}

function extractCAE(text: string): string | null {
  const patterns = [
    /CAE[:\s]+(\d{14})/i,
    /CAI[:\s]+(\d{14})/i,
    /Código de Autorización[:\s]+(\d{14})/i,
    /Autorización[:\s]+(\d{14})/i,
    /(\d{14})/g,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // Buscar el número de 14 dígitos que esté cerca de palabras relacionadas con CAE/CAI
      const contextPattern = /(?:CAE|CAI|Código de Autorización|Autorización)[:\s]*(\d{14})/i;
      const contextMatch = text.match(contextPattern);
      if (contextMatch && contextMatch[1]) {
        return contextMatch[1];
      }
      // Si no hay contexto, buscar cualquier número de 14 dígitos
      const allMatches = text.match(/(\d{14})/g);
      if (allMatches && allMatches.length > 0) {
        // Preferir el que esté más cerca de palabras clave
        const lines = text.split('\n');
        for (const line of lines) {
          if (/CAE|CAI|Autorización/i.test(line)) {
            const lineMatch = line.match(/(\d{14})/);
            if (lineMatch) {
              return lineMatch[1];
            }
          }
        }
        // Si no hay contexto, devolver el primero
        return allMatches[0];
      }
    }
  }

  return null;
}

function extractCAEExpiration(text: string): string | null {
  const patterns = [
    /Vencimiento[:\s]+CAE[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
    /Vencimiento[:\s]+CAI[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
    /Vto\.?\s+CAE[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
    /Vto\.?\s+CAI[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2] && match[3]) {
      const day = match[1];
      const month = match[2];
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

function calculateConfidence(data: {
  supplierCuit: string | null;
  invoiceType: InvoiceType | null;
  pointOfSale: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  totalAmount: number;
}): number {
  let score = 0;
  const weights = {
    supplierCuit: 0.25,
    invoiceType: 0.15,
    pointOfSale: 0.1,
    invoiceNumber: 0.15,
    issueDate: 0.15,
    totalAmount: 0.2,
  };

  if (data.supplierCuit && validateCUIT(data.supplierCuit)) {
    score += weights.supplierCuit;
  }

  if (data.invoiceType) {
    score += weights.invoiceType;
  }

  if (data.pointOfSale) {
    score += weights.pointOfSale;
  }

  if (data.invoiceNumber) {
    score += weights.invoiceNumber;
  }

  if (data.issueDate) {
    score += weights.issueDate;
  }

  if (data.totalAmount > 0) {
    score += weights.totalAmount;
  }

  return Math.round(score * 100) / 100;
}
