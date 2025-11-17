// Este componente muestra un badge visual para el estado de un comprobante.
// Utiliza colores y estilos consistentes definidos en status-labels.

import type { InvoiceStatus } from '../lib/database.types';
import { getStatusLabel, getStatusColor } from '../utils/status-labels';

interface StatusBadgeProps {
  status: InvoiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span 
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
      style={{
        background: 'rgba(34, 197, 94, 0.2)',
        color: '#86efac',
        border: '1px solid rgba(34, 197, 94, 0.4)',
      }}
    >
      {getStatusLabel(status)}
    </span>
  );
}
