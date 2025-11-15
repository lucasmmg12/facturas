// Esta página permite generar archivos de exportación para Tango Gestión.
// Muestra comprobantes listos, genera el archivo Excel y registra la operación.

import { useState, useEffect } from 'react';
import { Download, FileText, AlertCircle } from 'lucide-react';
import { getInvoicesReadyForExport } from '../services/invoice-service';
import { generateTangoExport, downloadExport } from '../services/tango-export-service';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { Database } from '../lib/database.types';
import { getInvoiceTypeLabel } from '../utils/invoice-types';

type Invoice = Database['public']['Tables']['invoices']['Row'];

export function ExportPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const data = await getInvoicesReadyForExport();
      setInvoices(data);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!profile) return;

    try {
      setExporting(true);

      const result = await generateTangoExport(profile.id);

      downloadExport(result.filename, result.data);

      alert(
        `Exportación completada:\n\n` +
          `Archivo: ${result.filename}\n` +
          `Comprobantes: ${result.invoiceIds.length}\n\n` +
          `El archivo Excel se ha descargado con 3 hojas:\n` +
          `• Encabezados\n` +
          `• IVA y Otros Impuestos\n` +
          `• Conceptos\n\n` +
          `Puede importarlo directamente en Tango Gestión.`
      );

      await loadInvoices();
    } catch (error: any) {
      alert('Error al generar exportación: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Exportar a Tango</h1>
          <p className="text-gray-600">
            Genera archivos de importación para Tango Gestión con comprobantes validados
          </p>
        </div>

        {invoices.length > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50 font-medium"
          >
            <Download className="h-5 w-5" />
            <span>{exporting ? 'Generando...' : 'Generar Exportación'}</span>
          </button>
        )}
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No hay comprobantes listos para exportar
          </h3>
          <p className="text-gray-600">
            Los comprobantes deben estar en estado "Listo para Exportar" para poder incluirlos en
            una exportación.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Comprobantes Listos para Exportar
              </h2>
              <span className="text-sm text-gray-600">{invoices.length} comprobantes</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID Interno
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.internal_invoice_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.supplier_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getInvoiceTypeLabel(invoice.invoice_type)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.point_of_sale}-{invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(invoice.issue_date).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${invoice.total_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Total a exportar:{' '}
                <span className="font-semibold">
                  ${invoices.reduce((sum, inv) => sum + inv.total_amount, 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                Los comprobantes exportados cambiarán a estado "Exportado"
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
