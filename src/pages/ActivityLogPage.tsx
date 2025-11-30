// Página que muestra el historial de actividades del usuario
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Clock, FileText, Upload, Edit, Trash2, Download, Calendar } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: any;
  user_id: string | null;
  created_at: string;
  user?: {
    full_name: string;
    email: string;
  };
}

interface DayActivity {
  date: string;
  uploads: number;
  exports: Array<{
    filename: string;
    invoiceCount: number;
    userName: string;
    time: string;
  }>;
}

export function ActivityLogPage() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [dailyActivities, setDailyActivities] = useState<DayActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [profile]);

  const loadLogs = async () => {
    if (!profile) return;

    try {
      // Cargar todas las actividades (no solo del usuario actual) para ver exportaciones de todos
      // Hacer join con users para obtener el nombre del usuario
      const { data: logsData, error: logsError } = await supabase
        .from('audit_log')
        .select('*')
        .in('action', ['FILE_UPLOAD', 'EXPORT'])
        .order('created_at', { ascending: false })
        .limit(500);

      if (logsError) throw logsError;

      // Obtener IDs únicos de usuarios
      const userIds = [...new Set((logsData || []).map((log: any) => log.user_id).filter(Boolean))];
      
      // Cargar información de usuarios
      let usersMap: Record<string, { full_name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', userIds);

        if (usersData) {
          usersData.forEach((user: any) => {
            usersMap[user.id] = {
              full_name: user.full_name,
              email: user.email,
            };
          });
        }
      }

      // Combinar logs con información de usuarios
      const logsWithUsers = (logsData || []).map((log: any) => ({
        ...log,
        user: log.user_id ? usersMap[log.user_id] || null : null,
      }));
      
      setLogs(logsWithUsers);
      
      // Agrupar actividades por día
      const grouped = groupActivitiesByDay(logsWithUsers);
      setDailyActivities(grouped);
    } catch (error) {
      console.error('Error cargando logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupActivitiesByDay = (logs: AuditLogEntry[]): DayActivity[] => {
    const grouped: Record<string, { dateKey: string; dateFormatted: string; uploads: number; exports: Array<{ filename: string; invoiceCount: number; userName: string; time: string }> }> = {};

    logs.forEach((log) => {
      const dateKey = new Date(log.created_at).toISOString().split('T')[0];
      const dateFormatted = new Date(log.created_at).toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          dateKey,
          dateFormatted,
          uploads: 0,
          exports: [],
        };
      }

      if (log.action === 'FILE_UPLOAD') {
        grouped[dateKey].uploads += 1;
      } else if (log.action === 'EXPORT') {
        const time = new Date(log.created_at).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        grouped[dateKey].exports.push({
          filename: log.changes?.filename || 'Sin nombre',
          invoiceCount: log.changes?.invoice_count || 0,
          userName: log.user?.full_name || log.user?.email || 'Usuario desconocido',
          time,
        });
      }
    });

    // Convertir a array y ordenar por fecha (más reciente primero)
    return Object.entries(grouped)
      .map(([dateKey, data]) => ({
        date: data.dateFormatted,
        dateKey, // Guardar para ordenar
        uploads: data.uploads,
        exports: data.exports,
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey)) // Ordenar por dateKey (ISO string)
      .map(({ dateKey, ...rest }) => rest); // Eliminar dateKey del resultado final
  };

  const getActionIcon = (action: string) => {
    switch (action.toUpperCase()) {
      case 'FILE_UPLOAD':
        return <Upload className="h-4 w-4 text-green-600" />;
      case 'EXPORT':
        return <Download className="h-4 w-4 text-blue-600" />;
      case 'INSERT':
        return <Upload className="h-4 w-4 text-green-600" />;
      case 'UPDATE':
        return <Edit className="h-4 w-4 text-blue-600" />;
      case 'DELETE':
        return <Trash2 className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando historial...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Historial de Actividades</h2>
        <p className="text-gray-600 mt-1">
          Archivos subidos y exportaciones realizadas en el sistema
        </p>
      </div>

      {dailyActivities.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay actividad registrada</p>
        </div>
      ) : (
        <div className="space-y-6">
          {dailyActivities.map((day, dayIndex) => (
            <div key={dayIndex} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Header del día */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-green-600" />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 capitalize">{day.date}</h3>
                      <p className="text-sm text-gray-600">
                        {day.uploads} archivo{day.uploads !== 1 ? 's' : ''} subido{day.uploads !== 1 ? 's' : ''}
                        {day.exports.length > 0 && ` · ${day.exports.length} exportación${day.exports.length !== 1 ? 'es' : ''}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contenido del día */}
              <div className="divide-y divide-gray-200">
                {/* Archivos subidos */}
                {day.uploads > 0 && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Upload className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-900">
                        {day.uploads} archivo{day.uploads !== 1 ? 's' : ''} procesado{day.uploads !== 1 ? 's' : ''} este día
                      </span>
                    </div>
                  </div>
                )}

                {/* Exportaciones */}
                {day.exports.map((exportItem, exportIndex) => (
                  <div key={exportIndex} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 mt-1">
                        <Download className="h-5 w-5 text-blue-600" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Exportación: {exportItem.filename}
                        </p>
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-gray-600">
                            <span className="font-medium">{exportItem.invoiceCount}</span> factura{exportItem.invoiceCount !== 1 ? 's' : ''} exportada{exportItem.invoiceCount !== 1 ? 's' : ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {exportItem.time} · Usuario: <span className="font-medium">{exportItem.userName}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Mensaje si no hay exportaciones ni uploads */}
                {day.uploads === 0 && day.exports.length === 0 && (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No hay actividad registrada este día
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

