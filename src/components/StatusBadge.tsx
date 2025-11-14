// Este componente muestra un badge visual para el estado de un comprobante.
// Utiliza colores y estilos consistentes definidos en status-labels.

import type { InvoiceStatus } from '../lib/database.types';
import { getStatusLabel, getStatusColor } from '../utils/status-labels';

interface StatusBadgeProps {
  status: InvoiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}
