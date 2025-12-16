// Este archivo genera archivos Excel para importación en Tango Gestión.
// Crea 3 hojas: Encabezados, IVA/Impuestos y Conceptos, siguiendo la plantilla oficial de Tango.

import * as XLSX from 'xlsx-js-style';
import { supabase } from '../lib/supabase';
import { getInvoicesReadyForExport, markInvoicesAsExported } from './invoice-service';
import { diagnosticoTango } from './tango-diagnostics';
import type { Database } from '../lib/database.types';
import { logExport } from './activity-log-service';

type Invoice = Database['public']['Tables']['invoices']['Row'];

export interface TangoExportRow {
  'ID Comprobante': string;
  'COD_PRO_O_CUIT': string; // Renamed for internal consistency with diagnostics, but will map to display name
  'Tipo de comprobante': string;
  'Nro. de comprobante': string;
  'FECHA_EMISION': string;
  'FECHA_CONTABLE': string;
  'MONEDA': string;
  'COTIZACION': number;
  'COND_COMPRA': number;
  'IMP_NETO_GRAV': number;
  'IMP_NETO_NO_GRAV': number;
  'Anticipo o seña': number;
  'Bonificación': number;
  'Flete': number;
  'Intereses': number;
  'TOTAL': number;
  'Es factura electrónica': string;
  'CAI / CAE': string;
  'Fecha de vencimiento del CAI / CAE': string;
  'Crédito fiscal no computable': number;
  'Código de gasto': string;
  'COD_SECTOR': number;
  'COD_CLASIFICACION': string;
  'TIPO_OPERACION': string;
  'COD_COMP_AFIP': string;
  'Nro. de sucursal destino': string;
  'Observaciones': string;
  // Internal fields for diagnostics (optional or mapped)
  [key: string]: any;
}

// We need to map the interface keys to the actual Excel headers expected by Tango
// The user said "27 columnas exactas". I will use the previous headers but ensure strict values.
// To satisfy the "TangoExportRow" interface used in diagnostics, I will use a mapping or just use the Spanish headers in the object.

// Headers exactos según la plantilla de Tango (con marcadores de campos requeridos)
const TANGO_HEADERS = [
  'ID Comprobante (*)',
  'Código de proveedor / CUIT (*)',
  'Tipo de comprobante (*)',
  'Nro. de comprobante (*)',
  'Fecha de emisión (*)',
  'Fecha contable (*)',
  'Moneda CTE (*)',
  'Cotización',
  'Condición de compra',
  'Subtotal gravado (*)',
  'Subtotal no gravado',
  'Anticipo o seña',
  'Bonificación',
  'Flete',
  'Intereses',
  'Total (*)',
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
  'Observaciones'
];

interface TaxRow {
  'ID Comprobante (*)': number;
  'Código (*)': string;
  'Importe (*)': number;
}

interface ConceptRow {
  'ID Comprobante (*)': number;
  'Código de concepto (*)': string;
  'Importe (*)': number;
}

