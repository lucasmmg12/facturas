// Este archivo maneja toda la lógica de negocio relacionada con comprobantes.
// Incluye creación, actualización, validación, cambio de estados y deduplicación.

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

export async function getInvoicesReadyForExport(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'READY_FOR_EXPORT')
    .eq('exported', false)
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
