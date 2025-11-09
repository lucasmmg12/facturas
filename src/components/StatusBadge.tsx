import type { InvoiceStatus } from '../lib/database.types';

interface StatusBadgeProps {
  status: InvoiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig: Record<InvoiceStatus, { label: string; className: string }> = {
    UPLOADED: { label: 'Subido', className: 'bg-gray-100 text-gray-800' },
    PROCESSED: { label: 'Procesado', className: 'bg-blue-100 text-blue-800' },
    PENDING_REVIEW: { label: 'Revisión Pendiente', className: 'bg-yellow-100 text-yellow-800' },
    READY_FOR_EXPORT: { label: 'Listo para Exportar', className: 'bg-green-100 text-green-800' },
    EXPORTED: { label: 'Exportado', className: 'bg-purple-100 text-purple-800' },
    ERROR: { label: 'Error', className: 'bg-red-100 text-red-800' },
  };

  const config = statusConfig[status];

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
