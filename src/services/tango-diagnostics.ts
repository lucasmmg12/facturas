import { TangoExportRow } from './tango-export-service';

export interface DiagnosticResult {
    valid: boolean;
    errors: DiagnosticError[];
}

export interface DiagnosticError {
    row: number;
    column: string;
    value: any;
    message: string;
    suggestion?: string;
    type: 'CRITICAL' | 'WARNING';
}

export function diagnosticoTango(rows: TangoExportRow[]): DiagnosticResult {
    const errors: DiagnosticError[] = [];

    rows.forEach((row, index) => {
        const rowNum = index + 2; // Excel row (header is 1)

        // 1. Validate Mandatory Fields & Types
        validateMandatory(row, rowNum, errors);

        // 2. Validate Logic
        validateLogic(row, rowNum, errors);
    });

    return {
        valid: errors.length === 0,
        errors,
    };
}

function validateMandatory(row: TangoExportRow, rowNum: number, errors: DiagnosticError[]) {
    // List of mandatory fields based on "Reglas para la exportación a Tango"
    // 2.1 Proveedor
    if (!row.COD_PRO_O_CUIT) {
        errors.push({ row: rowNum, column: 'COD_PRO_O_CUIT', value: row.COD_PRO_O_CUIT, message: 'Proveedor obligatorio', type: 'CRITICAL' });
    }

    // 2.2 Sector (Must be numeric, 1 or 10)
    if (row.COD_SECTOR !== 1 && row.COD_SECTOR !== 10) {
        // Allow it if it's a number, but warn if not standard? 
        // Requirement says: "Siempre 1, excepto reposición de gastos -> 10."
        // So we check if it is a number.
        if (typeof row.COD_SECTOR !== 'number') {
            errors.push({ row: rowNum, column: 'COD_SECTOR', value: row.COD_SECTOR, message: 'Debe ser numérico', type: 'CRITICAL' });
        }
    }

    // 2.3 Condición de compra (1 or 2)
    if (row.COND_COMPRA !== 1 && row.COND_COMPRA !== 2) {
        errors.push({ row: rowNum, column: 'COND_COMPRA', value: row.COND_COMPRA, message: 'Debe ser 1 (Cta Cte) o 2 (Contado)', type: 'CRITICAL' });
    }

    // 2.4 Tipo de operación ("O")
    if (row.TIPO_OPERACION !== 'O') {
        errors.push({ row: rowNum, column: 'TIPO_OPERACION', value: row.TIPO_OPERACION, message: 'Debe ser "O"', type: 'CRITICAL' });
    }

    // 2.5 Clasificación ("B")
    if (row.COD_CLASIFICACION !== 'B') {
        errors.push({ row: rowNum, column: 'COD_CLASIFICACION', value: row.COD_CLASIFICACION, message: 'Debe ser "B"', type: 'CRITICAL' });
    }

    // 2.6 Código comprobante AFIP (Numeric string)
    if (!/^\d+$/.test(row.COD_COMP_AFIP)) {
        errors.push({ row: rowNum, column: 'COD_COMP_AFIP', value: row.COD_COMP_AFIP, message: 'Debe ser numérico (texto)', type: 'CRITICAL' });
    }

    // 2.7 Moneda
    if (row.MONEDA !== 'C' && row.MONEDA !== 'Corriente') {
        // Requirement says: "C" (corriente) si Tango lo requiere como código, o texto “Corriente” según plantilla.
        // We will accept both for now or stick to one if we knew for sure.
    }

    if (row.COTIZACION !== 1) {
        // Warning maybe? Requirement says "Cotización: 1.0"
    }

    // Dates
    if (!isValidDate(row.FECHA_EMISION)) {
        errors.push({ row: rowNum, column: 'FECHA_EMISION', value: row.FECHA_EMISION, message: 'Fecha inválida', type: 'CRITICAL' });
    }
}

function validateLogic(row: TangoExportRow, rowNum: number, errors: DiagnosticError[]) {
    // Totals check
    const subtotal = (row.IMP_NETO_GRAV || 0) + (row.IMP_NETO_NO_GRAV || 0);
    const taxes = (row.IMP_IVA || 0) + (row.IMP_PERCEP_IVA || 0) + (row.IMP_PERCEP_IB || 0) + (row.IMP_IMP_INT || 0);
    // Note: The row might not have all tax columns broken down exactly as I named them here, 
    // I need to align with the `TangoExportRow` interface I will define in the service.
    // For now, I'll assume standard total check:

    // Let's assume Total = Net + Taxes + Others
    // But the requirement says "Que los montos cierren (subtotal + impuestos = total)".

    const calculatedTotal = subtotal + taxes; // Simplified
    // We need to be careful with floating point
    if (Math.abs(calculatedTotal - row.TOTAL) > 0.05) {
        // errors.push({ row: rowNum, column: 'TOTAL', value: row.TOTAL, message: `Total no cierra. Calc: ${calculatedTotal}`, type: 'WARNING' });
        // Commented out until I define the exact interface properties for taxes.
    }

    // Date check
    if (row.FECHA_CONTABLE !== row.FECHA_EMISION) {
        // Requirement: "Que la fecha contable siempre sea igual a fecha emisión salvo excepción."
        // This is a warning/suggestion.
        // errors.push({ row: rowNum, column: 'FECHA_CONTABLE', value: row.FECHA_CONTABLE, message: 'Difiere de Fecha Emisión', type: 'WARNING' });
    }
}

function isValidDate(dateStr: string): boolean {
    // Format DD/MM/YYYY
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!regex.test(dateStr)) return false;
    return true;
}
