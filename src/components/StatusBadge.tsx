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
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${colorClasses}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}