export async function generateTangoExport(userId: string): Promise<{
  filename: string;
  data: { headers: any[]; taxes: TaxRow[]; concepts: ConceptRow[] };
  invoiceIds: string[];
  diagnostics: any;
}> {
  const invoices = await getInvoicesReadyForExport();

  if (invoices.length === 0) {
    throw new Error('No hay comprobantes listos para exportar');
  }

  const invoiceIds = invoices.map((inv) => inv.id);

  // Fetch Master Data
  const [taxesResults, conceptsResults, suppliersResult, taxCodesResult, tangoConceptsResult] = await Promise.all([
    Promise.all(invoiceIds.map((id) => supabase.from('invoice_taxes').select('*').eq('invoice_id', id))),
    Promise.all(invoiceIds.map((id) => supabase.from('invoice_concepts').select('*').eq('invoice_id', id))),
    supabase.from('suppliers').select('*', { count: 'exact' }).range(0, 9999), // Cargar hasta 10,000 proveedores
    supabase.from('tax_codes').select('*'),
    supabase.from('tango_concepts').select('*'),
  ]);

  const suppliers = suppliersResult.data || [];
  const supplierMap = new Map(suppliers.map((s) => [s.cuit, s])); // Map by CUIT

  const taxCodes = taxCodesResult.data || [];
  const taxCodeMap = new Map(taxCodes.map((t) => [t.id, t])); // Map by ID to find Tango Code

  const tangoConcepts = tangoConceptsResult.data || [];
  const conceptMap = new Map(tangoConcepts.map((c) => [c.id, c])); // Map by ID

  const headers: any[] = [];
  const taxes: TaxRow[] = [];
  const concepts: ConceptRow[] = [];

  invoices.forEach((invoice, index) => {
    // 2.1 Proveedor: Buscar CUIT -> Comparar con tabla Proveedores -> Exportar CODIGO
    const cleanCuit = invoice.supplier_cuit.replace(/[-\s]/g, '');
    const supplier = supplierMap.get(cleanCuit);
    const supplierCode = supplier?.tango_supplier_code || invoice.supplier_cuit; // Fallback to CUIT if not found (or should we error?)

    // 2.6 Código comprobante AFIP
    const afipCode = mapInvoiceTypeToAfipCode(invoice.invoice_type);

    // 2.7 Moneda
    const currency = invoice.currency_code || 'S'; // Siempre "S" por defecto
    const exchangeRate = invoice.exchange_rate || 1.0;

    // 2.2 Sector (1 or 10)
    // Default to 1. If "reposición de gastos" -> 10. How to detect? 
    // Maybe based on expense code or observation? For now default to 1 as per "Siempre 1" rule (with exception).
    const sector = 1;

    // 2.3 Condición de compra (1 -> Cta Cte, 2 -> Contado)
    // Default to 1
    const condition = invoice.purchase_condition === 'CONTADO' ? 2 : 1;

    // Dates
    const issueDate = formatDateForTango(invoice.issue_date);
    const accountingDate = invoice.accounting_date ? formatDateForTango(invoice.accounting_date) : issueDate;

    // Construct the row with strict 27 columns - exact match to template
    const row: any = {
      'ID Comprobante (*)': parseInt(invoice.internal_invoice_id),
      'Código de proveedor / CUIT (*)': supplierCode,
      'Tipo de comprobante (*)': mapInvoiceTypeToTango(invoice.invoice_type),
      'Nro. de comprobante (*)': `${invoice.point_of_sale}-${invoice.invoice_number}`,
      'Fecha de emisión (*)': issueDate,
      'Fecha contable (*)': accountingDate,
      'Moneda CTE (*)': currency,
      'Cotización': exchangeRate === 1 ? 1 : Number(exchangeRate.toFixed(2)),
      'Condición de compra': condition,
      'Subtotal gravado (*)': Number(invoice.net_taxed?.toFixed(2) || 0),
      'Subtotal no gravado': Number(invoice.net_untaxed?.toFixed(2) || 0),
      'Anticipo o seña': Number(invoice.advance_payment?.toFixed(2) || 0),
      'Bonificación': Number(invoice.discount?.toFixed(2) || 0),
      'Flete': Number(invoice.freight?.toFixed(2) || 0),
      'Intereses': Number(invoice.interest?.toFixed(2) || 0),
      'Total (*)': Number(invoice.total_amount?.toFixed(2) || 0),
      'Es factura electrónica': invoice.is_electronic ? 'SI' : 'NO',
      'CAI / CAE': invoice.cai_cae || '',
      'Fecha de vencimiento del CAI / CAE': invoice.cai_cae_expiration ? formatDateForTango(invoice.cai_cae_expiration) : '',
      'Crédito fiscal no computable': Number(invoice.non_computable_tax_credit?.toFixed(2) || 0),
      'Código de gasto': invoice.expense_code || '',
      'Código de sector': sector,
      'Código de clasificador': 'B', // 2.5 Siempre "B"
      'Código de tipo de operación AFIP': 'O', // 2.4 Siempre "O"
      'Código de comprobante AFIP': afipCode,
      'Nro. de sucursal destino': invoice.destination_branch_number ? parseInt(invoice.destination_branch_number) : 0,
      'Observaciones': invoice.observations || '',
    };

    headers.push(row);

    // Taxes
    const invoiceTaxes = taxesResults[index].data || [];
    invoiceTaxes.forEach((tax) => {
      const taxDef = taxCodeMap.get(tax.tax_code_id);
      if (taxDef) {
        taxes.push({
          'ID Comprobante (*)': parseInt(invoice.internal_invoice_id),
          'Código (*)': String(taxDef.tango_code), // 2.9 Use Tango Code as string
          'Importe (*)': Number(tax.tax_amount?.toFixed(2) || 0),
        });
      }
    });

    // Concepts
    const invoiceConcepts = conceptsResults[index].data || [];
    invoiceConcepts.forEach((concept) => {
      const conceptDef = conceptMap.get(concept.tango_concept_id);
      if (conceptDef) {
        concepts.push({
          'ID Comprobante (*)': parseInt(invoice.internal_invoice_id),
          'Código de concepto (*)': String(conceptDef.tango_concept_code).padStart(3, '0'), // 2.8 Use code with leading zeros
          'Importe (*)': Number(concept.amount?.toFixed(2) || 0),
        });
      }
    });
  });

  // Run Diagnostics
  // We need to map the 'headers' array to the 'TangoExportRow' interface expected by diagnostics
  const diagnosticRows = headers.map(h => ({
    'ID Comprobante': h['ID Comprobante (*)'],
    'COD_PRO_O_CUIT': h['Código de proveedor / CUIT (*)'],
    'Tipo de comprobante': h['Tipo de comprobante (*)'],
    'Nro. de comprobante': h['Nro. de comprobante (*)'],
    'FECHA_EMISION': h['Fecha de emisión (*)'],
    'FECHA_CONTABLE': h['Fecha contable (*)'],
    'MONEDA': h['Moneda CTE (*)'],
    'COTIZACION': h['Cotización'],
    'COND_COMPRA': h['Condición de compra'],
    'IMP_NETO_GRAV': h['Subtotal gravado (*)'],
    'IMP_NETO_NO_GRAV': h['Subtotal no gravado'],
    'Anticipo o seña': h['Anticipo o seña'],
    'Bonificación': h['Bonificación'],
    'Flete': h['Flete'],
    'Intereses': h['Intereses'],
    'TOTAL': h['Total (*)'],
    'Es factura electrónica': h['Es factura electrónica'],
    'CAI / CAE': h['CAI / CAE'],
    'Fecha de vencimiento del CAI / CAE': h['Fecha de vencimiento del CAI / CAE'],
    'Crédito fiscal no computable': h['Crédito fiscal no computable'],
    'Código de gasto': h['Código de gasto'],
    'COD_SECTOR': h['Código de sector'],
    'COD_CLASIFICACION': h['Código de clasificador'],
    'TIPO_OPERACION': h['Código de tipo de operación AFIP'],
    'COD_COMP_AFIP': h['Código de comprobante AFIP'],
    'Nro. de sucursal destino': h['Nro. de sucursal destino'],
    'Observaciones': h['Observaciones'],
  }));

  const diagnostics = diagnosticoTango(diagnosticRows);

  // Generate File
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `TANGO_Export_${timestamp}.xlsx`;

  // Note: We are NOT saving the batch yet if there are critical errors? 
  // The prompt says "Si falla algo, mostrar errores".
  // But the function signature returns data. 
  // We will return the diagnostics and let the UI decide whether to download or show errors.

  if (diagnostics.valid) {
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

    if (!batchError) {
      await markInvoicesAsExported(invoiceIds, batch.id);

      // Registrar actividad de exportación
      try {
        await logExport(userId, batch.id, filename, invoices.length);
      } catch (error) {
        console.error('[Tango Export] Error al registrar actividad de exportación:', error);
        // No interrumpir el flujo si falla el registro de actividad
      }
    }
  }

  return {
    filename,
    data: { headers, taxes, concepts },
    invoiceIds,
    diagnostics
  };
}

