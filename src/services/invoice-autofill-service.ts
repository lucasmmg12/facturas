import { supabase } from '../lib/supabase';
import type { InvoiceType } from '../lib/database.types';

// CUIT del Sanatorio Argentino - NUNCA usar como proveedor
const SANATORIO_CUIT = '30609926860';

interface AutofillResult {
    success: boolean;
    data?: {
        supplier_id?: string;
        supplier_cuit?: string;
        supplier_name?: string;
        tango_supplier_code?: string;
        sector_code?: string;
        purchase_condition?: string;
        operation_type?: string;
        classifier_code?: string;
        afip_voucher_code?: string;
        destination_branch_number?: string;
        currency_code?: string;
        exchange_rate?: number;
        accounting_date?: string;
        warnings?: string[];
    };
    errors?: string[];
}

/**
 * Auto-fills invoice fields based on OCR data and Tango rules
 */
export async function autofillInvoiceFields(
    invoiceData: {
        supplier_cuit: string;
        supplier_name: string;
        invoice_type: InvoiceType;
        issue_date: string;
        expense_code?: string;
    },
    userId: string
): Promise<AutofillResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const result: AutofillResult['data'] = {};

    try {
        // 1. VALIDAR QUE NO SEA EL CUIT DEL SANATORIO
        const cleanCuit = invoiceData.supplier_cuit.replace(/[-\s]/g, '');

        if (cleanCuit === SANATORIO_CUIT) {
            errors.push('El CUIT detectado pertenece al Sanatorio Argentino (comprador). No se puede usar como proveedor.');
            return { success: false, errors };
        }

        // 2. BUSCAR PROVEEDOR EN LA BASE DE DATOS
        const { data: supplier, error: supplierError } = await supabase
            .from('suppliers')
            .select('id, cuit, razon_social, tango_supplier_code')
            .eq('cuit', cleanCuit)
            .eq('active', true)
            .single();

        if (supplierError || !supplier) {
            warnings.push(`Proveedor con CUIT ${cleanCuit} no encontrado en maestros. Deberá agregarlo manualmente.`);
        } else {
            result.supplier_id = supplier.id;
            result.supplier_cuit = supplier.cuit;
            result.supplier_name = supplier.razon_social;
            result.tango_supplier_code = supplier.tango_supplier_code || undefined;

            if (!supplier.tango_supplier_code) {
                warnings.push('El proveedor no tiene código Tango asignado.');
            }
        }

        // 3. CÓDIGO DE GASTO (expense_code)
        // Valores válidos: S/C, 0, 2
        // Por defecto: S/C
        result.expense_code = 'S/C';

        // 4. CÓDIGO DE SECTOR (sector_code)
        // Default: 2 (usado en mayoría de planillas del Sanatorio)
        // Otros valores posibles: 0
        result.sector_code = '2';

        // 5. CONDICIÓN DE COMPRA (purchase_condition)
        // IMPORTANTE: Solo valores numéricos 1 o 2
        // 1 = Cuenta corriente (98% de los casos - DEFAULT)
        // 2 = Contado (casos específicos)
        result.purchase_condition = detectPurchaseCondition(invoiceData);

        // 6. CÓDIGO DE CLASIFICADOR (classifier_code)
        // Default: 0 (opcional, usado raramente)
        result.classifier_code = '0';

        // 7. TIPO DE OPERACIÓN AFIP (operation_type / afip_operation_type_code)
        // O = Compra estándar (siempre en Sanatorio Argentino)
        // E = Exportaciones
        // I = Importaciones
        result.operation_type = 'O';

        // 8. CÓDIGO DE COMPROBANTE AFIP (afip_voucher_code)
        // Automático según tipo de comprobante
        // 001 = Factura A/B/C
        // 011 = Nota de Crédito
        // 012 = Nota de Débito
        result.afip_voucher_code = mapInvoiceTypeToAFIPCode(invoiceData.invoice_type);

        // 9. NRO. SUCURSAL DESTINO (destination_branch_number)
        // Siempre 0 (no se utiliza en Sanatorio)
        result.destination_branch_number = '0';

        // 10. MONEDA Y COTIZACIÓN
        result.currency_code = 'S'; // Siempre "S" por defecto
        result.exchange_rate = 1.0;

        // 11. FECHA CONTABLE
        // Por defecto = fecha de emisión (el usuario puede cambiarla)
        result.accounting_date = invoiceData.issue_date;

        return {
            success: true,
            data: {
                ...result,
                warnings: warnings.length > 0 ? warnings : undefined,
            },
        };

    } catch (error: any) {
        console.error('Error in autofillInvoiceFields:', error);
        return {
            success: false,
            errors: [`Error al autocompletar campos: ${error.message}`],
        };
    }
}

