import type { InvoiceType } from '../lib/database.types';

export const INVOICE_TYPES_OPTIONS = [
  { value: 'FACTURA_A', label: 'Factura A' },
  { value: 'FACTURA_B', label: 'Factura B' },
  { value: 'FACTURA_C', label: 'Factura C' },
  { value: 'FACTURA_M', label: 'Factura M' },
  { value: 'NOTA_CREDITO_A', label: 'Nota de Crédito A' },
  { value: 'NOTA_CREDITO_B', label: 'Nota de Crédito B' },
  { value: 'NOTA_CREDITO_C', label: 'Nota de Crédito C' },
  { value: 'NOTA_DEBITO_A', label: 'Nota de Débito A' },
  { value: 'NOTA_DEBITO_B', label: 'Nota de Débito B' },
  { value: 'NOTA_DEBITO_C', label: 'Nota de Débito C' },
];

const codeToTypeMap: Record<string, InvoiceType> = {
  '1': 'FACTURA_A',
  '6': 'FACTURA_B',
  '11': 'FACTURA_C',
  '51': 'FACTURA_M',
  '3': 'NOTA_CREDITO_A',
  '8': 'NOTA_CREDITO_B',
  '13': 'NOTA_CREDITO_C',
  '2': 'NOTA_DEBITO_A',
  '7': 'NOTA_DEBITO_B',
  '12': 'NOTA_DEBITO_C',
};

export function getInvoiceTypeFromCode(code: string): InvoiceType {
  return codeToTypeMap[code] || 'FACTURA_B';
}
