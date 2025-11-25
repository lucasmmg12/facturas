// Este componente permite editar y revisar un comprobante.
// Muestra el PDF a la izquierda y campos editables a la derecha.
// Permite agregar conceptos, impuestos y marcar como listo para exportar.

import { useState, useEffect } from 'react';
import { Save, X, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { getInvoiceWithDetails, updateInvoice } from '../services/invoice-service';
import { autofillInvoiceFields } from '../services/invoice-autofill-service';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from './StatusBadge';
import { SupplierSearchSelect } from './SupplierSearchSelect';
import { SearchableSelect } from './SearchableSelect';
import { INVOICE_TYPES_OPTIONS } from '../utils/invoice-types';
import { formatCUIT } from '../utils/validators';
import type { Database } from '../lib/database.types';

type Invoice = Database['public']['Tables']['invoices']['Row'];
type TaxCode = Database['public']['Tables']['tax_codes']['Row'];
type TangoConcept = Database['public']['Tables']['tango_concepts']['Row'];

interface InvoiceEditorProps {
  invoiceId: string;
  onClose: () => void;
  onSave: () => void;
}

type TabType = 'basic' | 'amounts' | 'taxes' | 'electronic' | 'classification' | 'concepts';

// Condiciones de compra - SOLO valores numéricos
const PURCHASE_CONDITIONS = [
  { code: '1', description: 'Cuenta Corriente' },
  { code: '2', description: 'Contado' },
];

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
  const [selectedConceptId, setSelectedConceptId] = useState('');
  const [conceptAmount, setConceptAmount] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [conceptError, setConceptError] = useState('');
  const [selectedTaxCodeId, setSelectedTaxCodeId] = useState('');
  const [taxBase, setTaxBase] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [autofillWarnings, setAutofillWarnings] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, [invoiceId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Cargar TODOS los proveedores usando paginación automática
      let allSuppliers: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('suppliers')
          .select('*')
          .order('razon_social')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allSuppliers = [...allSuppliers, ...data];
          hasMore = data.length === pageSize; // Si obtuvimos menos de 1000, ya no hay más
          page++;
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ Cargados ${allSuppliers.length} proveedores en total`);

      const [invoiceData, taxCodesData, conceptsData] = await Promise.all([
        getInvoiceWithDetails(invoiceId),
        supabase.from('tax_codes').select('*').eq('active', true),
        supabase.from('tango_concepts').select('*').eq('active', true).order('description'),
      ]);

      if (invoiceData) {
        // Asegurar que is_electronic sea true por defecto
        let invoiceWithDefaults = {
          ...invoiceData.invoice,
          is_electronic: invoiceData.invoice.is_electronic ?? true,
        };

        // AUTOCOMPLETAR CAMPOS si la factura no está lista para exportar
        if (invoiceWithDefaults.status !== 'READY_FOR_EXPORT' && invoiceWithDefaults.status !== 'EXPORTED' && profile) {
          const autofillResult = await autofillInvoiceFields(
            {
              supplier_cuit: invoiceWithDefaults.supplier_cuit,
              supplier_name: invoiceWithDefaults.supplier_name,
              invoice_type: invoiceWithDefaults.invoice_type,
              issue_date: invoiceWithDefaults.issue_date,
              expense_code: invoiceWithDefaults.expense_code || undefined,
            },
            profile.id
          );

          if (autofillResult.success && autofillResult.data) {
            // Aplicar los campos autocompletados
            invoiceWithDefaults = {
              ...invoiceWithDefaults,
              ...autofillResult.data,
              // Asegurar que accounting_date se setee si no existe
              accounting_date: invoiceWithDefaults.accounting_date || autofillResult.data.accounting_date,
            };

            // Guardar warnings si existen
            if (autofillResult.data.warnings && autofillResult.data.warnings.length > 0) {
              setAutofillWarnings(autofillResult.data.warnings);
            }
          } else if (autofillResult.errors) {
            setAutofillWarnings(autofillResult.errors);
          }
        }

        setInvoice(invoiceWithDefaults);
        setInvoiceTaxes(invoiceData.taxes);
        setInvoiceConcepts(invoiceData.concepts);
      }

      setSuppliers(allSuppliers);
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

      // Si el estado se cambia a READY_FOR_EXPORT, asegurarse de que exported sea false
      const updateData: any = {
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
        is_electronic: invoice.is_electronic ?? true,
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
        status: invoice.status,
        updated_by: profile.id,
      };

      // Si el estado es READY_FOR_EXPORT, asegurarse de que exported sea false
      if (invoice.status === 'READY_FOR_EXPORT') {
        updateData.exported = false;
      }

      await updateInvoice(invoice.id, updateData);

      onSave();
    } catch (error) {
      console.error('Error saving invoice:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este comprobante? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setDeleting(true);

      // Eliminar impuestos asociados
      await supabase.from('invoice_taxes').delete().eq('invoice_id', invoiceId);

      // Eliminar conceptos asociados
      await supabase.from('invoice_concepts').delete().eq('invoice_id', invoiceId);

      // Eliminar la factura
      const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);

      if (error) throw error;

      // Cerrar el editor y recargar la lista
      onSave();
      onClose();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Error al eliminar el comprobante. Por favor, intenta nuevamente.');
    } finally {
      setDeleting(false);
    }
  };

  // Calcular total ya asignado en conceptos
  const getTotalAssignedConcepts = () => {
    return invoiceConcepts.reduce((sum, ic) => sum + ic.amount, 0);
  };

  // Calcular disponible
  const getAvailableAmount = () => {
    const totalAssigned = getTotalAssignedConcepts();
    return invoice?.total_amount ? invoice.total_amount - totalAssigned : 0;
  };

  const handleConceptAmountChange = (value: string) => {
    setConceptAmount(value);
    setConceptError('');

    if (!value || !invoice) return;

    const amount = parseFloat(value);
    if (isNaN(amount)) return;

    const totalAssigned = getTotalAssignedConcepts();
    const newTotal = totalAssigned + amount;

    if (newTotal > invoice.total_amount) {
      const available = invoice.total_amount - totalAssigned;
      setConceptError(`Excede el total de la factura. Disponible: $${available.toFixed(2)}`);
    }
  };

  const handleConceptSelected = (conceptId: string) => {
    setSelectedConceptId(conceptId);

    // Auto-completar con el importe disponible
    if (conceptId && invoice) {
      const available = getAvailableAmount();
      setConceptAmount(available.toString());
      setConceptError('');
    }
  };

  const handleAddConcept = async () => {
    if (!invoice || !selectedConceptId || !conceptAmount) {
      alert('Por favor selecciona un concepto e ingresa un monto');
      return;
    }

    const amount = parseFloat(conceptAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Por favor ingresa un monto válido');
      return;
    }

    // Validar que no supere el total
    const totalAssigned = getTotalAssignedConcepts();
    const newTotal = totalAssigned + amount;

    if (newTotal > invoice.total_amount) {
      const available = invoice.total_amount - totalAssigned;
      alert(`El monto excede el total de la factura. Disponible: $${available.toFixed(2)}`);
      return;
    }

    try {
      const { error } = await supabase.from('invoice_concepts').insert({
        invoice_id: invoice.id,
        tango_concept_id: selectedConceptId,
        amount: amount,
      });

      if (error) throw error;

      setSelectedConceptId('');
      setConceptAmount('');
      setConceptError('');
      await loadData();
    } catch (error) {
      console.error('Error adding concept:', error);
      alert('Error al asignar el concepto');
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

  const handleTaxCodeSelected = (taxCodeId: string) => {
    setSelectedTaxCodeId(taxCodeId);

    if (!taxCodeId || !invoice) return;

    // Buscar el tax code seleccionado
    const selectedTax = taxCodes.find(tc => tc.id === taxCodeId);

    if (selectedTax && selectedTax.rate && invoice.net_taxed > 0) {
      // Auto-calcular base imponible y monto si tenemos alícuota
      const baseAmount = invoice.net_taxed;
      const calculatedTaxAmount = baseAmount * (selectedTax.rate / 100);

      setTaxBase(baseAmount.toFixed(2));
      setTaxAmount(calculatedTaxAmount.toFixed(2));

      console.log('[InvoiceEditor] Auto-calculado impuesto:', {
        taxCode: selectedTax.tango_code,
        rate: selectedTax.rate,
        base: baseAmount,
        amount: calculatedTaxAmount
      });
    } else {
      // Si no hay rate o net_taxed, dejar que el usuario ingrese manualmente
      setTaxBase('');
      setTaxAmount('');
    }
  };

  const handleAddTax = async () => {
    if (!invoice || !selectedTaxCodeId || !taxAmount) {
      alert('Por favor selecciona un código de impuesto e ingresa el monto');
      return;
    }

    const amount = parseFloat(taxAmount);
    const base = taxBase ? parseFloat(taxBase) : 0;

    if (isNaN(amount) || amount <= 0) {
      alert('Por favor ingresa un monto válido');
      return;
    }

    try {
      const { error } = await supabase.from('invoice_taxes').insert({
        invoice_id: invoice.id,
        tax_code_id: selectedTaxCodeId,
        tax_base: base,
        tax_amount: amount,
      });

      if (error) throw error;

      setSelectedTaxCodeId('');
      setTaxBase('');
      setTaxAmount('');
      await loadData();
    } catch (error) {
      console.error('Error adding tax:', error);
      alert('Error al asignar el impuesto');
    }
  };

  const handleRemoveTax = async (taxId: string) => {
    try {
      await supabase.from('invoice_taxes').delete().eq('id', taxId);
      await loadData();
    } catch (error) {
      console.error('Error removing tax:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{
            borderTopColor: 'rgba(34, 197, 94, 0.8)',
            borderRightColor: 'rgba(34, 197, 94, 0.8)',
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
          }}
        ></div>
      </div>
    );
  }

  if (!invoice) {
    return <div className="p-8 text-center text-green-200">Comprobante no encontrado</div>;
  }

  const tabs = [
    { id: 'basic' as TabType, label: 'Datos Básicos' },
    { id: 'amounts' as TabType, label: 'Importes' },
    { id: 'taxes' as TabType, label: 'Impuestos' },
    { id: 'electronic' as TabType, label: 'Factura Electrónica' },
    { id: 'classification' as TabType, label: 'Códigos' },
    { id: 'concepts' as TabType, label: 'Conceptos' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div
        className="px-8 py-6"
        style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderBottom: '1px solid rgba(34, 197, 94, 0.3)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-6">
            <h2 className="text-2xl font-bold text-white">Editar Comprobante</h2>
            <StatusBadge status={invoice.status} />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2.5 rounded-lg flex items-center space-x-2 transition-all duration-300 hover:scale-105 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.8))',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
              }}
            >
              <Trash2 className="h-4 w-4 text-white" />
              <span className="text-white">{deleting ? 'Eliminando...' : 'Eliminar'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg flex items-center space-x-2 transition-all duration-300 hover:scale-105"
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <X className="h-4 w-4 text-white" />
              <span className="text-white">Cerrar</span>
            </button>
          </div>
        </div>

        {/* Sección de Estado */}
        <div className="flex flex-col items-center space-y-3">
          <div className="flex items-center space-x-3">
            <label className="text-sm font-medium text-green-300">Estado:</label>
            <select
              value={invoice.status}
              onChange={(e) => setInvoice({ ...invoice, status: e.target.value as any })}
              className="px-4 py-2 rounded-lg text-sm text-white transition-all"
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <option value="UPLOADED" style={{ background: '#1a1a1a' }}>Subido</option>
              <option value="PROCESSED" style={{ background: '#1a1a1a' }}>Procesado</option>
              <option value="PENDING_REVIEW" style={{ background: '#1a1a1a' }}>Pendiente de Revisión</option>
              <option value="READY_FOR_EXPORT" style={{ background: '#1a1a1a' }}>Listo para Exportar</option>
              <option value="EXPORTED" style={{ background: '#1a1a1a' }}>Exportado</option>
              <option value="ERROR" style={{ background: '#1a1a1a' }}>Error</option>
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-lg flex items-center space-x-2 disabled:opacity-50 transition-all duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
              boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
            }}
          >
            <Save className="h-4 w-4 text-white" />
            <span className="text-white font-semibold">{saving ? 'Guardando...' : 'Guardar'}</span>
          </button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid rgba(34, 197, 94, 0.2)' }}>
        <div className="px-8">
          <nav className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-6 border-b-2 font-medium text-sm transition-all duration-300 ${activeTab === tab.id
                  ? 'text-white'
                  : 'text-green-300 hover:text-white'
                  }`}
                style={
                  activeTab === tab.id
                    ? {
                      borderBottomColor: 'rgba(34, 197, 94, 0.8)',
                    }
                    : {
                      borderBottomColor: 'transparent',
                    }
                }
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8" style={{ background: 'transparent', minHeight: 0 }}>
        {activeTab === 'basic' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Información del Proveedor</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Proveedor <span className="text-red-400">*</span>
                  </label>
                  <SupplierSearchSelect
                    suppliers={suppliers}
                    selectedSupplierId={invoice.supplier_id || null}
                    onSelect={(supplier) => {
                      if (supplier) {
                        setInvoice({
                          ...invoice,
                          supplier_id: supplier.id,
                          supplier_cuit: supplier.cuit,
                          supplier_name: supplier.razon_social,
                        });
                      } else {
                        setInvoice({
                          ...invoice,
                          supplier_id: null,
                          supplier_cuit: '',
                          supplier_name: '',
                        });
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    CUIT <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.supplier_cuit}
                    onChange={(e) => setInvoice({ ...invoice, supplier_cuit: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Razón Social <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.supplier_name}
                    onChange={(e) => setInvoice({ ...invoice, supplier_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Datos del Comprobante</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Tipo de Comprobante <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={invoice.invoice_type}
                    onChange={(e) =>
                      setInvoice({ ...invoice, invoice_type: e.target.value as any })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    {INVOICE_TYPES_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
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
                      className="w-full px-4 py-3 rounded-lg text-white transition-all"
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Número"
                      value={invoice.invoice_number}
                      onChange={(e) =>
                        setInvoice({ ...invoice, invoice_number: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-lg text-white transition-all"
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Fecha de Emisión <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={invoice.issue_date}
                    onChange={(e) => setInvoice({ ...invoice, issue_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Fecha Contable <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={invoice.accounting_date || ''}
                    onChange={(e) => setInvoice({ ...invoice, accounting_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Moneda CTE <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={invoice.currency_code || 'ARS'}
                    onChange={(e) => setInvoice({ ...invoice, currency_code: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    <option value="ARS">ARS - Peso Argentino</option>
                    <option value="USD">USD - Dólar</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Cotización
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.exchange_rate || 1}
                    onChange={(e) =>
                      setInvoice({ ...invoice, exchange_rate: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Condición de Compra <span className="text-red-400">*</span>
                  </label>
                  <SearchableSelect
                    items={PURCHASE_CONDITIONS}
                    selectedId={invoice.purchase_condition || null}
                    onSelect={(condition) => {
                      setInvoice({
                        ...invoice,
                        purchase_condition: condition?.code || '1',
                      });
                    }}
                    getItemId={(item) => item.code}
                    getItemCode={(item) => item.code}
                    getItemDescription={(item) => item.description}
                    placeholder="Seleccionar condición de compra..."
                  />
                  <p className="mt-1 text-xs text-green-400">
                    1 = Cuenta Corriente (predeterminado) | 2 = Contado
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'amounts' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Importes Base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Subtotal Gravado <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.net_taxed}
                    onChange={(e) =>
                      setInvoice({ ...invoice, net_taxed: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Subtotal No Gravado
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.net_untaxed}
                    onChange={(e) =>
                      setInvoice({ ...invoice, net_untaxed: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Anticipo o Seña
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.advance_payment || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, advance_payment: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Bonificación
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.discount || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, discount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Flete
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.freight || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, freight: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Intereses
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.interest || 0}
                    onChange={(e) =>
                      setInvoice({ ...invoice, interest: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    IVA
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={invoice.iva_amount}
                    onChange={(e) =>
                      setInvoice({ ...invoice, iva_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
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
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div className="md:col-span-2 pt-4" style={{ borderTop: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <label className="block text-sm font-medium text-green-300 mb-2">
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
                  <label className="block text-sm font-medium text-green-300 mb-2">
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
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'taxes' && (
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Asignar Impuesto */}
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Asignar Impuesto</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Código de Impuesto (Alícuota)
                  </label>
                  <SearchableSelect
                    items={taxCodes}
                    selectedId={selectedTaxCodeId}
                    onSelect={(taxCode) => {
                      if (taxCode) {
                        handleTaxCodeSelected(taxCode.id);
                      } else {
                        setSelectedTaxCodeId('');
                      }
                    }}
                    getItemId={(item) => item.id}
                    getItemCode={(item) => item.tango_code || item.code}
                    getItemDescription={(item) => `${item.description}${item.rate ? ` (${item.rate}%)` : ''}`}
                    placeholder="Buscar por código o descripción..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Base Imponible
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={taxBase}
                    onChange={(e) => setTaxBase(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Importe del Impuesto
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddTax}
                      disabled={!selectedTaxCodeId || !taxAmount}
                      className="px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-all duration-300 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
                        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="mt-4 p-4 rounded-lg"
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                <p className="text-xs text-green-200">
                  💡 <strong className="text-white">Auto-cálculo inteligente:</strong> Al seleccionar un impuesto con alícuota conocida (ej: IVA 21%),
                  la base imponible y el monto se calculan automáticamente desde el subtotal gravado. Puedes modificar los valores si es necesario.
                </p>
              </div>
            </div>

            {/* Impuestos Asignados */}
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Impuestos Asignados</h3>

              <div className="space-y-2">
                {invoiceTaxes.map((tax) => (
                  <div
                    key={tax.id}
                    className="flex items-center justify-between p-4 rounded-lg transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">
                        {tax.tax_codes?.tango_code} - {tax.tax_codes?.description}
                      </div>
                      {tax.tax_base > 0 && (
                        <div className="text-xs text-green-200">
                          Base imponible: ${tax.tax_base.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-white">
                        ${tax.tax_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={() => handleRemoveTax(tax.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {invoiceTaxes.length === 0 && (
                  <p className="text-sm text-green-200 text-center py-8">
                    No hay impuestos asignados
                  </p>
                )}
              </div>

              {invoiceTaxes.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-300">Total Impuestos:</span>
                    <span className="text-lg font-bold text-white">
                      ${invoiceTaxes.reduce((sum, tax) => sum + tax.tax_amount, 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'electronic' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Factura Electrónica</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={invoice.is_electronic ?? true}
                      onChange={(e) =>
                        setInvoice({ ...invoice, is_electronic: e.target.checked })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-green-300">
                      Es Factura Electrónica
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    CAI / CAE
                  </label>
                  <input
                    type="text"
                    value={invoice.cai_cae || ''}
                    onChange={(e) => setInvoice({ ...invoice, cai_cae: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                    placeholder="Código de Autorización Electrónica (se extrae automáticamente)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Fecha de Vencimiento del CAI / CAE
                  </label>
                  <input
                    type="date"
                    value={invoice.cai_cae_expiration || ''}
                    onChange={(e) =>
                      setInvoice({ ...invoice, cai_cae_expiration: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'classification' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-2 text-lg">Códigos de Clasificación</h3>
              <p className="text-sm text-green-300 mb-6">
                Estos códigos corresponden a las columnas finales del Excel de Tango Gestión
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Código de Gasto */}
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Código de Gasto
                    <span className="ml-2 text-xs text-gray-400">(Columna U)</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.expense_code || ''}
                    onChange={(e) => setInvoice({ ...invoice, expense_code: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                    placeholder="S/C, 0, 2 o vacío"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Valores válidos: S/C, 0, 2. Se asigna desde conceptos.
                  </p>
                </div>

                {/* Código de Sector */}
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Código de Sector
                    <span className="ml-2 text-xs text-gray-400">(Columna V)</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.sector_code || '2'}
                    onChange={(e) => setInvoice({ ...invoice, sector_code: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                    placeholder="2"
                  />
                  <p className="mt-1 text-xs text-green-400">
                    ✓ Default: 2 (usado en mayoría de planillas)
                  </p>
                </div>

                {/* Código de Clasificador - READ ONLY */}
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Código de Clasificador
                    <span className="ml-2 text-xs text-gray-400">(Columna W)</span>
                    <span className="ml-2 text-xs text-yellow-400">● Automático</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.classifier_code || '0'}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg text-gray-400 transition-all cursor-not-allowed"
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(100, 100, 100, 0.3)',
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Siempre 0 (no editable)
                  </p>
                </div>

                {/* Tipo de Operación AFIP - READ ONLY */}
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Tipo de Operación AFIP
                    <span className="ml-2 text-xs text-gray-400">(Columna X)</span>
                    <span className="ml-2 text-xs text-yellow-400">● Automático</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.afip_operation_type_code || 'O'}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg text-gray-400 transition-all cursor-not-allowed"
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(100, 100, 100, 0.3)',
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    O = Compra estándar (no editable)
                  </p>
                </div>

                {/* Código Comprobante AFIP - READ ONLY */}
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Código de Comprobante AFIP
                    <span className="ml-2 text-xs text-gray-400">(Columna Y)</span>
                    <span className="ml-2 text-xs text-yellow-400">● Automático</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.afip_voucher_code || '001'}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg text-gray-400 transition-all cursor-not-allowed"
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(100, 100, 100, 0.3)',
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    001=Factura, 011=N/C, 012=N/D (según tipo)
                  </p>
                </div>

                {/* Sucursal Destino - READ ONLY */}
                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Nro. de Sucursal Destino
                    <span className="ml-2 text-xs text-gray-400">(Columna Z)</span>
                    <span className="ml-2 text-xs text-yellow-400">● Automático</span>
                  </label>
                  <input
                    type="text"
                    value={invoice.destination_branch_number || '0'}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg text-gray-400 transition-all cursor-not-allowed"
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(100, 100, 100, 0.3)',
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Siempre 0 (no se utiliza)
                  </p>
                </div>

                {/* Observaciones */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Observaciones
                    <span className="ml-2 text-xs text-gray-400">(Columna AA)</span>
                  </label>
                  <textarea
                    value={invoice.observations || ''}
                    onChange={(e) => setInvoice({ ...invoice, observations: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg text-white transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                    placeholder="Observaciones adicionales (campo libre)..."
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Campo totalmente libre, puede ir vacío
                  </p>
                </div>
              </div>

              {/* Info Box */}
              <div className="mt-6 p-4 rounded-lg" style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                <p className="text-sm text-blue-300">
                  <strong>ℹ️ Información:</strong> Los campos marcados con <span className="text-yellow-400">● Automático</span> se completan automáticamente según el tipo de comprobante y no deben modificarse manualmente.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'concepts' && (
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Asignar Concepto Existente */}
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-lg">Asignar Concepto</h3>
                {invoice && (
                  <div className="text-sm">
                    <span className="text-green-300">Total Factura: </span>
                    <span className="font-bold text-white">
                      ${invoice.total_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    {invoiceConcepts.length > 0 && (
                      <>
                        <span className="mx-2 text-green-400">|</span>
                        <span className="text-green-300">Asignado: </span>
                        <span className="font-medium text-green-400">
                          ${getTotalAssignedConcepts().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="mx-2 text-green-400">|</span>
                        <span className="text-green-300">Disponible: </span>
                        <span className={`font-medium ${getAvailableAmount() > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${getAvailableAmount().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Concepto
                  </label>
                  <SearchableSelect
                    items={concepts}
                    selectedId={selectedConceptId}
                    onSelect={(concept) => {
                      setSelectedConceptId(concept?.id || '');
                    }}
                    getItemId={(item) => item.id}
                    getItemCode={(item) => item.tango_concept_code}
                    getItemDescription={(item) => item.description}
                    placeholder="Buscar por código (ej: 786) o descripción (ej: bienes de uso)..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-300 mb-2">
                    Importe
                  </label>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={conceptAmount}
                        onChange={(e) => handleConceptAmountChange(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${conceptError ? 'border-red-500' : 'border-gray-300'
                          }`}
                      />
                      {conceptError && (
                        <p className="text-xs text-red-600 mt-1">{conceptError}</p>
                      )}
                    </div>
                    <button
                      onClick={handleAddConcept}
                      disabled={!selectedConceptId || !conceptAmount || !!conceptError}
                      className="px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-all duration-300 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
                        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="mt-4 p-4 rounded-lg"
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                <p className="text-xs text-green-200">
                  💡 El importe se completa automáticamente con el saldo disponible. Puedes editarlo según tus necesidades.
                </p>
              </div>
            </div>

            {/* Conceptos Asignados */}
            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-lg">Conceptos Asignados</h3>
                <button
                  onClick={() => setShowNewConceptForm(!showNewConceptForm)}
                  className="text-sm text-green-400 hover:text-green-300 flex items-center space-x-1 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Crear Nuevo Concepto</span>
                </button>
              </div>

              {showNewConceptForm && (
                <div
                  className="mb-4 p-4 rounded-lg space-y-3"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <h4 className="text-sm font-medium text-white">Crear Nuevo Concepto Tango</h4>
                  <input
                    type="text"
                    placeholder="Código Tango (ej: 010101)"
                    value={newConceptCode}
                    onChange={(e) => setNewConceptCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Descripción del concepto"
                    value={newConceptDesc}
                    onChange={(e) => setNewConceptDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleCreateConcept}
                      className="flex-1 px-3 py-2 text-white rounded-lg text-sm transition-all duration-300 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
                        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                      }}
                    >
                      Crear y Agregar a la Lista
                    </button>
                    <button
                      onClick={() => {
                        setShowNewConceptForm(false);
                        setNewConceptCode('');
                        setNewConceptDesc('');
                      }}
                      className="px-3 py-2 rounded-lg text-sm text-white transition-all"
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {invoiceConcepts.map((ic) => (
                  <div
                    key={ic.id}
                    className="flex items-center justify-between p-4 rounded-lg transition-all"
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">
                        {ic.tango_concepts.tango_concept_code}
                      </div>
                      <div className="text-xs text-green-200">{ic.tango_concepts.description}</div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-white">
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
                  <p className="text-sm text-green-200 text-center py-8">
                    No hay conceptos asignados
                  </p>
                )}
              </div>
            </div>

            <div
              className="rounded-xl p-8 shadow-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <h3 className="font-semibold text-white mb-6 text-lg">Notas Internas</h3>
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
