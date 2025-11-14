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
  UPLOADED: 'bg-gray-100 text-gray-800',
  PROCESSED: 'bg-blue-100 text-blue-800',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
  READY_FOR_EXPORT: 'bg-green-100 text-green-800',
  EXPORTED: 'bg-slate-100 text-slate-800',
  ERROR: 'bg-red-100 text-red-800',
};

export function getStatusLabel(status: InvoiceStatus): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusColor(status: InvoiceStatus): string {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';
}

