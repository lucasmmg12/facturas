import { useCallback, useEffect, useMemo, useState } from 'react';
import { UploadPage } from './UploadPage';
import { ActivityLogPage } from './ActivityLogPage';
import { ChangelogPage } from './ChangelogPage';
import { SuppliersPage } from './SuppliersPage';
import { TaxCodesPage } from './TaxCodesPage';
import { MasterDataPage } from './MasterDataPage';
import { UsersManagementPage } from './UsersManagementPage';
import { DashboardLayout } from '../components/DashboardLayout';
import { StatusBadge } from '../components/StatusBadge';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { ConfirmModal } from '../components/ConfirmModal';
import { ToastContainer } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { getInvoices, getInvoicesReadyForExport, deleteInvoice } from '../services/invoice-service';
import { useAuth } from '../contexts/AuthContext';
import { generateTangoExport, downloadExport } from '../services/tango-export-service';
import type { Database } from '../lib/database.types';
import {
  Instagram,
  MessageCircle,
  Globe,
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
  const [activeTab, setActiveTab] = useState<'upload' | 'review' | 'export' | 'users' | 'maestros' | 'activity' | 'suppliers' | 'tax_codes' | 'changelog'>('upload');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = useMemo(
    () => {
      const baseTabs: Array<{ id: 'upload' | 'review' | 'export' | 'users' | 'maestros' | 'suppliers' | 'tax_codes' | 'activity' | 'changelog'; label: string }> = [
        { id: 'upload', label: 'Carga automática' },
        { id: 'review', label: 'Revisión y edición' },
        { id: 'export', label: 'Exportar a Tango' },
        { id: 'maestros', label: 'Maestros' },
        { id: 'suppliers', label: 'Proveedores' },
        { id: 'tax_codes', label: 'Códigos Impuestos' },
        { id: 'activity', label: 'Mi Historial' },
        { id: 'changelog', label: 'Actualizaciones' },
      ];

      // Solo usuarios con rol REVISION ven la pestaña de usuarios
      if (profile?.role === 'REVISION') {
        baseTabs.splice(3, 0, { id: 'users', label: 'Usuarios' });
      }

      return baseTabs;
    },
    [profile]
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
      <div className="space-y-8 animate-in fade-in duration-700">
        <section className="glass-card">
          <div
            className="flex flex-wrap items-center gap-3 px-6 py-5 bg-black/40 border-b border-grow-border"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300 ${isActive
                    ? 'bg-grow-neon text-black shadow-neon'
                    : 'text-grow-muted hover:text-white hover:bg-white/5'
                    }`}
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

            {activeTab === 'maestros' && <MasterDataPage />}

            {activeTab === 'users' && <UsersManagementPage />}

            {activeTab === 'suppliers' && <SuppliersPage />}

            {activeTab === 'tax_codes' && <TaxCodesPage />}

            {activeTab === 'activity' && <ActivityLogPage />}

            {activeTab === 'changelog' && <ChangelogPage />}
          </div>
        </section>

        <footer className="glass-card mt-16 py-12">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 mb-8">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-white rounded-full p-2 shadow-neon w-fit">
                    <img
                      src="/logogrow.png"
                      alt="Grow Labs Logo"
                      className="h-10 w-10 object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">GROW LABS</h3>
                    <p className="text-grow-neon text-sm font-bold uppercase tracking-widest">Innovation Powered</p>
                  </div>
                </div>
                <p className="text-grow-muted mb-6 leading-relaxed max-w-md">
                  Startup tecnológica impulsada por inteligencia artificial. Transformamos la gestión documental con automatización de vanguardia y trazabilidad financiera inteligente.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://www.instagram.com/growsanjuan/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-gradient-to-br from-pink-500/20 to-orange-500/20 hover:from-pink-500/40 hover:to-orange-500/40 border border-white/10 text-white px-5 py-2.5 rounded-full transition-all"
                  >
                    <Instagram className="w-4 h-4 text-pink-500" />
                    <span className="text-xs font-bold uppercase tracking-wider">Instagram</span>
                  </a>
                  <a
                    href="https://api.whatsapp.com/send/?phone=5492643229503"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-grow-neon/10 hover:bg-grow-neon/20 border border-grow-neon/20 text-grow-neon px-5 py-2.5 rounded-full transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">WhatsApp</span>
                  </a>
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 relative overflow-hidden group">
                <div className="absolute -right-8 -top-8 w-24 h-24 bg-grow-neon/10 blur-3xl rounded-full group-hover:bg-grow-neon/20 transition-all duration-700" />
                <h4 className="text-xl font-black text-white mb-4 flex items-center gap-3">
                  <Stethoscope className="w-6 h-6 text-grow-neon" />
                  CLIENTE EXCLUSIVO
                </h4>
                <div className="space-y-4">
                  <p className="text-grow-muted text-sm leading-relaxed">
                    Plataforma desarrollada a medida para la automatización de procesos críticos de importación en:
                  </p>
                  <div>
                    <p className="text-2xl font-black text-white tracking-tight group-hover:text-grow-neon transition-colors">Sanatorio Argentino</p>
                    <p className="text-grow-muted text-xs font-bold uppercase tracking-widest mt-1">San Juan, Argentina</p>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[10px] text-grow-muted uppercase tracking-[0.2em] font-bold">
                      Tango Gestión · AI Integration · Financial Automation
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 pt-8 mt-4 text-center">
              <p className="text-grow-muted text-[10px] font-bold uppercase tracking-[0.3em]">
                © 2025 GROW LABS · SISTEMA OPERATIVO INTELIGENTE
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const toast = useToast();

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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(invoices.map(inv => inv.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;

    try {
      setDeleting(true);
      setError(null);
      setShowDeleteModal(false);

      // Eliminar todas las facturas seleccionadas
      await Promise.all(
        Array.from(selectedIds).map(id => deleteInvoice(id))
      );

      const count = selectedIds.size;
      const idsToCheck = new Set(selectedIds);

      // Limpiar selección
      setSelectedIds(new Set());

      // Recargar lista
      await loadInvoices();
      onInvoiceUpdated();

      // Si la factura seleccionada fue eliminada, deseleccionar
      if (selectedInvoiceId && idsToCheck.has(selectedInvoiceId)) {
        onSelectInvoice(null);
      }

      // Mostrar notificación de éxito
      toast.success(
        `${count} comprobante${count > 1 ? 's' : ''} eliminado${count > 1 ? 's' : ''} correctamente.`
      );
    } catch (deleteError) {
      const errorMessage = deleteError instanceof Error
        ? deleteError.message
        : 'Error al eliminar los comprobantes.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

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
    <>
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Eliminar comprobantes"
        message={`¿Estás seguro de eliminar ${selectedIds.size} comprobante${selectedIds.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmButtonColor="red"
        isLoading={deleting}
      />
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      <div className="flex flex-col gap-8">
        {/* Comprobantes recientes - Arriba */}
        <div className=" glass-card flex-1">
          <div
            className="px-6 py-5 flex-shrink-0 bg-black/20 border-b border-grow-border"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight">COMPROBANTES RECIENTES</h2>
                <p className="text-xs text-grow-muted font-bold uppercase tracking-widest mt-1">
                  Gestión y Auditoría en tiempo real
                </p>
              </div>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={deleting}
                  className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-full text-xs font-black uppercase tracking-widest transition-all"
                >
                  {deleting ? 'ELIMINANDO...' : `ELIMINAR ${selectedIds.size}`}
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-2 border-grow-neon/20 border-t-grow-neon rounded-full animate-spin mb-4" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-grow-muted">Cargando datos...</p>
              </div>
            ) : error ? (
              <div className="p-12 text-center text-red-400 text-sm font-bold uppercase tracking-widest">{error}</div>
            ) : formattedInvoices.length === 0 ? (
              <div className="p-12 text-center text-grow-muted text-sm font-bold uppercase tracking-widest">
                No hay comprobantes pendientes
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-black/40 border-b border-grow-border">
                      <th className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === invoices.length && invoices.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-4 h-4 rounded border-grow-border bg-black/40 text-grow-neon focus:ring-grow-neon focus:ring-offset-0 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-grow-muted">
                        Fecha
                      </th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-grow-muted">
                        Proveedor
                      </th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-grow-muted">
                        Detalles
                      </th>
                      <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-grow-muted">
                        Total
                      </th>
                      <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-grow-muted">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {formattedInvoices.map((invoice) => {
                      const isActive = invoice.id === selectedInvoiceId;
                      const isSelected = selectedIds.has(invoice.id);
                      return (
                        <tr
                          key={invoice.id}
                          className={`group transition-all duration-300 cursor-pointer ${isActive ? 'bg-grow-neon/10' : 'hover:bg-white/5'
                            }`}
                          onClick={() => onSelectInvoice(invoice.id)}
                        >
                          <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleSelectOne(invoice.id, e.target.checked)}
                              className="w-4 h-4 rounded border-grow-border bg-black/40 text-grow-neon focus:ring-grow-neon focus:ring-offset-0 cursor-pointer"
                            />
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-white/70 group-hover:text-white transition-colors">
                            {invoice.formattedDate}
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-white group-hover:text-grow-neon transition-colors">
                            {invoice.supplier_name}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-grow-muted group-hover:text-white/60">
                              {invoice.invoice_type} · {invoice.point_of_sale}-{invoice.invoice_number}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-black text-white">
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
        </div>

        {/* Editor de Comprobante - Abajo */}
        <div className="glass-card flex-1 min-h-[500px] flex flex-col">
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
            <div className="flex h-full flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                <Globe className="w-8 h-8 text-grow-neon opacity-50" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight uppercase">Editor de Comprobante</h3>
              <p className="text-xs text-grow-muted font-bold uppercase tracking-widest mt-2 max-w-xs leading-relaxed">
                Selecciona un elemento de la lista superior para inspeccionar y auditar sus campos.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
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

      if (!result.diagnostics.valid) {
        setError(`Se encontraron ${result.diagnostics.errors.length} errores de validación. Revise los datos maestros o los comprobantes.`);
        // Optionally show detailed errors. For now, we just alert.
        // Ideally we would show a list.
        console.error('Export diagnostics:', result.diagnostics.errors);
        return;
      }

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
      <div className="rounded-3xl p-8 bg-grow-neon/10 border border-grow-neon/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-grow-neon/5 blur-[100px] -mr-32 -mt-32" />
        <h3 className="text-2xl font-black text-white tracking-tight uppercase flex items-center gap-3">
          <Globe className="w-8 h-8 text-grow-neon" />
          Exportación a Tango Gestión
        </h3>
        <p className="mt-2 text-sm text-grow-muted font-medium max-w-2xl leading-relaxed">
          Generación optimizada de paquetes de datos compatibles con Tango. Proceso automatizado de encabezados, regímenes impositivos y apertura de conceptos.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl px-6 py-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold uppercase tracking-widest">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl px-6 py-4 bg-grow-neon/10 border border-grow-neon/20 text-grow-neon text-sm font-bold uppercase tracking-widest">
          {message}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="glass-card p-8 group hover:border-grow-neon/30 transition-all">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-grow-muted group-hover:text-grow-neon transition-colors">Comprobantes Listos</p>
          <p className="mt-4 text-6xl font-black text-white tracking-tighter">
            {loading ? '...' : readyInvoices.length}
          </p>
        </div>
        <div className="glass-card p-8 group hover:border-grow-neon/30 transition-all">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-grow-muted group-hover:text-grow-neon transition-colors">Monto Proyectado</p>
          <p className="mt-4 text-4xl font-black text-white tracking-tighter">
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
        className="neon-button uppercase tracking-[0.2em] text-xs font-black w-full sm:w-auto"
      >
        {exporting ? 'GENERANDO PAQUETE...' : 'INICIAR EXPORTACIÓN TANGO'}
      </button>

      <div className="glass-card p-6 bg-white/[0.02]">
        <p className="text-[10px] text-grow-muted font-bold uppercase tracking-[0.15em] leading-relaxed">
          El motor generará un archivo dinámico <span className="text-white">Excel (.xlsx)</span> estructurado en tres matrices de datos:
          Encabezados Core, Segmentación Impositiva y Distribución de Conceptos, cumpliendo estrictamente con el esquema de importación de Tango Gestión.
        </p>
      </div>
    </div>
  );
}

