// Este archivo genera archivos Excel para importación en Tango Gestión.
// Crea 3 hojas: Encabezados, IVA/Impuestos y Conceptos, siguiendo la plantilla oficial de Tango.

import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { getInvoicesReadyForExport, markInvoicesAsExported } from './invoice-service';
import type { Database } from '../lib/database.types';

type Invoice = Database['public']['Tables']['invoices']['Row'];

interface TangoExportData {
  headers: HeaderRow[];
  taxes: TaxRow[];
  concepts: ConceptRow[];
}

interface HeaderRow {
  'ID Comprobante': string;
  'Código de proveedor / CUIT': string;
  'Tipo de comprobante': string;
  'Nro. de comprobante': string;
  'Fecha de emisión': string;
  'Fecha contable': string;
  'Moneda CTE': string;
  'Cotización': string;
  'Condición de compra': string;
  'Subtotal gravado': string;
  'Subtotal no gravado': string;
  'Anticipo o seña': string;
  'Bonificación': string;
  'Flete': string;
  'Intereses': string;
  'Total': string;
  'Es factura electrónica': string;
  'CAI / CAE': string;
  'Fecha de vencimiento del CAI / CAE': string;
  'Crédito fiscal no computable': string;
  'Código de gasto': string;
  'Código de sector': string;
  'Código de clasificador': string;
  'Código de tipo de operación AFIP': string;
  'Código de comprobante AFIP': string;
  'Nro. de sucursal destino': string;
  'Observaciones': string;
}

interface TaxRow {
  'ID Comprobante': string;
  'Código Impuesto': string;
  'Descripción': string;
  'Base Imponible': number;
  'Importe': number;
}

interface ConceptRow {
  'ID Comprobante': string;
  'Código Concepto': string;
  'Descripción Concepto': string;
  'Importe': number;
}

