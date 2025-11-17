import { useCallback, useEffect, useMemo, useState } from 'react';
import { UploadPage } from './UploadPage';
import { ActivityLogPage } from './ActivityLogPage';
import { ChangelogPage } from './ChangelogPage';
import { SuppliersPage } from './SuppliersPage';
import { TaxCodesPage } from './TaxCodesPage';
import { DashboardLayout } from '../components/DashboardLayout';
import { StatusBadge } from '../components/StatusBadge';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { getInvoices, getInvoicesReadyForExport } from '../services/invoice-service';
import { useAuth } from '../contexts/AuthContext';
import { generateTangoExport, downloadExport } from '../services/tango-export-service';
import type { Database } from '../lib/database.types';
import {
  Instagram,
  MessageCircle,
  Globe,
  Linkedin,
  Stethoscope,
} from 'lucide-react';

type Invoice = Database['public']['Tables']['invoices']['Row'];

interface ReviewPanelProps {
  refreshKey: number;
  selectedInvoiceId: string | null;
  onSelectInvoice: (invoiceId: string | null) => void;
  onInvoiceUpdated: () => void;
}

export function DashboardPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'upload' | 'review' | 'export' | 'activity' | 'suppliers' | 'tax_codes' | 'changelog'>('upload');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = useMemo(
    () => [
      { id: 'upload' as const, label: 'Carga automática' },
      { id: 'review' as const, label: 'Revisión y edición' },
      { id: 'export' as const, label: 'Exportar a Tango' },
      { id: 'suppliers' as const, label: 'Proveedores' },
      { id: 'tax_codes' as const, label: 'Códigos Impuestos' },
      { id: 'activity' as const, label: 'Mi Historial' },
      { id: 'changelog' as const, label: 'Actualizaciones' },
    ],
    []
  );

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
    <DashboardLayout title="Grow Labs · Gestión de comprobantes">
      <div className="space-y-8">
        <section 
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(34, 197, 94, 0.2)',
          }}
        >
          <div 
            className="flex flex-wrap items-center gap-3 px-6 py-5"
            style={{
              borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? 'text-white shadow-lg'
                      : 'text-green-300 hover:text-white'
                  }`}
                  style={
                    isActive
                      ? {
                          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
                          boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                        }
                      : {
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                        }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-6 sm:p-8">
            {activeTab === 'upload' && <UploadPage onInvoiceCreated={handleInvoiceCreated} />}

            {activeTab === 'review' && (
              <ReviewPanel
                refreshKey={refreshKey}
                selectedInvoiceId={selectedInvoiceId}
                onSelectInvoice={setSelectedInvoiceId}
                onInvoiceUpdated={handleInvoiceUpdated}
              />
            )}

            {activeTab === 'export' && profile && (
              <ExportPanel
                refreshKey={refreshKey}
                profileId={profile.id}
                onExportCompleted={handleInvoiceUpdated}
              />
            )}

            {activeTab === 'export' && !profile && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-700">
                Necesitamos tu perfil para generar el archivo de exportación. Vuelve a iniciar sesión e inténtalo
                nuevamente.
              </div>
            )}

            {activeTab === 'suppliers' && <SuppliersPage />}

            {activeTab === 'tax_codes' && <TaxCodesPage />}

            {activeTab === 'activity' && <ActivityLogPage />}

            {activeTab === 'changelog' && <ChangelogPage />}
          </div>
        </section>

        <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 text-white py-12 mt-16 rounded-3xl shadow-xl">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src="/logo-header.png"
                    alt="Grow Labs Logo"
                    className="h-12 w-12 object-contain bg-white rounded-full p-1"
                  />
                  <div>
                    <h3 className="text-2xl font-bold text-white">Grow Labs</h3>
                    <p className="text-blue-400 text-sm font-medium">Donde tus ideas crecen</p>
                  </div>
                </div>
                <p className="text-gray-300 mb-4 leading-relaxed">
                  Startup tecnológica especializada en inteligencia artificial y automatización de procesos.
                  Transformamos ideas en soluciones innovadoras para gestión documental y trazabilidad financiera.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://www.instagram.com/growsanjuan/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-gradient-to-br from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <Instagram className="w-5 h-5" />
                    <span className="text-sm font-medium">Instagram</span>
                  </a>
                  <a
                    href="https://api.whatsapp.com/send/?phone=5492643229503&text&type=phone_number&app_absent=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </a>
                </div>
                <div className="flex flex-wrap gap-3 mt-3">
                  <a
                    href="https://www.growsanjuan.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <Globe className="w-5 h-5" />
                    <span className="text-sm font-medium">Sitio Web</span>
                  </a>
                  <a
                    href="https://www.linkedin.com/in/lucas-marinero-182521308/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <Linkedin className="w-5 h-5" />
                    <span className="text-sm font-medium">LinkedIn</span>
                  </a>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
                <h4 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                  <Stethoscope className="w-6 h-6 text-blue-400" />
                  Cliente Exclusivo
                </h4>
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    Esta plataforma fue desarrollada a medida para automatizar la importación de comprobantes en:
                  </p>
                  <p className="text-xl font-bold text-blue-400">Sanatorio Argentino</p>
                  <p className="text-gray-400 text-sm">San Juan, Argentina</p>
                  <div className="mt-4 pt-4 border-t border-gray-600">
                    <p className="text-xs text-gray-400">
                      Sistema de gestión y exportación de comprobantes con integración a Tango Gestión y motores de IA.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-700 pt-6 text-center">
              <p className="text-gray-400 text-sm">
                © 2025 Grow Labs. Todos los derechos reservados. | Powered by IA & Automatización financiera
              </p>
            </div>
          </div>
        </footer>
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
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div 
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
        }}
      >
        <div 
          className="px-6 py-5"
          style={{
            borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
          }}
        >
          <h2 className="text-lg font-semibold text-white mb-1">Comprobantes recientes</h2>
          <p className="text-sm text-green-200">
            Selecciona un comprobante para revisarlo y editar sus datos.
          </p>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-green-200">Cargando comprobantes...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">{error}</div>
        ) : formattedInvoices.length === 0 ? (
          <div className="p-6 text-sm text-green-200">
            Todavía no hay comprobantes en el sistema.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-green-300">
                    Fecha
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-green-300">
                    Proveedor
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-green-300">
                    Comprobante
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-green-300">
                    Total
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wide text-green-300">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {formattedInvoices.map((invoice) => {
                  const isActive = invoice.id === selectedInvoiceId;
                  return (
                    <tr
                      key={invoice.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition-all duration-200"
                      style={{
                        background: isActive 
                          ? 'rgba(34, 197, 94, 0.2)' 
                          : 'transparent',
                        borderBottom: '1px solid rgba(34, 197, 94, 0.1)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                      onClick={() => onSelectInvoice(invoice.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectInvoice(invoice.id);
                        }
                      }}
                    >
                      <td className="px-6 py-4 text-sm text-white">
                        {invoice.formattedDate}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-white">
                        {invoice.supplier_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-green-200">
                        {invoice.invoice_type} · {invoice.point_of_sale}-{invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-white">
                        {invoice.formattedTotal}
                      </td>
                      <td className="px-6 py-4 text-center">
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

      <div 
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          minHeight: '600px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
          <div className="flex h-full items-center justify-center p-12 text-center text-green-200">
            Selecciona un comprobante de la lista para abrir el editor.
          </div>
        )}
      </div>
    </div>
  );
}

interface ExportPanelProps {
  refreshKey: number;
  profileId: string;
  onExportCompleted: () => void;
}

function ExportPanel({ refreshKey, profileId, onExportCompleted }: ExportPanelProps) {
  const [readyInvoices, setReadyInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReadyInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getInvoicesReadyForExport();
      setReadyInvoices(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar los comprobantes listos para exportar.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReadyInvoices();
  }, [loadReadyInvoices, refreshKey]);

  const totalAmount = readyInvoices.reduce((sum, invoice) => sum + (invoice.total_amount ?? 0), 0);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      setMessage(null);

      const result = await generateTangoExport(profileId);
      downloadExport(result.filename, result.data);

      setMessage(`Exportamos ${result.invoiceIds.length} comprobantes correctamente.`);
      onExportCompleted();
      await loadReadyInvoices();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'No pudimos generar la exportación. Intenta nuevamente.'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div 
        className="rounded-xl p-6"
        style={{
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
        }}
      >
        <h3 className="text-xl font-semibold text-white">Exportación a Tango Gestión</h3>
        <p className="mt-2 text-sm text-green-200">
          Genera un archivo compatible con Tango que incluye encabezados, impuestos y conceptos para cada comprobante.
        </p>
      </div>

      {error && (
        <div 
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div 
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            color: '#86efac',
          }}
        >
          {message}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div 
          className="rounded-xl p-6 shadow-2xl"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          }}
        >
          <p className="text-sm font-medium text-green-300">Comprobantes listos</p>
          <p className="mt-2 text-4xl font-bold text-white">
            {loading ? '...' : readyInvoices.length}
          </p>
        </div>
        <div 
          className="rounded-xl p-6 shadow-2xl"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          }}
        >
          <p className="text-sm font-medium text-green-300">Total acumulado</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {loading
              ? '...'
              : totalAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting || readyInvoices.length === 0}
        className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        style={{
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
          boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
        }}
      >
        {exporting ? 'Generando archivo...' : 'Exportar a Tango Gestión'}
      </button>

      <p className="text-sm text-green-200">
        El archivo se descargará en formato <span className="font-semibold text-white">Excel (.xlsx)</span> con tres hojas:
        Encabezados, IVA y Otros Impuestos, y Conceptos, siguiendo el formato oficial de importación de Tango Gestión.
      </p>
    </div>
  );
}

