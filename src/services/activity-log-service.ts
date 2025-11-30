// Servicio para registrar actividades en el audit_log
import { supabase } from '../lib/supabase';

export interface ActivityLogData {
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  changes?: any;
}

/**
 * Registra una actividad en el audit_log
 */
export async function logActivity(data: ActivityLogData): Promise<void> {
  try {
    const { error } = await supabase
      .from('audit_log')
      .insert({
        user_id: data.user_id,
        action: data.action,
        entity_type: data.entity_type,
        entity_id: data.entity_id || null,
        changes: data.changes || null,
      });

    if (error) {
      console.error('[Activity Log] Error al registrar actividad:', error);
      // No lanzar error para no interrumpir el flujo principal
    } else {
      console.log('[Activity Log] Actividad registrada:', data.action, data.entity_type);
    }
  } catch (error) {
    console.error('[Activity Log] Error inesperado al registrar actividad:', error);
    // No lanzar error para no interrumpir el flujo principal
  }
}

/**
 * Registra la subida de un archivo
 */
export async function logFileUpload(userId: string, filename: string, invoiceId?: string): Promise<void> {
  await logActivity({
    user_id: userId,
    action: 'FILE_UPLOAD',
    entity_type: 'file',
    entity_id: invoiceId || null,
    changes: {
      filename,
      invoice_id: invoiceId || null,
    },
  });
}

/**
 * Registra una exportación
 */
export async function logExport(userId: string, batchId: string, filename: string, invoiceCount: number): Promise<void> {
  await logActivity({
    user_id: userId,
    action: 'EXPORT',
    entity_type: 'export_batch',
    entity_id: batchId,
    changes: {
      filename,
      invoice_count: invoiceCount,
    },
  });
}

