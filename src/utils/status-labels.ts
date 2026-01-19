// Este archivo define las etiquetas y colores para los estados de comprobantes.
// Centraliza la presentación visual de estados en toda la aplicación.

import type { InvoiceStatus } from '../lib/database.types';

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  UPLOADED: 'Cargado',
  PROCESSED: 'Procesado',
  PENDING_REVIEW: 'Pendiente de Revisión',
  READY_FOR_EXPORT: 'Listo para Exportar',
  EXPORTED: 'Exportado',
  ERROR: 'Error',
};

export const STATUS_COLORS: Record<InvoiceStatus, string> = {
  UPLOADED: 'bg-white/5 text-grow-muted border border-white/10',
  PROCESSED: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20',
  PENDING_REVIEW: 'bg-red-500/10 text-red-500 border border-red-500/20',
  READY_FOR_EXPORT: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  EXPORTED: 'bg-grow-neon/10 text-grow-neon border border-grow-neon/20',
  ERROR: 'bg-white text-black border border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]',
};

export function getStatusLabel(status: InvoiceStatus): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusColor(status: InvoiceStatus): string {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';
}

