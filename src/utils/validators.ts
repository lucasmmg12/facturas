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

export function validateFileType(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
  const maxSize = 10 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de archivo no permitido: ${file.type}. Solo se permiten PDF e imágenes (PNG, JPG).`,
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(2)}MB. Máximo permitido: 10MB.`,
    };
  }

  return { valid: true };
}

export function validateInvoiceData(data: {
  supplierCuit: string | null;
  invoiceType: string | null;
  invoiceNumber: string | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.supplierCuit) {
    errors.push('CUIT del proveedor es requerido');
  } else if (!validateCUIT(data.supplierCuit)) {
    errors.push('CUIT del proveedor es inválido');
  }

  if (!data.invoiceType) {
    errors.push('Tipo de comprobante es requerido');
  }

  if (!data.invoiceNumber) {
    errors.push('Número de comprobante es requerido');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
