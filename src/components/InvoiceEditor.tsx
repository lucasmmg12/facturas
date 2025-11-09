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

type TabType = 'basic' | 'amounts' | 'electronic' | 'classification' | 'concepts';

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
  const [activeTab, setActiveTab] = useState<TabType>('basic');

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
        currency_code: invoice.currency_code,
        exchange_rate: invoice.exchange_rate,
        purchase_condition: invoice.purchase_condition,
        net_taxed: invoice.net_taxed,
        net_untaxed: invoice.net_untaxed,
        net_exempt: invoice.net_exempt,
        iva_amount: invoice.iva_amount,
        other_taxes_amount: invoice.other_taxes_amount,
        advance_payment: invoice.advance_payment,
        discount: invoice.discount,
        freight: invoice.freight,
        interest: invoice.interest,
        total_amount: invoice.total_amount,
        is_electronic: invoice.is_electronic,
        cai_cae: invoice.cai_cae,
        cai_cae_expiration: invoice.cai_cae_expiration,
        non_computable_tax_credit: invoice.non_computable_tax_credit,
        expense_code: invoice.expense_code,
        sector_code: invoice.sector_code,
        classifier_code: invoice.classifier_code,
        afip_operation_type_code: invoice.afip_operation_type_code,
        afip_voucher_code: invoice.afip_voucher_code,
        destination_branch_number: invoice.destination_branch_number,
        observations: invoice.observations,
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

  const tabs = [
    { id: 'basic' as TabType, label: 'Datos Básicos' },
    { id: 'amounts' as TabType, label: 'Importes' },
    { id: 'electronic' as TabType, label: 'Factura Electrónica' },
    { id: 'classification' as TabType, label: 'Códigos' },
    { id: 'concepts' as TabType, label: 'Conceptos' },
  ];

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

      <div className="border-b bg-white">
        <div className="px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {activeTab === 'basic' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Información del Proveedor</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proveedor <span className="text-red-500">*</span>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CUIT <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.supplier_cuit}
                    onChange={(e) => setInvoice({ ...invoice, supplier_cuit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Razón Social <span className="text-red-500">*</span>
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

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Datos del Comprobante</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Comprobante <span className="text-red-500">*</span>
                  </label>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nro. de Comprobante <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Punto Venta"
                      value={invoice.point_of_sale}
                      onChange={(e) =>
                        setInvoice({ ...invoice, point_of_sale: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Número"
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
                    Fecha de Emisión <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={invoice.issue_date}
                    onChange={(e) => setInvoice({ ...invoice, issue_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha Contable <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={invoice.accounting_date || ''}
                    onChange={(e) => setInvoice({ ...invoice, accounting_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Moneda CTE <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={invoice.currency_code || 'ARS'}
                    onChange={(e) => setInvoice({ ...invoice, currency_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ARS">ARS - Peso Argentino</option>
                    <option value="USD">USD - Dólar</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cotización
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.exchange_rate || 1}
                    onChange={(e) =>
                      setInvoice({ ...invoice, exchange_rate: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Condición de Compra
                  </label>
                  <input
                    type="text"
                    value={invoice.purchase_condition || ''}
                    onChange={(e) => setInvoice({ ...invoice, purchase_condition: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: Contado, 30 días, etc."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'amounts' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Importes Base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subtotal Gravado <span className="text-red-500">*</span>
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
                    Subtotal No Gravado
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.net_untaxed}
                    onChange={(e) =>
                      setInvoice({ ...invoice, net_untaxed: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Anticipo o Seña
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.advance_payment || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, advance_payment: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bonificación
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.discount || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, discount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Flete
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.freight || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, freight: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intereses
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.interest || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, interest: parseFloat(e.target.value) || 0 })
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
                    Otros Impuestos
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.other_taxes_amount}
                    onChange={(e) =>
                      setInvoice({
                        ...invoice,
                        other_taxes_amount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2 pt-4 border-t">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.total_amount}
                    onChange={(e) =>
                      setInvoice({ ...invoice, total_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Crédito Fiscal No Computable
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.non_computable_tax_credit || 0}
                    onChange={(e) =>
                      setInvoice({
                        ...invoice,
                        non_computable_tax_credit: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'electronic' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Factura Electrónica</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={invoice.is_electronic || false}
                      onChange={(e) =>
                        setInvoice({ ...invoice, is_electronic: e.target.checked })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Es Factura Electrónica
                    </span>
                  </label>
                </div>

                {invoice.is_electronic && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CAI / CAE
                      </label>
                      <input
                        type="text"
                        value={invoice.cai_cae || ''}
                        onChange={(e) => setInvoice({ ...invoice, cai_cae: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Código de Autorización Electrónica"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fecha de Vencimiento del CAI / CAE
                      </label>
                      <input
                        type="date"
                        value={invoice.cai_cae_expiration || ''}
                        onChange={(e) =>
                          setInvoice({ ...invoice, cai_cae_expiration: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'classification' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Códigos de Clasificación</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Gasto
                  </label>
                  <input
                    type="text"
                    value={invoice.expense_code || ''}
                    onChange={(e) => setInvoice({ ...invoice, expense_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Sector
                  </label>
                  <input
                    type="text"
                    value={invoice.sector_code || ''}
                    onChange={(e) => setInvoice({ ...invoice, sector_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Clasificador
                  </label>
                  <input
                    type="text"
                    value={invoice.classifier_code || ''}
                    onChange={(e) => setInvoice({ ...invoice, classifier_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Tipo de Operación AFIP
                  </label>
                  <input
                    type="text"
                    value={invoice.afip_operation_type_code || ''}
                    onChange={(e) =>
                      setInvoice({ ...invoice, afip_operation_type_code: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Comprobante AFIP
                  </label>
                  <input
                    type="text"
                    value={invoice.afip_voucher_code || ''}
                    onChange={(e) =>
                      setInvoice({ ...invoice, afip_voucher_code: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nro. de Sucursal Destino
                  </label>
                  <input
                    type="text"
                    value={invoice.destination_branch_number || ''}
                    onChange={(e) =>
                      setInvoice({ ...invoice, destination_branch_number: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={invoice.observations || ''}
                    onChange={(e) => setInvoice({ ...invoice, observations: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Observaciones adicionales..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'concepts' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Conceptos Asignados</h3>
                <button
                  onClick={() => setShowNewConceptForm(!showNewConceptForm)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nuevo Concepto</span>
                </button>
              </div>

              {showNewConceptForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
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
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {ic.tango_concepts.tango_concept_code}
                      </div>
                      <div className="text-xs text-gray-500">{ic.tango_concepts.description}</div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-gray-900">
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
                  <p className="text-sm text-gray-500 text-center py-8">
                    No hay conceptos asignados
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Notas Internas</h3>
              <textarea
                value={invoice.notes || ''}
                onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Notas adicionales de uso interno..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
