// Página que muestra las actualizaciones y mejoras del sistema
import { Sparkles, Bug, Zap, Plus, CheckCircle } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '1.4.0',
    date: '15 de Noviembre, 2024 (noche)',
    changes: [
      {
        type: 'feature',
        description: 'Exportación en formato XLSX real - archivos Excel nativos compatibles con la plantilla de Tango',
      },
      {
        type: 'improvement',
        description: 'Archivo Excel con 3 hojas: Encabezados, IVA y Otros Impuestos, y Conceptos',
      },
      {
        type: 'improvement',
        description: 'Anchos de columna optimizados para mejor visualización en Excel',
      },
      {
        type: 'improvement',
        description: 'Formato de archivo compatible directamente con la importación de Tango Gestión',
      },
    ],
  },
  {
    version: '1.3.0',
    date: '15 de Noviembre, 2024 (noche)',
    changes: [
      {
        type: 'feature',
        description: 'Auto-completado inteligente del importe al asignar conceptos (usa automáticamente el saldo disponible)',
      },
      {
        type: 'feature',
        description: 'Visualización en tiempo real del total de la factura, monto asignado y disponible',
      },
      {
        type: 'improvement',
        description: 'Validación automática que impide exceder el total de la factura al asignar conceptos',
      },
      {
        type: 'improvement',
        description: 'Campo de importe editable para dividir el total entre múltiples conceptos',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '15 de Noviembre, 2024 (tarde)',
    changes: [
      {
        type: 'feature',
        description: 'Selector de estado en el editor de comprobantes - ahora puedes cambiar el estado directamente',
      },
      {
        type: 'feature',
        description: 'Interfaz para asignar conceptos existentes a comprobantes',
      },
      {
        type: 'improvement',
        description: 'Reorganizada la pestaña de Conceptos con secciones claras',
      },
      {
        type: 'fix',
        description: 'Corregido problema que impedía cambiar el estado de facturas para exportar',
      },
      {
        type: 'fix',
        description: 'Solucionado problema de asignación de conceptos a comprobantes',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '15 de Noviembre, 2024',
    changes: [
      {
        type: 'feature',
        description: 'Agregado botón de cerrar sesión en el header del dashboard',
      },
      {
        type: 'feature',
        description: 'Nuevo historial de actividades para ver tu actividad en el sistema',
      },
      {
        type: 'feature',
        description: 'Página de notas de actualización (esta página)',
      },
      {
        type: 'fix',
        description: 'Corregido problema de registro - ahora se crea el perfil automáticamente',
      },
      {
        type: 'fix',
        description: 'Corregidas funciones de autenticación (signIn, signUp, signOut)',
      },
      {
        type: 'improvement',
        description: 'Mejorado el manejo de errores en el inicio de sesión',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '8 de Noviembre, 2024',
    changes: [
      {
        type: 'feature',
        description: 'Sistema de carga de comprobantes con OCR automático',
      },
      {
        type: 'feature',
        description: 'Integración con OpenAI para extracción precisa de datos',
      },
      {
        type: 'feature',
        description: 'Gestión de proveedores y comprobantes',
      },
      {
        type: 'feature',
        description: 'Exportación a formato Tango Gestión',
      },
      {
        type: 'feature',
        description: 'Sistema de autenticación y roles de usuario',
      },
      {
        type: 'feature',
        description: 'Dashboard con estadísticas y navegación',
      },
    ],
  },
];

export function ChangelogPage() {
  const getIcon = (type: string) => {
    switch (type) {
      case 'feature':
        return <Plus className="h-4 w-4 text-green-600" />;
      case 'fix':
        return <Bug className="h-4 w-4 text-red-600" />;
      case 'improvement':
        return <Zap className="h-4 w-4 text-blue-600" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'feature':
        return 'Nueva funcionalidad';
      case 'fix':
        return 'Corrección';
      case 'improvement':
        return 'Mejora';
      default:
        return type;
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'feature':
        return 'bg-green-100 text-green-800';
      case 'fix':
        return 'bg-red-100 text-red-800';
      case 'improvement':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notas de Actualización</h2>
          <p className="text-gray-600 mt-1">
            Historial de mejoras, correcciones y nuevas funcionalidades del sistema
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {changelog.map((entry, index) => (
          <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
            {/* Header de la versión */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Versión {entry.version}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{entry.date}</p>
                </div>
                {index === 0 && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Más reciente
                  </span>
                )}
              </div>
            </div>

            {/* Lista de cambios */}
            <div className="p-6">
              <ul className="space-y-4">
                {entry.changes.map((change, changeIndex) => (
                  <li key={changeIndex} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(change.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeClass(
                            change.type
                          )}`}
                        >
                          {getTypeLabel(change.type)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{change.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* Información adicional */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">¿Tienes alguna sugerencia?</h4>
            <p className="text-sm text-blue-700 mt-1">
              Si tienes ideas para nuevas funcionalidades o has encontrado algún problema, 
              por favor contáctanos para seguir mejorando el sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

