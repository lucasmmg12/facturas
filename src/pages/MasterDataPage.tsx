import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { importProviders, importConcepts, importAliquotas, ImportResult } from '../services/master-data-service';

export function MasterDataPage() {
    const [loading, setLoading] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, ImportResult | null>>({
        providers: null,
        concepts: null,
        aliquots: null,
    });

    const handleFileUpload = async (type: 'providers' | 'concepts' | 'aliquots', file: File) => {
        setLoading(type);
        setResults(prev => ({ ...prev, [type]: null }));

        try {
            let result: ImportResult;
            switch (type) {
                case 'providers':
                    result = await importProviders(file);
                    break;
                case 'concepts':
                    result = await importConcepts(file);
                    break;
                case 'aliquots':
                    result = await importAliquotas(file);
                    break;
            }
            setResults(prev => ({ ...prev, [type]: result }));
        } catch (error: any) {
            setResults(prev => ({
                ...prev,
                [type]: { success: false, message: error.message || 'Error desconocido' }
            }));
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                    <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                        Maestros
                    </span>
                </h1>
                <p className="text-green-200">
                    Importación masiva de tablas maestras desde Excel.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <ImportCard
                    title="Proveedores"
                    description="Importar tabla de proveedores (codigo_proveedor, razon_social, quit)"
                    type="providers"
                    loading={loading === 'providers'}
                    result={results.providers}
                    onUpload={(file) => handleFileUpload('providers', file)}
                />
                <ImportCard
                    title="Conceptos de Compra"
                    description="Importar conceptos (codigo_concepto, descripcion, alicuota_iva, codigo_impuesto)"
                    type="concepts"
                    loading={loading === 'concepts'}
                    result={results.concepts}
                    onUpload={(file) => handleFileUpload('concepts', file)}
                />
                <ImportCard
                    title="Alícuotas"
                    description="Importar alícuotas (codigo_impuesto, descripcion, alicuota, tipo, codigo_tango)"
                    type="aliquots"
                    loading={loading === 'aliquots'}
                    result={results.aliquots}
                    onUpload={(file) => handleFileUpload('aliquots', file)}
                />
            </div>
        </div>
    );
}

interface ImportCardProps {
    title: string;
    description: string;
    type: string;
    loading: boolean;
    result: ImportResult | null;
    onUpload: (file: File) => void;
}

function ImportCard({ title, description, type, loading, result, onUpload }: ImportCardProps) {
    return (
        <div
            className="rounded-xl p-6 flex flex-col h-full"
            style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
                    <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
            </div>

            <p className="text-sm text-green-200 mb-6 flex-grow">
                {description}
            </p>

            <div className="mt-auto space-y-4">
                <label className="block w-full cursor-pointer group">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onUpload(file);
                            // Reset input
                            e.target.value = '';
                        }}
                        disabled={loading}
                    />
                    <div
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg border-2 border-dashed border-green-500/30 text-green-300 transition-all group-hover:border-green-500/60 group-hover:text-white group-hover:bg-green-500/10"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Upload className="w-5 h-5" />
                        )}
                        <span className="font-medium">
                            {loading ? 'Procesando...' : 'Subir Excel'}
                        </span>
                    </div>
                </label>

                {result && (
                    <div
                        className={`rounded-lg p-4 text-sm ${result.success
                                ? 'bg-green-500/20 border border-green-500/30 text-green-200'
                                : 'bg-red-500/20 border border-red-500/30 text-red-200'
                            }`}
                    >
                        <div className="flex items-start gap-2">
                            {result.success ? (
                                <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-400" />
                            ) : (
                                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
                            )}
                            <div>
                                <p className="font-medium">{result.message}</p>
                                {result.errors && result.errors.length > 0 && (
                                    <ul className="mt-2 list-disc list-inside space-y-1 opacity-80 text-xs">
                                        {result.errors.slice(0, 5).map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                        {result.errors.length > 5 && (
                                            <li>... y {result.errors.length - 5} errores más</li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