/**
 * Maps invoice type to AFIP voucher code for Tango Gestión
 * Según planillas reales del Sanatorio Argentino:
 * 001 = Factura A/B/C (según punto de venta)
 * 011 = Nota de Crédito
 * 012 = Nota de Débito
 */
function mapInvoiceTypeToAFIPCode(invoiceType: InvoiceType): string {
    switch (invoiceType) {
        case 'FACTURA_A':
        case 'FACTURA_B':
        case 'FACTURA_C':
        case 'FACTURA_M':
            return '001'; // Factura

        case 'NOTA_CREDITO_A':
        case 'NOTA_CREDITO_B':
        case 'NOTA_CREDITO_C':
            return '011'; // Nota de Crédito

        case 'NOTA_DEBITO_A':
        case 'NOTA_DEBITO_B':
        case 'NOTA_DEBITO_C':
            return '012'; // Nota de Débito

        default:
            return '001'; // Por defecto factura
    }
}

// Detects purchase condition from invoice data
// Returns ONLY numeric values: '1' or '2'
// 1 = Cuenta corriente (DEFAULT - 98% of cases)
// 2 = Contado (specific cases only)
function detectPurchaseCondition(invoiceData: {
    supplier_name?: string;
    invoice_type: InvoiceType;
    expense_code?: string;
}): string {
    // Check if any field mentions "CONTADO" or "EFECTIVO"
    const textToCheck = [
        invoiceData.supplier_name || '',
        invoiceData.expense_code || '',
    ].join(' ').toLowerCase();

    // Keywords that indicate "Contado" payment
    const contadoKeywords = ['contado', 'efectivo', 'cash', 'pago inmediato'];

    for (const keyword of contadoKeywords) {
        if (textToCheck.includes(keyword)) {
            return '2'; // Contado
        }
    }

    // Default: Cuenta corriente (98% of cases)
    return '1';
}

/**
 * Auto-map tax codes from invoice taxes
 */
export async function autofillTaxCodes(
    invoiceTaxes: Array<{
        tax_code_id?: string;
        tax_base: number;
        tax_amount: number;
        description?: string;
    }>
): Promise<{
    success: boolean;
    mappedTaxes?: Array<{
        tax_code_id: string;
        tango_code: string;
        tax_base: number;
        tax_amount: number;
    }>;
    errors?: string[];
}> {
    try {
        const mappedTaxes = [];
        const errors: string[] = [];

        for (const tax of invoiceTaxes) {
            if (tax.tax_code_id) {
                // Buscar el código Tango correspondiente
                const { data: taxCode } = await supabase
                    .from('tax_codes')
                    .select('id, tango_code, code')
                    .eq('id', tax.tax_code_id)
                    .eq('active', true)
                    .single();

                if (taxCode && taxCode.tango_code) {
                    mappedTaxes.push({
                        tax_code_id: taxCode.id,
                        tango_code: taxCode.tango_code,
                        tax_base: tax.tax_base,
                        tax_amount: tax.tax_amount,
                    });
                } else {
                    errors.push(`Impuesto sin código Tango asignado: ${tax.description || 'desconocido'}`);
                }
            }
        }

        return {
            success: errors.length === 0,
            mappedTaxes,
            errors: errors.length > 0 ? errors : undefined,
        };
    } catch (error: any) {
        return {
            success: false,
            errors: [`Error al mapear impuestos: ${error.message}`],
        };
    }
}

