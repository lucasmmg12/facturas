import { supabase } from '../lib/supabase';
import type { Database, InvoiceStatus, InvoiceType } from '../lib/database.types';
import { validateInvoiceTotals } from '../utils/validators';

type Invoice = Database['public']['Tables']['invoices']['Row'];
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];

export async function createInvoice(data: InvoiceInsert): Promise<Invoice> {
  const validationResult = validateInvoiceTotals({
    netTaxed: data.net_taxed || 0,
    netUntaxed: data.net_untaxed || 0,
    netExempt: data.net_exempt || 0,
    ivaAmount: data.iva_amount || 0,
    otherTaxesAmount: data.other_taxes_amount || 0,
    totalAmount: data.total_amount,
  });

  const validationErrors = validationResult.valid ? null : { errors: validationResult.errors };

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      ...data,
      validation_errors: validationErrors,
    })
    .select()
    .single();

  if (error) throw error;
  return invoice;
}

export async function updateInvoice(id: string, data: InvoiceUpdate): Promise<Invoice> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return invoice;
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getInvoices(filters?: {
  status?: InvoiceStatus;
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<Invoice[]> {
  let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.supplierId) {
    query = query.eq('supplier_id', filters.supplierId);
  }

  if (filters?.fromDate) {
    query = query.gte('issue_date', filters.fromDate);
  }

  if (filters?.toDate) {
    query = query.lte('issue_date', filters.toDate);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function checkDuplicateInvoice(
  supplierCuit: string,
  invoiceType: InvoiceType,
  pointOfSale: string,
  invoiceNumber: string
): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('supplier_cuit', supplierCuit)
    .eq('invoice_type', invoiceType)
    .eq('point_of_sale', pointOfSale)
    .eq('invoice_number', invoiceNumber)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  return updateInvoice(id, { status });
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getInvoicesReadyForExport(): Promise<Invoice[]> {
  // Buscar facturas con status READY_FOR_EXPORT
  // donde exported sea false, null, o no esté definido
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'READY_FOR_EXPORT')
    .or('exported.is.null,exported.eq.false')
    .order('issue_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function markInvoicesAsExported(
  invoiceIds: string[],
  exportBatchId: string
): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      exported: true,
      export_batch_id: exportBatchId,
      status: 'EXPORTED',
    })
    .in('id', invoiceIds);

  if (error) throw error;
}

export async function getInvoiceWithDetails(id: string) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoice) return null;

  const { data: taxes, error: taxesError } = await supabase
    .from('invoice_taxes')
    .select('*, tax_codes(*)')
    .eq('invoice_id', id);

  if (taxesError) throw taxesError;

  const { data: concepts, error: conceptsError } = await supabase
    .from('invoice_concepts')
    .select('*, tango_concepts(*)')
    .eq('invoice_id', id);

  if (conceptsError) throw conceptsError;

  const { data: supplier, error: supplierError } = invoice.supplier_id
    ? await supabase.from('suppliers').select('*').eq('id', invoice.supplier_id).maybeSingle()
    : { data: null, error: null };

  if (supplierError) throw supplierError;

  return {
    invoice,
    taxes: taxes || [],
    concepts: concepts || [],
    supplier,
  };
}

/**
 * Mapea un taxCode del OCR al ID de tax_codes en la base de datos
 */
export async function mapTaxCodeToId(taxCode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('tax_codes')
    .select('id')
    .eq('code', taxCode)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('Error mapping tax code:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Crea automáticamente los registros de invoice_taxes desde los impuestos detectados por OCR
 */
export async function createInvoiceTaxesFromOCR(
  invoiceId: string,
  taxes: Array<{
    taxCode: string;
    description: string;
    taxBase: number;
    taxAmount: number;
    rate: number | null;
  }>
): Promise<void> {
  if (!taxes || taxes.length === 0) {
    console.log('[Invoice Service] No hay impuestos para crear');
    return;
  }

  console.log('[Invoice Service] Creando impuestos automáticamente:', taxes);

  // Mapear cada taxCode a su ID en la base de datos
  const taxRecords = [];
  for (const tax of taxes) {
    let taxCodeToMap = tax.taxCode;
    
    // Normalizar percepciones de IIBB/Ingresos Brutos al código 52
    // Esto asegura que cualquier variación (incluyendo "59" si OpenAI se confunde) se mapee correctamente
    const descriptionLower = tax.description?.toLowerCase() || '';
    if (
      descriptionLower.includes('percepción iibb') ||
      descriptionLower.includes('percepcion iibb') ||
      descriptionLower.includes('percepción ingresos brutos') ||
      descriptionLower.includes('percepcion ingresos brutos') ||
      descriptionLower.includes('percep i.b.') ||
      descriptionLower.includes('percep ib') ||
      descriptionLower.includes('sircreb') ||
      taxCodeToMap === '59' // Si por error OpenAI devuelve 59 para una percepción de IIBB
    ) {
      // Verificar que realmente sea una percepción de IIBB y no otro impuesto
      if (descriptionLower.includes('iibb') || descriptionLower.includes('ingresos brutos') || descriptionLower.includes('sircreb')) {
        console.log(`[Invoice Service] Normalizando percepción de IIBB: "${tax.taxCode}" → "52"`);
        taxCodeToMap = '52';
      }
    }

    const taxCodeId = await mapTaxCodeToId(taxCodeToMap);

    if (taxCodeId) {
      taxRecords.push({
        invoice_id: invoiceId,
        tax_code_id: taxCodeId,
        tax_base: tax.taxBase,
        tax_amount: tax.taxAmount,
      });
      console.log(`[Invoice Service] Mapeado ${tax.taxCode} (${tax.description}) → ${taxCodeId}`);
    } else {
      console.warn(`[Invoice Service] No se encontró tax_code para: ${tax.taxCode} (intentó mapear: ${taxCodeToMap})`);
    }
  }

  if (taxRecords.length > 0) {
    const { error } = await supabase
      .from('invoice_taxes')
      .insert(taxRecords);

    if (error) {
      console.error('[Invoice Service] Error al crear invoice_taxes:', error);
      throw error;
    }

    console.log(`[Invoice Service] ${taxRecords.length} impuestos creados exitosamente`);
  }
}
