// Este archivo contiene funciones de validación para datos de comprobantes.
// Valida formato de CUIT, integridad de totales y otros campos críticos.

export function validateCUIT(cuit: string): boolean {
  const cleanCUIT = cuit.replace(/[^0-9]/g, '');

  if (cleanCUIT.length !== 11) {
    return false;
  }

  const [checkDigit, ...rest] = cleanCUIT.split('').map(Number).reverse();
  const multipliers = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5];

  const sum = rest.reduce((acc, digit, index) => {
    return acc + digit * multipliers[index];
  }, 0);

  const mod = sum % 11;
  const expectedCheckDigit = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;

  return checkDigit === expectedCheckDigit;
}

export function formatCUIT(cuit: string): string {
  const cleanCUIT = cuit.replace(/[^0-9]/g, '');

  if (cleanCUIT.length !== 11) {
    return cuit;
  }

  return `${cleanCUIT.slice(0, 2)}-${cleanCUIT.slice(2, 10)}-${cleanCUIT.slice(10)}`;
}

export interface InvoiceAmounts {
  netTaxed: number;
  netUntaxed: number;
  netExempt: number;
  ivaAmount: number;
  otherTaxesAmount: number;
  totalAmount: number;
}

export function validateInvoiceTotals(amounts: InvoiceAmounts): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const calculatedSubtotal = amounts.netTaxed + amounts.netUntaxed + amounts.netExempt;
  const calculatedTotal = calculatedSubtotal + amounts.ivaAmount + amounts.otherTaxesAmount;

  const tolerance = 0.01;

  if (Math.abs(calculatedTotal - amounts.totalAmount) > tolerance) {
    errors.push(
      `El total calculado ($${calculatedTotal.toFixed(2)}) no coincide con el total declarado ($${amounts.totalAmount.toFixed(2)})`
    );
  }

  if (amounts.netTaxed < 0 || amounts.netUntaxed < 0 || amounts.netExempt < 0) {
    errors.push('Los importes netos no pueden ser negativos');
  }

  if (amounts.ivaAmount < 0 || amounts.otherTaxesAmount < 0) {
    errors.push('Los impuestos no pueden ser negativos');
  }

  if (amounts.totalAmount <= 0) {
    errors.push('El total debe ser mayor a cero');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseInvoiceNumber(invoiceNumber: string): {
  pointOfSale: string;
  number: string;
} | null {
  const match = invoiceNumber.match(/^(\d{4,5})-(\d{8})$/);

  if (match) {
    return {
      pointOfSale: match[1].padStart(5, '0'),
      number: match[2],
    };
  }

  return null;
}

export function formatInvoiceNumber(pointOfSale: string, number: string): string {
  return `${pointOfSale.padStart(5, '0')}-${number.padStart(8, '0')}`;
}
