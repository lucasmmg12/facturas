import { supabase } from '../lib/supabase';
import type { Database, InvoiceStatus, InvoiceType, Supplier, Invoice } from '../lib/database.types';
import { validateInvoiceTotals } from '../utils/validators';

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
  return invoice as Invoice;
}

export async function updateInvoice(id: string, data: InvoiceUpdate): Promise<Invoice> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return invoice as Invoice;
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as Invoice | null;
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
  return (data || []) as Invoice[];
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
  return data as Invoice | null;
}

export async function getSupplierByCuit(cuit: string): Promise<Supplier | null> {
  const cleanCuit = cuit.replace(/[-\s]/g, '');
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('cuit', cleanCuit)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data as Supplier | null;
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
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'READY_FOR_EXPORT')
    .or('exported.is.null,exported.eq.false')
    .order('issue_date', { ascending: true });

  if (error) throw error;
  return (data || []) as Invoice[];
}

export async function markInvoicesAsExported(ids: string[], batchId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      exported: true,
      export_batch_id: batchId,
      status: 'EXPORTED'
    })
    .in('id', ids);

  if (error) throw error;
}

export async function resetExportStatus(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      exported: false,
      export_batch_id: null,
      status: 'READY_FOR_EXPORT'
    })
    .in('id', ids);

  if (error) throw error;
}

export async function updateInvoiceSupplier(invoiceId: string, supplierId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ supplier_id: supplierId })
    .eq('id', invoiceId);

  if (error) throw error;
}

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

  const taxRecords = [];
  for (const tax of taxes) {
    let taxCodeToMap = tax.taxCode;
    const descriptionLower = tax.description?.toLowerCase() || '';

    if (
      descriptionLower.includes('percepción iibb') ||
      descriptionLower.includes('percepcion iibb') ||
      descriptionLower.includes('percepción ingresos brutos') ||
      descriptionLower.includes('percepcion ingresos brutos') ||
      descriptionLower.includes('percep i.b.') ||
      descriptionLower.includes('percep ib') ||
      descriptionLower.includes('sircreb')
    ) {
      taxCodeToMap = 'PERC_IIBB';
    }

    if (taxCodeToMap === '100222' || (descriptionLower.includes('iva') && descriptionLower.includes('27'))) {
      taxCodeToMap = 'IVA_27';
    }

    const taxCodeId = await mapTaxCodeToId(taxCodeToMap);

    if (taxCodeId) {
      taxRecords.push({
        invoice_id: invoiceId,
        tax_code_id: taxCodeId,
        tax_base: tax.taxBase,
        tax_amount: tax.taxAmount,
      });
    }
  }

  if (taxRecords.length > 0) {
    const { error } = await supabase
      .from('invoice_taxes')
      .insert(taxRecords as any);

    if (error) {
      console.error('[Invoice Service] Error al crear invoice_taxes:', error);
      throw error;
    }
  }
}
