// Página que muestra el historial de actividades del usuario
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Clock, FileText, Upload, Edit, Trash2, Download } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: any;
  new_values: any;
  user_id: string;
  user_name: string;
  created_at: string;
}

export function ActivityLogPage() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadLogs();
  }, [profile]);

  const loadLogs = async () => {
    if (!profile) return;

    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error cargando logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action.toUpperCase()) {
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

  const getActionLabel = (action: string, tableName: string) => {
    const tableLabels: Record<string, string> = {
      invoices: 'Comprobante',
      suppliers: 'Proveedor',
      export_batches: 'Exportación',
      tango_concepts: 'Concepto Tango',
      invoice_concepts: 'Concepto de Comprobante',
    };

    const actionLabels: Record<string, string> = {
      INSERT: 'Creó',
      UPDATE: 'Modificó',
      DELETE: 'Eliminó',
    };

    const table = tableLabels[tableName] || tableName;
    const actionLabel = actionLabels[action.toUpperCase()] || action;

    return `${actionLabel} ${table}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.action.toUpperCase() === filter);

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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Historial de Actividades</h2>
          <p className="text-gray-600 mt-1">Tu actividad reciente en el sistema</p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setFilter('INSERT')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'INSERT'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Creadas
          </button>
          <button
            onClick={() => setFilter('UPDATE')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'UPDATE'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Modificadas
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay actividad registrada</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="divide-y divide-gray-200">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 mt-1">
                    {getActionIcon(log.action)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {getActionLabel(log.action, log.table_name)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {formatDate(log.created_at)}
                    </p>
                    
                    {log.new_values && Object.keys(log.new_values).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                          Ver detalles
                        </summary>
                        <div className="mt-2 text-xs bg-gray-50 p-2 rounded">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(log.new_values, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

