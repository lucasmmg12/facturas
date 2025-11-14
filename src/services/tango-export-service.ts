// Este archivo genera archivos Excel para importación en Tango Gestión.
// Crea 3 hojas: Encabezados, IVA/Impuestos y Conceptos, siguiendo la plantilla oficial de Tango.

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
  'Tipo Comprobante': string;
  'Punto de Venta': string;
  'Número': string;
  'Fecha Emisión': string;
  'Fecha Contable': string;
  'CUIT Proveedor': string;
  'Razón Social Proveedor': string;
  'Código Proveedor Tango': string;
  'Neto Gravado': number;
  'Neto No Gravado': number;
  'Neto Exento': number;
  'IVA': number;
  'Otros Impuestos': number;
  'Total': number;
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

    headers.push({
      'ID Comprobante': invoice.internal_invoice_id,
      'Tipo Comprobante': mapInvoiceTypeToTango(invoice.invoice_type),
      'Punto de Venta': invoice.point_of_sale,
      'Número': invoice.invoice_number,
      'Fecha Emisión': formatDateForTango(invoice.issue_date),
      'Fecha Contable': invoice.accounting_date
        ? formatDateForTango(invoice.accounting_date)
        : formatDateForTango(invoice.issue_date),
      'CUIT Proveedor': invoice.supplier_cuit,
      'Razón Social Proveedor': invoice.supplier_name,
      'Código Proveedor Tango': supplier?.tango_supplier_code || '',
      'Neto Gravado': invoice.net_taxed,
      'Neto No Gravado': invoice.net_untaxed,
      'Neto Exento': invoice.net_exempt,
      'IVA': invoice.iva_amount,
      'Otros Impuestos': invoice.other_taxes_amount,
      'Total': invoice.total_amount,
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

export function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function downloadExport(filename: string, data: TangoExportData) {
  const headersCSV = convertToCSV(data.headers);
  const taxesCSV = convertToCSV(data.taxes);
  const conceptsCSV = convertToCSV(data.concepts);

  const fullContent = `=== HOJA 1: ENCABEZADOS ===\n${headersCSV}\n\n=== HOJA 2: IVA Y OTROS IMPUESTOS ===\n${taxesCSV}\n\n=== HOJA 3: CONCEPTOS ===\n${conceptsCSV}`;

  const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace('.xlsx', '.txt');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
