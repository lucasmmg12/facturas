// Este archivo genera archivos Excel para importación en Tango Gestión.
// Crea 3 hojas: Encabezados, IVA/Impuestos y Conceptos, siguiendo la plantilla oficial de Tango.

import { supabase } from '../lib/supabase';
import { getInvoicesReadyForExport, markInvoicesAsExported } from './invoice-service';
import type { Database } from '../lib/database.types';
import * as XLSX from 'xlsx';

interface TangoExportData {
  headers: HeaderRow[];
  taxes: TaxRow[];
  concepts: ConceptRow[];
}

type Supplier = Database['public']['Tables']['suppliers']['Row'];
type InvoiceTaxRow =
  Database['public']['Tables']['invoice_taxes']['Row'] & {
    tax_codes: Database['public']['Tables']['tax_codes']['Row'] | null;
  };
type InvoiceConceptRow =
  Database['public']['Tables']['invoice_concepts']['Row'] & {
    tango_concepts: Database['public']['Tables']['tango_concepts']['Row'] | null;
  };

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
  'ID Comprobante (*)': string;
  'Código (*)': string;
  'Importe (*)': number;
}

interface ConceptRow {
  'ID Comprobante': string;
  'Código Concepto': string;
  'Descripción Concepto': string;
  'Importe': number;
}

const HEADER_COLUMNS = [
  'ID Comprobante',
  'Código de proveedor / CUIT',
  'Tipo de comprobante',
  'Nro. de comprobante',
  'Fecha de emisión',
  'Fecha contable',
  'Moneda CTE',
  'Cotización',
  'Condición de compra',
  'Subtotal gravado',
  'Subtotal no gravado',
  'Anticipo o seña',
  'Bonificación',
  'Flete',
  'Intereses',
  'Total',
  'Es factura electrónica',
  'CAI / CAE',
  'Fecha de vencimiento del CAI / CAE',
  'Crédito fiscal no computable',
  'Código de gasto',
  'Código de sector',
  'Código de clasificador',
  'Código de tipo de operación AFIP',
  'Código de comprobante AFIP',
  'Nro. de sucursal destino',
  'Observaciones',
] as const;

const TAX_COLUMNS = ['ID Comprobante (*)', 'Código (*)', 'Importe (*)'] as const;

const CONCEPT_COLUMNS = [
  'ID Comprobante',
  'Código de concepto',
  'Importe',
] as const;

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

  const suppliers = (suppliersResult.data || []) as Supplier[];
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

    const invoiceTaxes = (taxesResults[index].data || []) as InvoiceTaxRow[];
    invoiceTaxes.forEach((tax) => {
      if (tax.tax_codes) {
        taxes.push({
          'ID Comprobante (*)': invoice.internal_invoice_id,
          'Código (*)': tax.tax_codes.tango_code,
          'Importe (*)': tax.tax_amount,
        });
      }
    });

    const invoiceConcepts = (conceptsResults[index].data || []) as InvoiceConceptRow[];
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

  const batchPayload: Database['public']['Tables']['export_batches']['Insert'] = {
    filename,
    invoice_count: invoices.length,
    total_amount: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
    generated_by: userId,
  };

  const { data: batch, error: batchError } = await supabase
    .from('export_batches' as any)
    .insert([batchPayload] as any)
    .select()
    .single();

  if (batchError) throw batchError;
  const exportBatch = batch as Database['public']['Tables']['export_batches']['Row'] | null;
  if (!exportBatch?.id) {
    throw new Error('No se pudo registrar el lote de exportación.');
  }

  await markInvoicesAsExported(invoiceIds, exportBatch.id);

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

export function downloadExport(filename: string, data: TangoExportData) {
  const workbook = XLSX.utils.book_new();

  const ensureRows = <T>(rows: T[], headers: readonly string[]) =>
    rows.length > 0
      ? rows
      : [Object.fromEntries(headers.map((header) => [header, ''])) as unknown as T];

  const headersSheet = XLSX.utils.json_to_sheet(
    ensureRows(data.headers, HEADER_COLUMNS),
    { header: HEADER_COLUMNS as unknown as string[] }
  );
  XLSX.utils.book_append_sheet(workbook, headersSheet, 'Encabezados');

  const taxesSheet = XLSX.utils.json_to_sheet(
    ensureRows(data.taxes, TAX_COLUMNS),
    { header: TAX_COLUMNS as unknown as string[] }
  );
  XLSX.utils.book_append_sheet(workbook, taxesSheet, 'IVA e Impuestos');

  const conceptsSheet = XLSX.utils.json_to_sheet(
    ensureRows(data.concepts, CONCEPT_COLUMNS),
    { header: CONCEPT_COLUMNS as unknown as string[] }
  );
  XLSX.utils.book_append_sheet(workbook, conceptsSheet, 'Conceptos');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
