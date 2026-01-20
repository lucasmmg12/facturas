import {
    UploadCloud,
    FileSearch,
    FileCheck,
    Database,
    ArrowRight,
    Zap,
    ShieldCheck,
    Download
} from 'lucide-react';

export function UserManualPage() {
    const steps = [
        {
            id: '01',
            title: 'Carga Inteligente',
            icon: <UploadCloud className="w-8 h-8 text-white" />,
            description: 'Arrastra tus archivos PDF o imágenes al área de carga. Nuestro motor de IA procesará automáticamente cada documento, identificando el tipo de comprobante, proveedor y montos.',
            features: ['Soporte Multi-archivo', 'Detección automática de duplicados', 'Validación de formatos (PDF, Images)'],
            color: 'from-blue-500/20 to-cyan-500/20'
        },
        {
            id: '02',
            title: 'Auditoría OCR',
            icon: <FileSearch className="w-8 h-8 text-white" />,
            description: 'El sistema extrae y normaliza la información clave: Fecha, Total, CUIT, Puntos de Venta y CAE. Los datos se cruzan con tu base de proveedores para garantizar consistencia.',
            features: ['Extracción de alta precisión', 'Mapeo inteligente de impuestos', 'Alerta de datos faltantes'],
            color: 'from-purple-500/20 to-pink-500/20'
        },
        {
            id: '03',
            title: 'Revisión y Edición',
            icon: <FileCheck className="w-8 h-8 text-white" />,
            description: 'Verifica los resultados en el panel de revisión. Puedes corregir cualquier campo manualmente y asignar los conceptos contables correspondientes antes de aprobar el comprobante.',
            features: ['Edición en línea', 'Asignación de centros de costo', 'Validación de totales'],
            color: 'from-orange-500/20 to-red-500/20'
        },
        {
            id: '04',
            title: 'Exportación Tango',
            icon: <Download className="w-8 h-8 text-white" />,
            description: 'Una vez validados, genera el paquete de exportación compatible con Tango Gestión. El sistema crea un archivo Excel estructurado listo para ser importado sin errores.',
            features: ['Formato 100% compatible', 'Apertura de alícuotas', 'Reporte de inconsistencias'],
            color: 'from-grow-neon/20 to-emerald-500/20'
        }
    ];

    return (
        <div className="space-y-12 animate-in fade-in duration-700 pb-12">
            {/* Hero Header */}
            <section className="relative overflow-hidden rounded-3xl bg-black border border-white/10 p-12 text-center group">
                <div className="absolute inset-0 bg-grow-neon/5 blur-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-1000" />
                <div className="relative z-10 max-w-3xl mx-auto space-y-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-grow-neon text-xs font-black uppercase tracking-[0.2em]">
                        <Zap className="w-3 h-3" />
                        <span>Documentación Oficial</span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase">
                        Manual de Operaciones
                    </h2>
                    <p className="text-grow-muted text-lg leading-relaxed font-medium">
                        Domina el flujo de trabajo de <span className="text-white">Grow Labs</span>. Una guía completa para llevar la automatización contable al siguiente nivel.
                    </p>
                </div>
            </section>

            {/* Main Grid */}
            <div className="grid gap-8 md:grid-cols-2">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        className="group relative overflow-hidden rounded-3xl bg-black/40 border border-white/10 hover:border-grow-neon/30 transition-all duration-500"
                    >
                        <div className={`absolute inset-0 bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl`} />

                        <div className="relative p-8 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                    {step.icon}
                                </div>
                                <span className="text-6xl font-black text-white/5 select-none">{step.id}</span>
                            </div>

                            <div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-3">
                                    {step.title}
                                </h3>
                                <p className="text-grow-muted leading-relaxed font-medium">
                                    {step.description}
                                </p>
                            </div>

                            <div className="space-y-3 pt-6 border-t border-white/5">
                                {step.features.map((feature, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <ShieldCheck className="w-4 h-4 text-grow-neon" />
                                        <span className="text-sm text-white/70 font-medium">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Config Section */}
            <section className="rounded-3xl bg-white/5 border border-white/10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-12">
                <div className="flex-1 space-y-6">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                        <Database className="w-6 h-6 text-grow-neon" />
                        Gestión de Maestros
                    </h3>
                    <p className="text-grow-muted leading-relaxed">
                        Mantén tu base de datos actualizada para maximizar la precisión de la IA. Configura proveedores frecuentes y códigos de impuestos personalizados para automatizar aún más la categorización.
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center">
                            <span className="block text-2xl font-black text-white mb-1">Proveedores</span>
                            <span className="text-[10px] uppercase tracking-widest text-grow-muted">Configuración</span>
                        </div>
                        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center">
                            <span className="block text-2xl font-black text-white mb-1">Impuestos</span>
                            <span className="text-[10px] uppercase tracking-widest text-grow-muted">Ajustes</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 w-full relative">
                    <div className="aspect-video rounded-2xl bg-black border border-white/10 overflow-hidden shadow-2xl shadow-grow-neon/10 group">
                        <iframe
                            className="w-full h-full"
                            src="https://www.youtube.com/embed/GcUQSQI2vZ8?si=Gxlupw2yTG6YuQ0q"
                            title="Tutorial Grow Labs"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                        ></iframe>
                    </div>
                    <p className="text-center mt-4 text-xs font-bold uppercase tracking-widest text-grow-neon">
                        ▶ Ver Video Tutorial: Flujo Completo
                    </p>
                </div>
            </section>

            <div className="text-center pt-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-grow-muted opacity-50">
                    Grow Labs Knowledge Base · v2025
                </p>
            </div>
        </div>
    );
}
