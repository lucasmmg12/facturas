// Página que muestra las actualizaciones y mejoras del sistema con estética GrowLabs
import React from 'react';
import { Sparkles, Bug, Zap, Plus, CheckCircle, Calendar, Clock } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
    time?: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '2.1.0',
    date: '28 de Enero, 2026',
    changes: [
      {
        type: 'feature',
        description: 'Intelligence Hub: Dashboard analítico avanzado con KPIs financieros, visualización de tendencias y desglose por proveedor.',
        time: '2026-01-28 15:30'
      },
      {
        type: 'feature',
        description: 'Intelligence Narrative: Sistema de IA para detección de anomalías, radar de inflación y sugerencias tácticas automáticas.',
        time: '2026-01-28 16:15'
      },
      {
        type: 'feature',
        description: 'OCR Adaptive Intelligence: Implementación de sistema con feedback loop para aprendizaje continuo del motor de reconocimiento.',
        time: '2026-01-28 19:40'
      },
      {
        type: 'feature',
        description: 'Exportación de Reportes: Nueva capacidad de exportación a PDF de alta fidelidad para el hub de inteligencia.',
        time: '2026-01-28 17:45'
      },
      {
        type: 'improvement',
        description: 'Control Temporal: Implementación de selectores dinámicos (diario, semanal, mensual, anual) para análisis de datos.',
        time: '2026-01-28 15:50'
      },
      {
        type: 'fix',
        description: 'Optimización de Mapeo: Normalización de lógica de CUIT para asegurar la prioridad de códigos de proveedor Tango.',
        time: '2026-01-28 11:20'
      },
      {
        type: 'fix',
        description: 'Ajuste de Conceptos: Refinamiento de lógica para excluir IVA de los montos sugeridos y validados.',
        time: '2026-01-28 13:15'
      },
      {
        type: 'fix',
        description: 'Consistencia de Datos: Eliminación de duplicados en Puntos de Venta causados por padding inconsistente.',
        time: '2026-01-28 10:45'
      }
    ],
  },
  {
    version: '2.0.0',
    date: 'Enero 2026',
    changes: [
      {
        type: 'feature',
        description: 'Nuevo Manual de Usuario interactivo con soporte de video tutorial integrado para optimizar el flujo de trabajo.',
        time: '2026-01-20 10:12'
      },
      {
        type: 'improvement',
        description: 'Implementación del sistema de diseño GrowLabs: Interfaz Dark Futuristic, Glassmorphism y acentos Spring Green (#00FF88).',
        time: '2026-01-19 16:25'
      },
      {
        type: 'feature',
        description: 'Actualización a GPT-4o con Vision High-Definition para el motor de OCR, mejorando drásticamente la precisión en facturas complejas.',
        time: '2026-01-19 19:56'
      },
      {
        type: 'feature',
        description: 'Soporte para carga de carpetas completas y sistema de feedback en tiempo real durante el procesamiento por lotes.',
        time: '2026-01-19 16:50'
      },
      {
        type: 'improvement',
        description: 'Refactorización total de la página de carga y editor de comprobantes para una experiencia de usuario fluida y eficiente.',
        time: '2026-01-19 17:24'
      },
      {
        type: 'improvement',
        description: 'Mapeo inteligente de proveedores mediante CUIT y algoritmos de normalización de nombres para reducir errores manuales.',
        time: '2026-01-19 18:17'
      },
      {
        type: 'fix',
        description: 'Manejo de errores profesionalizado en Edge Functions y sistema de auto-corrección matemática para discrepancias en totales.',
        time: '2026-01-20 09:19'
      },
      {
        type: 'fix',
        description: 'Optimización del formato de exportación XLSX para Tango Gestión, cumpliendo con los estándares estrictos del sistema contable.',
        time: '2026-01-19 15:42'
      }
    ],
  },
  {
    version: '1.7.0',
    date: '30 de Noviembre, 2024',
    changes: [
      {
        type: 'improvement',
        description: 'Sistema de impuestos mejorado: construcción desde ivaAmount total eliminando problemas de taxBase incorrecto.',
      },
      {
        type: 'feature',
        description: 'Lógica especial para NATURGY SAN JUAN S.A.: cálculo automático de IVA 27%.',
      },
      {
        type: 'improvement',
        description: 'Sistema más permisivo: permite crear facturas con datos faltantes usando valores temporales.',
      },
      {
        type: 'fix',
        description: 'Corregido problema de restricciones NOT NULL en base de datos para facturas incompletas.',
      }
    ],
  },
  {
    version: '1.6.0',
    date: '16 de Noviembre, 2024',
    changes: [
      {
        type: 'improvement',
        description: 'Rediseño estético completo: glassmorphism y mejor espaciado en toda la aplicación.',
      },
      {
        type: 'feature',
        description: 'Nueva página de gestión de códigos de impuestos con CRUD completo.',
      },
      {
        type: 'feature',
        description: 'Auto-cálculo inteligente de impuestos al seleccionar código con alícuota conocida.',
      }
    ],
  },
  {
    version: '1.0.0',
    date: '8 de Noviembre, 2024',
    changes: [
      {
        type: 'feature',
        description: 'Lanzamiento inicial: Sistema de carga con OCR automático e integración con OpenAI.',
      },
      {
        type: 'feature',
        description: 'Gestión de proveedores y exportación a formato Tango Gestión.',
      }
    ],
  },
];