// Helpers

function mapInvoiceTypeToTango(invoiceType: string): string {
  // Todas las facturas (A, B, C, M) → "FAC"
  if (invoiceType.startsWith('FACTURA')) {
    return 'FAC';
  }

  // Todas las notas de crédito (A, B, C) → "N/C"
  if (invoiceType.startsWith('NOTA_CREDITO')) {
    return 'N/C';
  }

  // Todas las notas de débito (A, B, C) → "N/D"
  if (invoiceType.startsWith('NOTA_DEBITO')) {
    return 'N/D';
  }

  // Fallback por si hay algún tipo no contemplado
  return invoiceType;
}

function mapInvoiceTypeToAfipCode(invoiceType: string): string {
  // 2.6 Código de comprobante AFIP
  // Factura A/B/C -> 011 (Wait, 011 is Factura C usually. 001 is A, 006 is B. 
  // Prompt says: "Factura A/B/C -> 011". This is weird but I MUST follow the prompt.)
  // "Factura A/B/C 011"
  // "Ticket / Factura ticket 081"

  // I will follow the prompt literally.
  if (invoiceType.includes('FACTURA')) return '011';
  if (invoiceType.includes('TICKET')) return '081';

  // "Nota de crédito buscar en tabla AFIP (pero dejar preparado)"
  // I will use standard AFIP codes for NC if possible, or default to something.
  // Standard: NC A=003, NC B=008, NC C=013.
  if (invoiceType === 'NOTA_CREDITO_A') return '003';
  if (invoiceType === 'NOTA_CREDITO_B') return '008';
  if (invoiceType === 'NOTA_CREDITO_C') return '013';

  return '000';
}

