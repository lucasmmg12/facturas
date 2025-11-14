// Este componente permite editar y revisar un comprobante.
// Muestra el PDF a la izquierda y campos editables a la derecha.
// Permite agregar conceptos, impuestos y marcar como listo para exportar.

import { useState, useEffect } from 'react';
import { Save, Check, X, Plus, Trash2 } from 'lucide-react';
import { getInvoiceWithDetails, updateInvoice } from '../services/invoice-service';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from './StatusBadge';
import { INVOICE_TYPES_OPTIONS } from '../utils/invoice-types';
import { formatCUIT, validateCUIT } from '../utils/validators';
import type { Database, InvoiceStatus } from '../lib/database.types';

type Invoice = Database['public']['Tables']['invoices']['Row'];
type TaxCode = Database['public']['Tables']['tax_codes']['Row'];
type TangoConcept = Database['public']['Tables']['tango_concepts']['Row'];

interface InvoiceEditorProps {
  invoiceId: string;
  onClose: () => void;
  onSave: () => void;
}

export function InvoiceEditor({ invoiceId, onClose, onSave }: InvoiceEditorProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [concepts, setConcepts] = useState<TangoConcept[]>([]);
  const [invoiceTaxes, setInvoiceTaxes] = useState<any[]>([]);
  const [invoiceConcepts, setInvoiceConcepts] = useState<any[]>([]);
  const [newConceptCode, setNewConceptCode] = useState('');
  const [newConceptDesc, setNewConceptDesc] = useState('');
  const [showNewConceptForm, setShowNewConceptForm] = useState(false);

  useEffect(() => {
    loadData();
  }, [invoiceId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [invoiceData, suppliersData, taxCodesData, conceptsData] = await Promise.all([
        getInvoiceWithDetails(invoiceId),
        supabase.from('suppliers').select('*').order('razon_social'),
        supabase.from('tax_codes').select('*').eq('active', true),
        supabase.from('tango_concepts').select('*').eq('active', true).order('description'),
      ]);

      if (invoiceData) {
        setInvoice(invoiceData.invoice);
        setInvoiceTaxes(invoiceData.taxes);
        setInvoiceConcepts(invoiceData.concepts);
      }

      setSuppliers(suppliersData.data || []);
      setTaxCodes(taxCodesData.data || []);
      setConcepts(conceptsData.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!invoice || !profile) return;

    try {
      setSaving(true);

      await updateInvoice(invoice.id, {
        supplier_id: invoice.supplier_id,
        supplier_cuit: invoice.supplier_cuit,
        supplier_name: invoice.supplier_name,
        invoice_type: invoice.invoice_type,
        point_of_sale: invoice.point_of_sale,
        invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date,
        accounting_date: invoice.accounting_date,
        net_taxed: invoice.net_taxed,
        net_untaxed: invoice.net_untaxed,
        net_exempt: invoice.net_exempt,
        iva_amount: invoice.iva_amount,
        other_taxes_amount: invoice.other_taxes_amount,
        total_amount: invoice.total_amount,
        notes: invoice.notes,
        updated_by: profile.id,
      });

      onSave();
    } catch (error) {
      console.error('Error saving invoice:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsReady = async () => {
    if (!invoice) return;

    try {
      setSaving(true);
      await updateInvoice(invoice.id, { status: 'READY_FOR_EXPORT' });
      onSave();
    } catch (error) {
      console.error('Error marking as ready:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddConcept = async (conceptId: string, amount: number) => {
    if (!invoice) return;

    try {
      await supabase.from('invoice_concepts').insert({
        invoice_id: invoice.id,
        tango_concept_id: conceptId,
        amount,
      });

      await loadData();
    } catch (error) {
      console.error('Error adding concept:', error);
    }
  };

  const handleRemoveConcept = async (conceptId: string) => {
    try {
      await supabase.from('invoice_concepts').delete().eq('id', conceptId);
      await loadData();
    } catch (error) {
      console.error('Error removing concept:', error);
    }
  };

  const handleCreateConcept = async () => {
    if (!profile || !newConceptCode || !newConceptDesc) return;

    try {
      const { data, error } = await supabase
        .from('tango_concepts')
        .insert({
          tango_concept_code: newConceptCode,
          description: newConceptDesc,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;

      setConcepts([...concepts, data]);
      setNewConceptCode('');
      setNewConceptDesc('');
      setShowNewConceptForm(false);
    } catch (error) {
      console.error('Error creating concept:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!invoice) {
    return <div className="p-8 text-center text-gray-500">Comprobante no encontrado</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-gray-900">Editar Comprobante</h2>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="flex items-center space-x-2">
          {invoice.status === 'PENDING_REVIEW' && (
            <button
              onClick={handleMarkAsReady}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>Marcar como Listo</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>Guardar</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
          >
            <X className="h-4 w-4" />
            <span>Cerrar</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Información del Proveedor</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proveedor
                  </label>
                  <select
                    value={invoice.supplier_id || ''}
                    onChange={(e) => {
                      const supplier = suppliers.find((s) => s.id === e.target.value);
                      if (supplier) {
                        setInvoice({
                          ...invoice,
                          supplier_id: supplier.id,
                          supplier_cuit: supplier.cuit,
                          supplier_name: supplier.razon_social,
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.razon_social} - {formatCUIT(supplier.cuit)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
                  <input
                    type="text"
                    value={invoice.supplier_cuit}
                    onChange={(e) => setInvoice({ ...invoice, supplier_cuit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    value={invoice.supplier_name}
                    onChange={(e) => setInvoice({ ...invoice, supplier_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Datos del Comprobante</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={invoice.invoice_type}
                    onChange={(e) =>
                      setInvoice({ ...invoice, invoice_type: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {INVOICE_TYPES_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Punto de Venta
                    </label>
                    <input
                      type="text"
                      value={invoice.point_of_sale}
                      onChange={(e) =>
                        setInvoice({ ...invoice, point_of_sale: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <input
                      type="text"
                      value={invoice.invoice_number}
                      onChange={(e) =>
                        setInvoice({ ...invoice, invoice_number: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={invoice.issue_date}
                    onChange={(e) => setInvoice({ ...invoice, issue_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Importes</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Neto Gravado
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.net_taxed}
                    onChange={(e) =>
                      setInvoice({ ...invoice, net_taxed: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IVA
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.iva_amount}
                    onChange={(e) =>
                      setInvoice({ ...invoice, iva_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.total_amount}
                    onChange={(e) =>
                      setInvoice({ ...invoice, total_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Conceptos</h3>
                <button
                  onClick={() => setShowNewConceptForm(!showNewConceptForm)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nuevo Concepto</span>
                </button>
              </div>

              {showNewConceptForm && (
                <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
                  <input
                    type="text"
                    placeholder="Código Tango"
                    value={newConceptCode}
                    onChange={(e) => setNewConceptCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Descripción"
                    value={newConceptDesc}
                    onChange={(e) => setNewConceptDesc(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={handleCreateConcept}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Crear Concepto
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {invoiceConcepts.map((ic) => (
                  <div
                    key={ic.id}
                    className="flex items-center justify-between p-2 bg-white rounded border"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {ic.tango_concepts.tango_concept_code}
                      </div>
                      <div className="text-xs text-gray-500">{ic.tango_concepts.description}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">
                        ${ic.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={() => handleRemoveConcept(ic.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {invoiceConcepts.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No hay conceptos asignados
                  </p>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Notas</h3>
              <textarea
                value={invoice.notes || ''}
                onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Notas adicionales..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