export async function generateTangoExport(userId: string): Promise<{
  filename: string;
  data: TangoExportData;
  invoiceIds: string[];
}> {
  const invoices = await getInvoicesReadyForExport();

  if (invoices.length === 0) {
    throw new Error('No hay comprobantes listos para exportar');
  }

  const invoiceIds = invoices.map((inv) => inv.id);

  const taxesPromises = invoiceIds.map((id) =>
    supabase
      .from('invoice_taxes')
      .select('*, tax_codes(*)')
      .eq('invoice_id', id)
  );

  const conceptsPromises = invoiceIds.map((id) =>
    supabase
      .from('invoice_concepts')
      .select('*, tango_concepts(*)')
      .eq('invoice_id', id)
  );

  const [taxesResults, conceptsResults, suppliersResult] = await Promise.all([
    Promise.all(taxesPromises),
    Promise.all(conceptsPromises),
    supabase.from('suppliers').select('*'),
  ]);

  const suppliers = suppliersResult.data || [];
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  const headers: HeaderRow[] = [];
  const taxes: TaxRow[] = [];
  const concepts: ConceptRow[] = [];

  invoices.forEach((invoice, index) => {
    const supplier = invoice.supplier_id ? supplierMap.get(invoice.supplier_id) : null;
    const supplierCode = supplier?.tango_supplier_code || invoice.supplier_cuit;

    headers.push({
      'ID Comprobante': invoice.internal_invoice_id,
      'Código de proveedor / CUIT': supplierCode,
      'Tipo de comprobante': mapInvoiceTypeToTango(invoice.invoice_type),
      'Nro. de comprobante': `${invoice.point_of_sale}-${invoice.invoice_number}`,
      'Fecha de emisión': formatDateForTango(invoice.issue_date),
      'Fecha contable': invoice.accounting_date
        ? formatDateForTango(invoice.accounting_date)
        : formatDateForTango(invoice.issue_date),
      'Moneda CTE': invoice.currency_code || 'ARS',
      'Cotización': formatNumber(invoice.exchange_rate || 1),
      'Condición de compra': invoice.purchase_condition || '',
      'Subtotal gravado': formatNumber(invoice.net_taxed),
      'Subtotal no gravado': formatNumber(invoice.net_untaxed),
      'Anticipo o seña': formatNumber(invoice.advance_payment || 0),
      'Bonificación': formatNumber(invoice.discount || 0),
      'Flete': formatNumber(invoice.freight || 0),
      'Intereses': formatNumber(invoice.interest || 0),
      'Total': formatNumber(invoice.total_amount),
      'Es factura electrónica': invoice.is_electronic ? 'SI' : 'NO',
      'CAI / CAE': invoice.cai_cae || '',
      'Fecha de vencimiento del CAI / CAE': invoice.cai_cae_expiration
        ? formatDateForTango(invoice.cai_cae_expiration)
        : '',
      'Crédito fiscal no computable': formatNumber(invoice.non_computable_tax_credit || 0),
      'Código de gasto': invoice.expense_code || '',
      'Código de sector': invoice.sector_code || '',
      'Código de clasificador': invoice.classifier_code || '',
      'Código de tipo de operación AFIP': invoice.afip_operation_type_code || '',
      'Código de comprobante AFIP': invoice.afip_voucher_code || '',
      'Nro. de sucursal destino': invoice.destination_branch_number || '',
      'Observaciones': invoice.observations || '',
    });

    const invoiceTaxes = taxesResults[index].data || [];
    invoiceTaxes.forEach((tax) => {
      if (tax.tax_codes) {
        taxes.push({
          'ID Comprobante': invoice.internal_invoice_id,
          'Código Impuesto': tax.tax_codes.tango_code,
          'Descripción': tax.tax_codes.description,
          'Base Imponible': tax.tax_base,
          'Importe': tax.tax_amount,
        });
      }
    });

    const invoiceConcepts = conceptsResults[index].data || [];
    invoiceConcepts.forEach((concept) => {
      if (concept.tango_concepts) {
        concepts.push({
          'ID Comprobante': invoice.internal_invoice_id,
          'Código Concepto': concept.tango_concepts.tango_concept_code,
          'Descripción Concepto': concept.tango_concepts.description,
          'Importe': concept.amount,
        });
      }
    });
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `TANGO_ComprasConceptos_${timestamp}.xlsx`;

  const { data: batch, error: batchError } = await supabase
    .from('export_batches')
    .insert({
      filename,
      invoice_count: invoices.length,
      total_amount: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
      generated_by: userId,
    })
    .select()
    .single();

  if (batchError) throw batchError;

  await markInvoicesAsExported(invoiceIds, batch.id);

  return {
    filename,
    data: { headers, taxes, concepts },
    invoiceIds,
  };
}

function mapInvoiceTypeToTango(invoiceType: string): string {
  const mapping: Record<string, string> = {
    FACTURA_A: 'FA',
    FACTURA_B: 'FB',
    FACTURA_C: 'FC',
    FACTURA_M: 'FM',
    NOTA_CREDITO_A: 'NCA',
    NOTA_CREDITO_B: 'NCB',
    NOTA_CREDITO_C: 'NCC',
    NOTA_DEBITO_A: 'NDA',
    NOTA_DEBITO_B: 'NDB',
    NOTA_DEBITO_C: 'NDC',
  };

  return mapping[invoiceType] || invoiceType;
}

function formatDateForTango(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '0';
  return value.toFixed(2);
}

/**
 * Genera y descarga un archivo XLSX con las 3 hojas requeridas por Tango:
 * 1. Encabezados (datos principales de cada comprobante)
 * 2. IVA y Otros Impuestos (detalle de impuestos por comprobante)
 * 3. Conceptos (conceptos asignados por comprobante)
 */
export function downloadExport(filename: string, data: TangoExportData) {
  // Crear un nuevo libro de Excel
  const workbook = XLSX.utils.book_new();

  // HOJA 1: Encabezados
  const headersSheet = XLSX.utils.json_to_sheet(data.headers);
  
  // Configurar anchos de columna para mejor legibilidad
  headersSheet['!cols'] = [
    { wch: 15 }, // ID Comprobante
    { wch: 20 }, // Código de proveedor / CUIT
    { wch: 15 }, // Tipo de comprobante
    { wch: 15 }, // Nro. de comprobante
    { wch: 12 }, // Fecha de emisión
    { wch: 12 }, // Fecha contable
    { wch: 10 }, // Moneda CTE
    { wch: 10 }, // Cotización
    { wch: 20 }, // Condición de compra
    { wch: 12 }, // Subtotal gravado
    { wch: 12 }, // Subtotal no gravado
    { wch: 12 }, // Anticipo o seña
    { wch: 12 }, // Bonificación
    { wch: 12 }, // Flete
    { wch: 12 }, // Intereses
    { wch: 12 }, // Total
    { wch: 20 }, // Es factura electrónica
    { wch: 25 }, // CAI / CAE
    { wch: 25 }, // Fecha de vencimiento del CAI / CAE
    { wch: 25 }, // Crédito fiscal no computable
    { wch: 15 }, // Código de gasto
    { wch: 15 }, // Código de sector
    { wch: 20 }, // Código de clasificador
    { wch: 25 }, // Código de tipo de operación AFIP
    { wch: 25 }, // Código de comprobante AFIP
    { wch: 20 }, // Nro. de sucursal destino
    { wch: 30 }, // Observaciones
  ];
  
  XLSX.utils.book_append_sheet(workbook, headersSheet, 'Encabezados');

  // HOJA 2: IVA y Otros Impuestos
  if (data.taxes.length > 0) {
    const taxesSheet = XLSX.utils.json_to_sheet(data.taxes);
    
    // Configurar anchos de columna
    taxesSheet['!cols'] = [
      { wch: 15 }, // ID Comprobante
      { wch: 15 }, // Código Impuesto
      { wch: 30 }, // Descripción
      { wch: 15 }, // Base Imponible
      { wch: 15 }, // Importe
    ];
    
    XLSX.utils.book_append_sheet(workbook, taxesSheet, 'IVA y Otros Impuestos');
  } else {
    // Si no hay impuestos, crear una hoja vacía con los encabezados
    const emptyTaxesSheet = XLSX.utils.json_to_sheet([
      {
        'ID Comprobante': '',
        'Código Impuesto': '',
        'Descripción': '',
        'Base Imponible': '',
        'Importe': '',
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, emptyTaxesSheet, 'IVA y Otros Impuestos');
  }

  // HOJA 3: Conceptos
  if (data.concepts.length > 0) {
    const conceptsSheet = XLSX.utils.json_to_sheet(data.concepts);
    
    // Configurar anchos de columna
    conceptsSheet['!cols'] = [
      { wch: 15 }, // ID Comprobante
      { wch: 15 }, // Código Concepto
      { wch: 40 }, // Descripción Concepto
      { wch: 15 }, // Importe
    ];
    
    XLSX.utils.book_append_sheet(workbook, conceptsSheet, 'Conceptos');
  } else {
    // Si no hay conceptos, crear una hoja vacía con los encabezados
    const emptyConceptsSheet = XLSX.utils.json_to_sheet([
      {
        'ID Comprobante': '',
        'Código Concepto': '',
        'Descripción Concepto': '',
        'Importe': '',
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, emptyConceptsSheet, 'Conceptos');
  }

  // Generar el archivo XLSX como un array buffer
  const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

  // Crear un Blob y descargarlo
  const blob = new Blob([xlsxBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
