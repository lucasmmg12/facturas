import { useCallback, useEffect, useMemo, useState } from 'react';
import { UploadPage } from './UploadPage';
import { DashboardLayout } from '../components/DashboardLayout';
import { StatusBadge } from '../components/StatusBadge';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { getInvoices } from '../services/invoice-service';
import type { Database } from '../lib/database.types';

type Invoice = Database['public']['Tables']['invoices']['Row'];

interface ReviewPanelProps {
  refreshKey: number;
  selectedInvoiceId: string | null;
  onSelectInvoice: (invoiceId: string | null) => void;
  onInvoiceUpdated: () => void;
}

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'upload' | 'review'>('upload');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = useMemo(
    () => [
      { id: 'upload' as const, label: 'Carga automática' },
      { id: 'review' as const, label: 'Revisión y edición' },
    ],
    []
  );

  const activeTabLabel =
    tabs.find((tab) => tab.id === activeTab)?.label ?? 'Panel principal';

  const handleInvoiceCreated = (invoiceId?: string) => {
    setRefreshKey((value) => value + 1);
    setActiveTab('review');
    if (invoiceId) {
      setSelectedInvoiceId(invoiceId);
    }
  };

  const handleInvoiceUpdated = () => {
    setRefreshKey((value) => value + 1);
  };

  return (
    <DashboardLayout title={activeTabLabel}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'upload' && <UploadPage onInvoiceCreated={handleInvoiceCreated} />}

        {activeTab === 'review' && (
          <ReviewPanel
            refreshKey={refreshKey}
            selectedInvoiceId={selectedInvoiceId}
            onSelectInvoice={setSelectedInvoiceId}
            onInvoiceUpdated={handleInvoiceUpdated}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function ReviewPanel({
  refreshKey,
  selectedInvoiceId,
  onSelectInvoice,
  onInvoiceUpdated,
}: ReviewPanelProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getInvoices();
      setInvoices(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar los comprobantes.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices, refreshKey]);

  const formattedInvoices = invoices.map((invoice) => ({
    ...invoice,
    formattedDate: invoice.issue_date
      ? new Date(invoice.issue_date).toLocaleDateString('es-AR')
      : 'Sin fecha',
    formattedTotal: new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(invoice.total_amount ?? 0),
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Comprobantes recientes</h2>
          <p className="text-sm text-slate-500">
            Selecciona un comprobante para revisarlo y editar sus datos.
          </p>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Cargando comprobantes...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : formattedInvoices.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            Todavía no hay comprobantes en el sistema.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Proveedor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Comprobante
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formattedInvoices.map((invoice) => {
                  const isActive = invoice.id === selectedInvoiceId;
                  return (
                    <tr
                      key={invoice.id}
                      role="button"
                      tabIndex={0}
                      className={`cursor-pointer transition ${
                        isActive ? 'bg-slate-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => onSelectInvoice(invoice.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectInvoice(invoice.id);
                        }
                      }}
                    >
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {invoice.formattedDate}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">
                        {invoice.supplier_name}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {invoice.invoice_type} · {invoice.point_of_sale}-{invoice.invoice_number}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-semibold text-slate-900">
                        {invoice.formattedTotal}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <StatusBadge status={invoice.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        {selectedInvoiceId ? (
          <InvoiceEditor
            invoiceId={selectedInvoiceId}
            onClose={() => onSelectInvoice(null)}
            onSave={() => {
              onInvoiceUpdated();
              void loadInvoices();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-12 text-center text-slate-500">
            Selecciona un comprobante de la lista para abrir el editor.
          </div>
        )}
      </div>
    </div>
  );
}