/**
 * Auto-map concept codes from invoice concepts
 */
export async function autofillConceptCodes(
    invoiceConcepts: Array<{
        tango_concept_id?: string;
        amount: number;
        notes?: string;
    }>
): Promise<{
    success: boolean;
    mappedConcepts?: Array<{
        tango_concept_id: string;
        tango_concept_code: string;
        amount: number;
    }>;
    errors?: string[];
}> {
    try {
        const mappedConcepts = [];
        const errors: string[] = [];

        for (const concept of invoiceConcepts) {
            if (concept.tango_concept_id) {
                // Buscar el código Tango correspondiente
                const { data: tangoConcept } = await supabase
                    .from('tango_concepts')
                    .select('id, tango_concept_code, description')
                    .eq('id', concept.tango_concept_id)
                    .eq('active', true)
                    .single();

                if (tangoConcept && tangoConcept.tango_concept_code) {
                    mappedConcepts.push({
                        tango_concept_id: tangoConcept.id,
                        tango_concept_code: tangoConcept.tango_concept_code,
                        amount: concept.amount,
                    });
                } else {
                    errors.push(`Concepto sin código Tango asignado: ${concept.notes || 'desconocido'}`);
                }
            }
        }

        return {
            success: errors.length === 0,
            mappedConcepts,
            errors: errors.length > 0 ? errors : undefined,
        };
    } catch (error: any) {
        return {
            success: false,
            errors: [`Error al mapear conceptos: ${error.message}`],
        };
    }
}

/**
 * Validates that all required fields are present and correct before export
 */
export function validateInvoiceForExport(invoice: any): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // 1. Validar proveedor
    if (!invoice.supplier_cuit || invoice.supplier_cuit === SANATORIO_CUIT) {
        errors.push('CUIT de proveedor inválido o pertenece al Sanatorio.');
    }

    // 2. Validar código de sector (debe ser numérico: 2 o 0)
    if (!invoice.sector_code || !['2', '0'].includes(String(invoice.sector_code))) {
        errors.push('Código de sector debe ser 2 (default) o 0.');
    }

    // 3. Validar condición de compra (1 o 2)
    if (!['1', '2'].includes(String(invoice.purchase_condition))) {
        errors.push('Condición de compra debe ser 1 (Cta Cte) o 2 (Contado).');
    }

    // 4. Validar tipo de operación (debe ser O)
    if (invoice.operation_type !== 'O') {
        errors.push('Tipo de operación debe ser "O" (compra estándar).');
    }

    // 5. Validar clasificador (debe ser 0)
    if (invoice.classifier_code !== '0') {
        errors.push('Código de clasificador debe ser "0".');
    }

    // 6. Validar código AFIP (001, 011, 012)
    if (!invoice.afip_voucher_code) {
        errors.push('Código de comprobante AFIP es obligatorio.');
    } else if (!['001', '011', '012'].includes(invoice.afip_voucher_code)) {
        errors.push('Código AFIP debe ser 001 (Factura), 011 (N/C) o 012 (N/D).');
    }

    // 7. Validar sucursal destino (debe ser 0)
    if (invoice.destination_branch_number !== '0' && invoice.destination_branch_number !== undefined) {
        errors.push('Nro. de Sucursal Destino debe ser 0.');
    }

    // 8. Validar moneda y cotización
    if (!invoice.currency_code) {
        errors.push('Código de moneda es obligatorio.');
    }
    if (!invoice.exchange_rate || invoice.exchange_rate <= 0) {
        errors.push('Cotización debe ser mayor a 0.');
    }

    // 9. Validar fechas
    if (!invoice.issue_date) {
        errors.push('Fecha de emisión es obligatoria.');
    }
    if (!invoice.accounting_date) {
        errors.push('Fecha contable es obligatoria.');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
