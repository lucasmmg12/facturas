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

        // 3. CÓDIGO DE SECTOR
        // Regla: Siempre 1, excepto reposición de gastos → 10
        if (invoiceData.expense_code?.toLowerCase().includes('reposición') ||
            invoiceData.expense_code?.toLowerCase().includes('reposicion')) {
            result.sector_code = '10';
        } else {
            result.sector_code = '1';
        }

        // 4. CONDICIÓN DE COMPRA
        // Por defecto: 1 (Cuenta corriente)
        // TODO: Podríamos detectar si dice "CONTADO" en el comprobante
        result.purchase_condition = '1'; // Cta Cte por defecto

        // 5. TIPO DE OPERACIÓN
        // Siempre "O"
        result.operation_type = 'O';

        // 6. CÓDIGO DE CLASIFICACIÓN
        // Siempre "B" (Bienes y Servicios)
        result.classifier_code = 'B';

        // 7. CÓDIGO DE COMPROBANTE AFIP
        result.afip_voucher_code = mapInvoiceTypeToAFIPCode(invoiceData.invoice_type);

        // 8. MONEDA Y COTIZACIÓN
        result.currency_code = 'C'; // Corriente
        result.exchange_rate = 1.0;

        // 9. FECHA CONTABLE
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
 * Maps invoice type to AFIP voucher code
 */
function mapInvoiceTypeToAFIPCode(invoiceType: InvoiceType): string {
    // Reglas:
    // Factura A/B/C → 011
    // Ticket / Factura ticket → 081
    // Nota de crédito → (preparado para tabla AFIP)

    switch (invoiceType) {
        case 'FACTURA_A':
        case 'FACTURA_B':
        case 'FACTURA_C':
        case 'FACTURA_M':
            return '011';

        case 'NOTA_CREDITO_A':
        case 'NOTA_CREDITO_B':
        case 'NOTA_CREDITO_C':
            return '013'; // Código AFIP para Nota de Crédito

        case 'NOTA_DEBITO_A':
        case 'NOTA_DEBITO_B':
        case 'NOTA_DEBITO_C':
            return '012'; // Código AFIP para Nota de Débito

        default:
            return '011'; // Por defecto factura
    }
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

    // 2. Validar código de sector (debe ser numérico)
    if (!invoice.sector_code || isNaN(Number(invoice.sector_code))) {
        errors.push('Código de sector debe ser numérico.');
    }

    // 3. Validar condición de compra (1 o 2)
    if (!['1', '2'].includes(String(invoice.purchase_condition))) {
        errors.push('Condición de compra debe ser 1 (Cta Cte) o 2 (Contado).');
    }

    // 4. Validar tipo de operación
    if (invoice.operation_type !== 'O') {
        errors.push('Tipo de operación debe ser "O".');
    }

    // 5. Validar clasificador
    if (invoice.classifier_code !== 'B') {
        errors.push('Código de clasificador debe ser "B".');
    }

    // 6. Validar código AFIP
    if (!invoice.afip_voucher_code) {
        errors.push('Código de comprobante AFIP es obligatorio.');
    }

    // 7. Validar moneda y cotización
    if (!invoice.currency_code) {
        errors.push('Código de moneda es obligatorio.');
    }
    if (!invoice.exchange_rate || invoice.exchange_rate <= 0) {
        errors.push('Cotización debe ser mayor a 0.');
    }

    // 8. Validar fechas
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
