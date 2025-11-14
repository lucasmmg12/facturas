// Este archivo define constantes y utilidades para tipos de comprobantes.
// Mapea códigos AFIP a nombres legibles y viceversa.

import type { InvoiceType } from '../lib/database.types';

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  FACTURA_A: 'Factura A',
  FACTURA_B: 'Factura B',
  FACTURA_C: 'Factura C',
  FACTURA_M: 'Factura M',
  NOTA_CREDITO_A: 'Nota de Crédito A',
  NOTA_CREDITO_B: 'Nota de Crédito B',
  NOTA_CREDITO_C: 'Nota de Crédito C',
  NOTA_DEBITO_A: 'Nota de Débito A',
  NOTA_DEBITO_B: 'Nota de Débito B',
  NOTA_DEBITO_C: 'Nota de Débito C',
};

export const INVOICE_TYPE_CODES: Record<string, InvoiceType> = {
  '001': 'FACTURA_A',
  '006': 'FACTURA_B',
  '011': 'FACTURA_C',
  '051': 'FACTURA_M',
  '003': 'NOTA_CREDITO_A',
  '008': 'NOTA_CREDITO_B',
  '013': 'NOTA_CREDITO_C',
  '002': 'NOTA_DEBITO_A',
  '007': 'NOTA_DEBITO_B',
  '012': 'NOTA_DEBITO_C',
};

export function getInvoiceTypeLabel(type: InvoiceType): string {
  return INVOICE_TYPE_LABELS[type] || type;
}

export function getInvoiceTypeFromCode(code: string): InvoiceType | null {
  return INVOICE_TYPE_CODES[code] || null;
}

export const INVOICE_TYPES_OPTIONS: { value: InvoiceType; label: string }[] = Object.entries(
  INVOICE_TYPE_LABELS
).map(([value, label]) => ({ value: value as InvoiceType, label }));
