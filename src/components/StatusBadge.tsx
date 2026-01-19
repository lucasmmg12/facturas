// Este componente muestra un badge visual para el estado de un comprobante.
// Utiliza colores y estilos consistentes definidos en status-labels.

import type { InvoiceStatus } from '../lib/database.types';
import { getStatusLabel, getStatusColor } from '../utils/status-labels';

interface StatusBadgeProps {
  status: InvoiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colorClasses = getStatusColor(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${colorClasses}`}
    >
      <span className={`w-1 h-1 rounded-full ${status === 'ERROR' ? 'bg-black' : 'bg-current'}`} />
      {getStatusLabel(status)}
    </span>
  );
}
