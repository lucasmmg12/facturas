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
  UPLOADED: 'bg-neutral-50 text-neutral-500 border border-neutral-200',
  PROCESSED: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20',
  PENDING_REVIEW: 'bg-red-500/10 text-red-500 border border-red-500/20',
  READY_FOR_EXPORT: 'bg-primary-500/10 text-primary-400 border border-primary-500/20',
  EXPORTED: 'bg-primary-50 text-primary-500 border border-primary-200',
  ERROR: 'bg-white text-black border border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]',
};

export function getStatusLabel(status: InvoiceStatus): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusColor(status: InvoiceStatus): string {
  return STATUS_COLORS[status] || 'bg-neutral-100 text-neutral-800';
}