export function ChangelogPage() {
  const getIcon = (type: string) => {
    switch (type) {
      case 'feature':
        return <Plus className="h-4 w-4 text-[#00FF88]" />;
      case 'fix':
        return <Bug className="h-4 w-4 text-red-500" />;
      case 'improvement':
        return <Zap className="h-4 w-4 text-blue-400" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'feature':
        return 'Nueva Funcionalidad';
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
        return 'bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20';
      case 'fix':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'improvement':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white space-y-8 p-4 md:p-8">
      {/* Header Estilo GrowLabs */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#00FF88]/10 to-transparent p-8 border border-white/10">
        <div className="absolute top-0 right-0 p-8 opacity-20">
          <Sparkles className="h-24 w-24 text-[#00FF88]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-[#00FF88] rounded-xl shadow-[0_0_20px_rgba(0,255,136,0.3)]">
              <Sparkles className="h-6 w-6 text-black" />
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">
              Actualizaciones
            </h1>
          </div>
          <p className="text-[#9CA3AF] text-lg max-w-2xl leading-relaxed">
            Explora las últimas mejoras y evoluciones del sistema. Transformando la gestión contable con tecnología de vanguardia.
          </p>
        </div>
      </div>

      <div className="space-y-12 max-w-5xl mx-auto">
        {changelog.map((entry, index) => (
          <div key={index} className="relative group">
            {/* Línea de tiempo vertical */}
            {index !== changelog.length - 1 && (
              <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-gradient-to-b from-[#00FF88]/50 to-transparent" />
            )}

            <div className="flex items-start space-x-6">
              {/* Círculo de la versión */}
              <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full bg-black border-2 border-[#00FF88] flex items-center justify-center shadow-[0_0_15px_rgba(0,255,136,0.2)] group-hover:shadow-[0_0_25px_rgba(0,255,136,0.4)] transition-all duration-300">
                <span className="text-[10px] font-bold text-[#00FF88]">V{entry.version.split('.')[0]}</span>
              </div>

              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-white group-hover:text-[#00FF88] transition-colors">
                      Versión {entry.version}
                    </h3>
                    <div className="flex items-center text-[#9CA3AF] text-sm mt-1">
                      <Calendar className="h-4 w-4 mr-2 text-[#00FF88]" />
                      {entry.date}
                    </div>
                  </div>
                  {index === 0 && (
                    <span className="mt-2 md:mt-0 px-4 py-1 rounded-full text-xs font-black bg-[#00FF88] text-black uppercase tracking-wider animate-pulse">
                      Última Entrega
                    </span>
                  )}
                </div>

                <div className="grid gap-4">
                  {entry.changes.map((change, changeIndex) => (
                    <div
                      key={changeIndex}
                      className="group/item bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 hover:border-[#00FF88]/40 hover:bg-white/[0.08] transition-all duration-300"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="mt-1 p-2 bg-black/40 rounded-lg border border-white/5">
                          {getIcon(change.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter ${getTypeBadgeClass(change.type)}`}>
                              {getTypeLabel(change.type)}
                            </span>
                            {change.time && (
                              <span className="flex items-center text-[10px] text-[#9CA3AF] bg-black/40 px-2 py-0.5 rounded-lg border border-white/5">
                                <Clock className="h-3 w-3 mr-1 opacity-60" />
                                {change.time}
                              </span>
                            )}
                          </div>
                          <p className="text-[#D1D5DB] text-sm leading-relaxed font-medium">
                            {change.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer / CTA Estilo GrowLabs */}
      <div className="mt-16 text-center">
        <div className="inline-block p-[1px] rounded-full bg-gradient-to-r from-transparent via-[#00FF88] to-transparent mb-6 w-full max-w-md" />
        <h4 className="text-xl font-bold text-white mb-2">¿Tienes alguna sugerencia de mejora?</h4>
        <p className="text-[#9CA3AF] mb-8 max-w-lg mx-auto">
          Nuestra tecnología evoluciona contigo. Si tienes ideas para perfeccionar el sistema, estamos listos para escucharte.
        </p>
        <button className="px-8 py-3 bg-[#00FF88] hover:bg-[#00FF88]/90 text-black font-black rounded-full shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:scale-105 transition-all duration-300 uppercase tracking-widest text-sm">
          Contactar Soporte
        </button>
      </div>
    </div>
  );
}
