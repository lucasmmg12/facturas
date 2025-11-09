export function validateCUIT(cuit: string): boolean {
  const cleanCUIT = cuit.replace(/[-\s]/g, '');

  if (cleanCUIT.length !== 11) {
    return false;
  }

  if (!/^\d+$/.test(cleanCUIT)) {
    return false;
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = cleanCUIT.split('').map(Number);
  const checkDigit = digits[10];

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * multipliers[i];
  }

  const remainder = sum % 11;
  const calculatedCheckDigit = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;

  return checkDigit === calculatedCheckDigit;
}

export function formatCUIT(cuit: string): string {
  const cleanCUIT = cuit.replace(/[-\s]/g, '');
  if (cleanCUIT.length !== 11) {
    return cuit;
  }
  return `${cleanCUIT.slice(0, 2)}-${cleanCUIT.slice(2, 10)}-${cleanCUIT.slice(10)}`;
}

export function validateInvoiceTotals(data: {
  netTaxed: number;
  netUntaxed: number;
  netExempt: number;
  ivaAmount: number;
  otherTaxesAmount: number;
  totalAmount: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const calculatedTotal =
    data.netTaxed +
    data.netUntaxed +
    data.netExempt +
    data.ivaAmount +
    data.otherTaxesAmount;

  const diff = Math.abs(calculatedTotal - data.totalAmount);

  if (diff > 0.01) {
    errors.push(
      `El total calculado ($${calculatedTotal.toFixed(2)}) no coincide con el total ingresado ($${data.totalAmount.toFixed(2)})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
