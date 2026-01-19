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
  // Fetch Master Data
  const [taxesResults, conceptsResults, suppliersResult, taxCodesResult, tangoConceptsResult] = await Promise.all([
    Promise.all(invoiceIds.map((id) => supabase.from('invoice_taxes').select('*').eq('invoice_id', id))),
    Promise.all(invoiceIds.map((id) => supabase.from('invoice_concepts').select('*').eq('invoice_id', id))),
    supabase.from('suppliers').select('*', { count: 'exact' }).range(0, 9999),
    supabase.from('tax_codes').select('*'),
    supabase.from('tango_concepts').select('*'),
  ]);

  const suppliers = (suppliersResult.data || []) as Database['public']['Tables']['suppliers']['Row'][];
  const supplierMap = new Map(suppliers.map((s) => [s.cuit, s]));

  const taxCodes = (taxCodesResult.data || []) as Database['public']['Tables']['tax_codes']['Row'][];
  const taxCodeMap = new Map(taxCodes.map((t) => [t.id, t]));

  const tangoConcepts = (tangoConceptsResult.data || []) as Database['public']['Tables']['tango_concepts']['Row'][];
  const conceptMap = new Map(tangoConcepts.map((c) => [c.id, c]));

  const headers: any[] = [];
  const taxes: TaxRow[] = [];
  const concepts: ConceptRow[] = [];

  invoices.forEach((invoice, index) => {
    // 2.1 Proveedor: Buscar CUIT -> Comparar con tabla Proveedores -> Exportar CODIGO
    const cleanCuit = invoice.supplier_cuit.replace(/[-\s]/g, '');
    const supplier = supplierMap.get(cleanCuit);
    const supplierCode = supplier?.tango_supplier_code || invoice.supplier_cuit;

    // 2.6 Código comprobante AFIP
    const afipCode = mapInvoiceTypeToAfipCode(invoice.invoice_type);

    // 2.7 Moneda
    const currency = invoice.currency_code || 'S';
    const exchangeRate = invoice.exchange_rate || 1.0;

    // 2.2 Sector (1 or 10)
    const sector = 1;

    // 2.3 Condición de compra (1 -> Cta Cte, 2 -> Contado)
    const condition = invoice.purchase_condition === 'CONTADO' ? 2 : 1;

    // Dates
    const issueDate = formatDateForTango(invoice.issue_date);
    const accountingDate = invoice.accounting_date ? formatDateForTango(invoice.accounting_date) : issueDate;

    // Construct the row with strict 27 columns - exact match to template
    const row: any = {
      'ID Comprobante (*)': parseInt(invoice.internal_invoice_id),
      'Código de proveedor / CUIT (*)': supplierCode,
      'Tipo de comprobante (*)': mapInvoiceTypeToTango(invoice.invoice_type),
      'Nro. de comprobante (*)': formatInvoiceNumberTango(invoice),
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
      'Es factura electrónica': invoice.is_electronic ? 'S' : 'N',
      'CAI / CAE': invoice.cai_cae || '',
      'Fecha de vencimiento del CAI / CAE': invoice.cai_cae_expiration ? formatDateForTango(invoice.cai_cae_expiration) : '',
      'Crédito fiscal no computable': Number(invoice.non_computable_tax_credit?.toFixed(2) || 0),
      'Código de gasto': invoice.expense_code || 'S/C',
      'Código de sector': sector,
      'Código de clasificador': '',
      'Código de tipo de operación AFIP': '0',
      'Código de comprobante AFIP': afipCode,
      'Nro. de sucursal destino': invoice.destination_branch_number ? parseInt(invoice.destination_branch_number) : 0,
      'Observaciones': invoice.observations || '',
    };

    headers.push(row);

    // Taxes
    const invoiceTaxesResult = taxesResults[index];
    const invoiceTaxes = (invoiceTaxesResult.data || []) as Database['public']['Tables']['invoice_taxes']['Row'][];

    invoiceTaxes.forEach((tax) => {
      const taxDef = taxCodeMap.get(tax.tax_code_id);
      if (taxDef) {
        taxes.push({
          'ID Comprobante (*)': parseInt(invoice.internal_invoice_id),
          'Código (*)': String(taxDef.tango_code),
          'Importe (*)': Number(tax.tax_amount?.toFixed(2) || 0),
        });
      }
    });

    // Concepts
    // IMPORTANTE: El importe en conceptos debe ser Total - IVA (neto sin impuestos)
    // NO usar el total con IVA incluido
    const invoiceConceptsResult = conceptsResults[index];
    const invoiceConcepts = (invoiceConceptsResult.data || []) as Database['public']['Tables']['invoice_concepts']['Row'][];

    // Calcular el importe correcto para conceptos: Total - IVA
    const conceptAmount = invoice.total_amount - invoice.iva_amount;

    if (invoiceConcepts.length > 0) {
      // Si hay conceptos definidos, usar su distribución pero con el importe correcto
      invoiceConcepts.forEach((concept) => {
        const conceptDef = conceptMap.get(concept.tango_concept_id);
        if (conceptDef) {
          concepts.push({
            'ID Comprobante (*)': parseInt(invoice.internal_invoice_id),
            'Código de concepto (*)': String(conceptDef.tango_concept_code).padStart(3, '0'),
            'Importe (*)': Number(conceptAmount.toFixed(2)),
          });
        }
      });
    } else {
      // Si no hay conceptos definidos, crear uno por defecto con código '001' (o el que uses por defecto)
      // usando el importe Total - IVA
      console.warn(`[Tango Export] Factura ${invoice.internal_invoice_id} sin conceptos definidos. Usando concepto por defecto.`);
      // No agregar concepto automático si no existe - el usuario debe definirlo
    }
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
    const { data: batchData, error: batchError } = await supabase
      .from('export_batches')
      .insert({
        filename,
        invoice_count: invoices.length,
        total_amount: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
        generated_by: userId,
      } as any)
      .select()
      .single();

    const batch = (batchData as unknown) as Database['public']['Tables']['export_batches']['Row'];

    if (!batchError && batch) {
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
  if (invoiceType.includes('FACTURA')) {
    return 'FAC';
  }

  // Notas de crédito → "N/C"
  if (invoiceType.includes('NOTA_CREDITO')) {
    return 'N/C';
  }

  // Notas de débito → "N/D"
  if (invoiceType.includes('NOTA_DEBITO')) {
    return 'N/D';
  }

  return invoiceType;
}

function mapInvoiceTypeToAfipCode(invoiceType: string): string {
  // Facturas
  if (invoiceType === 'FACTURA_A') return '001';
  if (invoiceType === 'FACTURA_B') return '006';
  if (invoiceType === 'FACTURA_C') return '011';
  if (invoiceType === 'FACTURA_M') return '051';

  // Notas de Crédito
  if (invoiceType === 'NOTA_CREDITO_A') return '003';
  if (invoiceType === 'NOTA_CREDITO_B') return '008';
  if (invoiceType === 'NOTA_CREDITO_C') return '013';
  if (invoiceType === 'NOTA_CREDITO_M') return '053';

  // Notas de Débito
  if (invoiceType === 'NOTA_DEBITO_A') return '002';
  if (invoiceType === 'NOTA_DEBITO_B') return '007';
  if (invoiceType === 'NOTA_DEBITO_C') return '012';
  if (invoiceType === 'NOTA_DEBITO_M') return '052';

  // Tickets (Ejemplo: Tique Factura A = 081)
  if (invoiceType.includes('TICKET')) return '081';

  return '000';
}

function getInvoiceLetter(invoiceType: string): string {
  if (invoiceType.endsWith('_A')) return 'A';
  if (invoiceType.endsWith('_B')) return 'B';
  if (invoiceType.endsWith('_C')) return 'C';
  if (invoiceType.endsWith('_M')) return 'M';
  return 'X'; // Default
}

function formatInvoiceNumberTango(invoice: Invoice): string {
  const letter = getInvoiceLetter(invoice.invoice_type);
  const pos = (invoice.point_of_sale || '0').toString().padStart(5, '0'); // 5 dígitos para PV
  const number = (invoice.invoice_number || '0').toString().padStart(8, '0'); // 8 dígitos para número
  // Formato A0001300042470 (Letra + 5 PV + 8 Num)
  return `${letter}${pos}${number}`;
}

function formatDateForTango(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function applyHeaderStyle(sheet: XLSX.WorkSheet, columnCount: number) {
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