function formatDateForTango(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function applyHeaderStyle(sheet: XLSX.WorkSheet, columnCount: number) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let col = 0; col < columnCount; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!sheet[cellAddress]) continue;
    sheet[cellAddress].s = {
      fill: { fgColor: { rgb: '0070C0' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
}

export function downloadExport(filename: string, data: { headers: any[]; taxes: TaxRow[]; concepts: ConceptRow[] }) {
  const workbook = XLSX.utils.book_new();

  // HOJA 1: Encabezados y totales (nombre exacto de la plantilla)
  const headersSheet = XLSX.utils.json_to_sheet(data.headers);
  applyHeaderStyle(headersSheet, 27);
  XLSX.utils.book_append_sheet(workbook, headersSheet, 'Encabezados y totales');

  // HOJA 2: IVA y otros impuestos (nombre exacto de la plantilla)
  const taxesSheet = data.taxes.length > 0 ? XLSX.utils.json_to_sheet(data.taxes) : XLSX.utils.json_to_sheet([{ 'ID Comprobante (*)': '', 'Código (*)': '', 'Importe (*)': '' }]);
  applyHeaderStyle(taxesSheet, 3);
  XLSX.utils.book_append_sheet(workbook, taxesSheet, 'IVA y otros impuestos');

  // HOJA 3: Conceptos (nombre exacto de la plantilla)
  const conceptsSheet = data.concepts.length > 0 ? XLSX.utils.json_to_sheet(data.concepts) : XLSX.utils.json_to_sheet([{ 'ID Comprobante (*)': '', 'Código de concepto (*)': '', 'Importe (*)': '' }]);
  applyHeaderStyle(conceptsSheet, 3);
  XLSX.utils.book_append_sheet(workbook, conceptsSheet, 'Conceptos');

  const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
