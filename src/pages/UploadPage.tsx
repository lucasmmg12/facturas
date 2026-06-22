// Esta página maneja la subida de comprobantes y su procesamiento automático.
// Convierte imágenes a PDF, ejecuta OCR y crea registros iniciales en la base de datos.

import { useState, useEffect } from 'react';
import { FileUploader } from '../components/FileUploader';
import { extractDataFromPDF } from '../services/ocr-service';
import { extractDataWithOpenAI } from '../services/openai-ocr-service';
import { createInvoice, checkDuplicateInvoice, createInvoiceTaxesFromOCR, getSupplierByCuit, getSupplierByName } from '../services/invoice-service';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, AlertCircle, Loader, AlertTriangle } from 'lucide-react';
import { convertImageToPDF, isImageFile } from '../utils/file-converter';
import { recordTokenUsage, getEstimatedRemainingBalance, setInitialBalance } from '../utils/openai-balance';
import { validateInvoiceTotals } from '../utils/validators';
import { validateCUIT } from '../utils/validators';
import type { InvoiceType, Supplier } from '../lib/database.types';
import { logFileUpload } from '../services/activity-log-service';

interface UploadResult {
  filename: string;
  status: 'processing' | 'success' | 'error' | 'duplicate';
  message: string;
  invoiceId?: string;
  supplierCuit?: string | null; // Agregar para detectar NATURGY
  tokens?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimatedCost?: number;
  };
  warnings?: string[];
  validations?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

interface UploadPageProps {
  onInvoiceCreated?: (invoiceId?: string) => void;
}

export function UploadPage({ onInvoiceCreated }: UploadPageProps) {
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [currentAction, setCurrentAction] = useState<{
    label: string;
    detail?: string;
    amount?: number;
    supplier?: string;
  } | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [balanceInfo, setBalanceInfo] = useState(getEstimatedRemainingBalance());

  // Actualizar información de saldo cuando cambian los resultados
  useEffect(() => {
    setBalanceInfo(getEstimatedRemainingBalance());
  }, [results]);

  // Prevenir cierre accidental de pestaña durante procesamiento
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploading]);

  const handleFilesSelected = async (files: File[]) => {
    if (!profile) return;

    console.log('[Upload] Procesando archivos:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));

    setUploading(true);
    setProcessedCount(0);
    setTotalToProcess(files.length);
    setCurrentAction({ label: 'Iniciando lote', detail: `${files.length} archivos detectados` });
    const newResults: UploadResult[] = files.map((file) => ({
      filename: file.name,
      status: 'processing',
      message: 'Iniciando secuencia de análisis...',
    }));
    setResults(newResults);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentAction({ label: 'Analizando archivo', detail: file.name });
      try {
        const isImage = isImageFile(file);
        let fileToProcess = file;

        let ocrResult: any;
        let ocrMethod = 'Local (Tesseract)';

        // Intentar usar OpenAI primero (vía Supabase Edge Function)
        try {
          newResults[i] = {
            ...newResults[i],
            message: 'Analizando comprobante con OpenAI...',
          };
          setResults([...newResults]);
          setCurrentAction({ label: 'IA en Proceso', detail: `Leyendo ${file.name}...` });

          console.log(`[Upload] Iniciando OCR con OpenAI for: ${file.name}`);

          // Detectar posible CUIT en el nombre del archivo para cargar aprendizajes previos
          const filenameCuit = file.name.match(/\d{11}/)?.[0];
          if (filenameCuit) console.log(`[Upload] CUIT detectado en nombre de archivo: ${filenameCuit}`);

          ocrResult = await extractDataWithOpenAI(file, filenameCuit);
          ocrMethod = 'OpenAI';

          if (ocrResult) {
            setCurrentAction({
              label: 'OCR Completado',
              supplier: ocrResult.supplierName,
              amount: ocrResult.totalAmount
            });
          }

          // Guardar información de tokens
          if (ocrResult.tokens) {
            newResults[i] = {
              ...newResults[i],
              tokens: ocrResult.tokens,
            };
            setResults([...newResults]);

            if (ocrResult.tokens.estimatedCost !== undefined) {
              recordTokenUsage(ocrResult.tokens.total_tokens, ocrResult.tokens.estimatedCost);
              setBalanceInfo(getEstimatedRemainingBalance());
            }
          }
        } catch (aiError) {
          const errorMessage = aiError instanceof Error ? aiError.message : 'Error desconocido';
          console.error('[Upload] OpenAI OCR falló:', errorMessage);
          newResults[i] = {
            ...newResults[i],
            message: `OpenAI falló (${errorMessage}), usando OCR local...`,
          };
          setResults([...newResults]);
        }

        // Si OpenAI falló, usar OCR local
        if (!ocrResult) {
          if (isImage) {
            const pdfBlob = await convertImageToPDF(file);
            fileToProcess = new File([pdfBlob], file.name.replace(/\.[^.]+$/, '.pdf'), {
              type: 'application/pdf',
            });
          }

          try {
            ocrResult = await extractDataFromPDF(fileToProcess);
          } catch (localError) {
            throw new Error(`Error en OCR local: ${localError instanceof Error ? localError.message : 'Error desconocido'}`);
          }
        }

        // VALIDACIONES
        const validations = {
          isValid: true,
          errors: [] as string[],
          warnings: [] as string[],
        };

        // Check for multiple pages
        if (file.type === 'application/pdf' && (ocrResult.pagesCount || 1) > 1) {
          validations.warnings.push(`⚠️ El PDF tiene ${ocrResult.pagesCount} páginas. Asegúrate de que solo contenga una factura.`);
        }

        // Validar CUIT
        if (ocrResult.supplierCuit) {
          if (!validateCUIT(ocrResult.supplierCuit.replace(/\D/g, ''))) {
            validations.warnings.push(`⚠️ CUIT detectado (${ocrResult.supplierCuit}) parece inválido.`);
          }
        } else {
          validations.warnings.push('⚠️ No se detectó CUIT del proveedor.');
        }

        // Validar Totales
        const totalsValidation = validateInvoiceTotals({
          netTaxed: ocrResult.netTaxed,
          netUntaxed: ocrResult.netUntaxed,
          netExempt: ocrResult.netExempt,
          ivaAmount: ocrResult.ivaAmount,
          otherTaxesAmount: ocrResult.otherTaxesAmount,
          totalAmount: ocrResult.totalAmount,
        });
        if (!totalsValidation.valid) {
          validations.warnings.push(...totalsValidation.errors.map(e => `⚠️ ${e}`));
        }

        // Confianza
        if (ocrResult.confidence < 0.7) {
          validations.warnings.push(`ℹ️ Confianza baja en la extracción (${Math.round(ocrResult.confidence * 100)}%).`);
        }

        // Naturgy
        const isNaturgy = ocrResult.supplierCuit?.replace(/\D/g, '') === '30681688540';
        if (isNaturgy) {
          validations.warnings.push('🔵 Proveedor NATURGY detectado. Se aplicó lógica de IVA 27%.');
          if (!ocrResult.invoiceType) ocrResult.invoiceType = 'FACTURA_A';
        }

        // Buscar proveedor en BD
        const cleanOcrCuit = ocrResult.supplierCuit ? ocrResult.supplierCuit.replace(/\D/g, '') : '';
        let dbSupplier: Supplier | null = null;
        if (cleanOcrCuit) {
          try {
            dbSupplier = await getSupplierByCuit(cleanOcrCuit);
          } catch (e) {
            console.error('Error buscando proveedor por CUIT:', e);
          }
        }

        // Fallback: buscar por nombre si no se encontró por CUIT
        if (!dbSupplier && ocrResult.supplierName) {
          try {
            console.log(`[Upload] CUIT no encontrado (${cleanOcrCuit}), intentando por nombre: ${ocrResult.supplierName}`);
            dbSupplier = await getSupplierByName(ocrResult.supplierName);
          } catch (e) {
            console.error('Error buscando proveedor por nombre:', e);
          }
        }

        // Duplicados
        const isDuplicate = cleanOcrCuit && ocrResult.invoiceType && ocrResult.invoiceNumber &&
          await checkDuplicateInvoice(cleanOcrCuit, ocrResult.invoiceType, ocrResult.pointOfSale || '00000', ocrResult.invoiceNumber);

        if (isDuplicate) {
          newResults[i] = {
            ...newResults[i],
            status: 'duplicate',
            message: 'Este comprobante ya existe en el sistema.',
          };
          setResults([...newResults]);
          continue;
        }

        // Guardar factura
        const today = new Date().toISOString().split('T')[0];
        const invoice = await createInvoice({
          supplier_id: (dbSupplier as any)?.id || null,
          supplier_cuit: cleanOcrCuit || '00000000000',
          supplier_name: (dbSupplier as any)?.razon_social || ocrResult.supplierName || 'PROVEEDOR SIN NOMBRE',
          invoice_type: (ocrResult.invoiceType || 'FACTURA_A') as InvoiceType,
          point_of_sale: ocrResult.pointOfSale || '00000',
          invoice_number: ocrResult.invoiceNumber || '00000000',
          issue_date: ocrResult.issueDate || today,
          receiver_cuit: ocrResult.receiverCuit || '30609926860',
          receiver_name: ocrResult.receiverName || 'SANATORIO ARGENTINO S.R.L.',
          net_taxed: ocrResult.netTaxed || 0,
          net_untaxed: ocrResult.netUntaxed || 0,
          net_exempt: ocrResult.netExempt || 0,
          iva_amount: ocrResult.ivaAmount || 0,
          other_taxes_amount: ocrResult.otherTaxesAmount || 0,
          total_amount: ocrResult.totalAmount || 0,
          status: (ocrResult.confidence >= 0.7 && cleanOcrCuit && ocrResult.invoiceType) ? 'PROCESSED' : 'PENDING_REVIEW',
          ocr_confidence: ocrResult.confidence,
          ocr_raw_result: ocrResult, // Guardamos el resultado original del OCR para aprendizaje
          created_by: profile.id,
          is_electronic: true,
          cai_cae: ocrResult.caiCae || null,
          cai_cae_expiration: ocrResult.caiCaeExpiration || null,
        } as any);

        // Impuestos
        if (ocrResult.taxes?.length > 0) {
          await createInvoiceTaxesFromOCR(invoice.id, ocrResult.taxes);
        }

        // Log
        await logFileUpload(profile.id, file.name, invoice.id);

        // Finalizar
        newResults[i] = {
          ...newResults[i],
          status: 'success',
          message: `Procesado con ${ocrMethod}.`,
          invoiceId: invoice.id,
          supplierCuit: ocrResult.supplierCuit,
          validations,
        };
        setResults([...newResults]);

        setCurrentAction({
          label: 'Guardado',
          detail: `Comprobante ${ocrResult.invoiceNumber || ''} registrado`
        });

        // if (onInvoiceCreated) onInvoiceCreated(invoice.id); // Removido del loop para evitar navegación prematura

      } catch (error: any) {
        console.error(`Error procesando ${file.name}:`, error);

        // Manejar error de duplicado de base de datos de forma profesional
        let errorMessage = error.message || 'Error desconocido';
        if (errorMessage.includes('UNIQUE_INVOICE_KEY') || errorMessage.includes('unique_invoice_key')) {
          errorMessage = 'Este comprobante ya ha sido registrado previamente en el sistema.';
        }

        setCurrentAction({ label: 'Error detectado', detail: file.name });

        newResults[i] = {
          ...newResults[i],
          status: 'error',
          message: errorMessage,
        };
        setResults([...newResults]);
      } finally {
        setProcessedCount(prev => prev + 1);
      }
    }
    setUploading(false);
    setCurrentAction(null);

    // Solo al finalizar TODO el lote, si hay al menos un éxito, notificamos al padre
    // Usamos el ID de la última factura procesada exitosamente para la vista previa
    const lastSuccess = [...newResults].reverse().find(r => r.status === 'success');
    if (onInvoiceCreated && lastSuccess?.invoiceId) {
      onInvoiceCreated(lastSuccess.invoiceId);
    }
  };

  return (
    <div className="relative space-y-8 animate-in fade-in duration-700">
      {/* Overlay de Bloqueo durante Carga en Lote */}
      {uploading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/50 backdrop-blur-md animate-in fade-in duration-300">
          <div className="max-w-md w-full p-8 bg-white shadow-sm border border-neutral-200 rounded-xl border-primary-300 text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 rounded-full border-4 border-primary-200" />
              <div
                className="absolute inset-0 rounded-full border-4 border-primary-500 border-t-transparent animate-spin shadow-sm"
                style={{ animationDuration: '2s' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black text-neutral-800">{Math.round((processedCount / totalToProcess) * 100)}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-lg font-black text-neutral-800 tracking-widest uppercase">Procesamiento en Curso</h4>
              <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">
                No cierres la ventana hasta finalizar la secuencia
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[10px] font-black text-primary-500 uppercase tracking-[0.2em] mb-1">
                <span>Progreso Global</span>
                <span>{processedCount} / {totalToProcess} archivos</span>
              </div>
              <div className="h-2 w-full bg-neutral-50 rounded-full overflow-hidden border border-neutral-200">
                <div
                  className="h-full bg-primary-500 shadow-sm transition-all duration-500 ease-out"
                  style={{ width: `${(processedCount / totalToProcess) * 100}%` }}
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-center gap-3 text-primary-500 animate-pulse">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">{currentAction?.label || 'Optimizando Data'}</span>
            </div>

            {currentAction && (currentAction.supplier || currentAction.detail) && (
              <div className="mt-4 p-4 bg-white border border-primary-200 rounded-2xl animate-in zoom-in-95 duration-300">
                <div className="flex flex-col gap-2 text-left">
                  {currentAction.supplier && (
                    <div className="flex justify-between items-center bg-primary-50 p-2 rounded-lg border border-primary-200">
                      <span className="text-[9px] font-black text-neutral-500 uppercase">Emisor Detectado</span>
                      <span className="text-[10px] font-black text-neutral-800 truncate max-w-[150px]">{currentAction.supplier}</span>
                    </div>
                  )}
                  {currentAction.amount !== undefined && (
                    <div className="flex justify-between items-center bg-primary-50 p-2 rounded-lg border border-primary-200">
                      <span className="text-[9px] font-black text-neutral-500 uppercase">Importe Total</span>
                      <span className="text-[10px] font-black text-primary-500">
                        {currentAction.amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                      </span>
                    </div>
                  )}
                  {currentAction.detail && !currentAction.supplier && (
                    <div className="text-center italic opacity-70">
                      <span className="text-[10px] font-bold text-neutral-500">{currentAction.detail}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Panel de Control de Carga */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow-sm border border-neutral-200 rounded-xl p-8 bg-white/[0.02]">
            <h3 className="text-xl font-black text-neutral-800 tracking-widest uppercase mb-6 flex items-center gap-3">
              <span className="w-1.5 h-6 bg-primary-500 rounded-full shadow-sm" />
              Terminal de Carga
            </h3>
            <FileUploader onFilesSelected={handleFilesSelected} disabled={uploading} />

            <div className="mt-8 flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse shadow-sm" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Estado del Sistema</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-500">Operativo</span>
            </div>
          </div>

          {/* Lista de Resultados */}
          {results.length > 0 && (
            <div className="space-y-4 animate-in slide-in-from-bottom-5 duration-500">
              <h3 className="text-sm font-black text-neutral-500 tracking-[0.3em] uppercase ml-2">Monitor de Procesamiento</h3>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className="bg-white shadow-sm border border-neutral-200 rounded-xl p-6 group transition-all hover:bg-white/[0.05] border-neutral-200 hover:border-primary-200"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`p-3 rounded-2xl border transition-all ${result.status === 'success' ? 'bg-primary-50 border-primary-200 text-primary-500 shadow-sm' :
                            result.status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                              result.status === 'duplicate' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' :
                                'bg-neutral-50 border-neutral-200 text-neutral-500 animate-pulse'
                            }`}>
                            {result.status === 'processing' ? <Loader className="w-5 h-5 animate-spin" /> :
                              result.status === 'success' ? <CheckCircle className="w-5 h-5" /> :
                                result.status === 'duplicate' ? <AlertTriangle className="w-5 h-5" /> :
                                  <AlertCircle className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-neutral-800 truncate max-w-[250px]">{result.filename}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${result.status === 'success' ? 'text-primary-500' :
                              result.status === 'error' ? 'text-red-400' :
                                result.status === 'duplicate' ? 'text-yellow-400' :
                                  'text-neutral-500'
                              }`}>
                              {result.message}
                            </p>
                          </div>
                        </div>

                        {result.tokens && (
                          <div className="hidden sm:flex flex-col items-end px-3 py-1.5 bg-white border border-neutral-200 rounded-xl">
                            <span className="text-[8px] font-black text-primary-500 uppercase tracking-widest">AI Audit</span>
                            <span className="text-[10px] font-bold text-neutral-500">{result.tokens.total_tokens.toLocaleString()} tok</span>
                          </div>
                        )}
                      </div>

                      {/* Advertencia NATURGY estilizada */}
                      {result.supplierCuit && result.supplierCuit.replace(/[-\s]/g, '') === '30681688540' && (
                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-4">
                          <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Alerta: Protocolo Naturgy</p>
                            <p className="text-[9px] text-orange-200 uppercase font-bold mt-1">Revisar IVA 27% y Apertura de Energía</p>
                          </div>
                        </div>
                      )}

                      {/* Validaciones/Errores */}
                      {result.validations && (result.validations.errors.length > 0 || result.validations.warnings.length > 0) && (
                        <div className="space-y-2 mt-2">
                          {result.validations.errors.map((err, i) => (
                            <div key={i} className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl p-3 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                              <AlertCircle className="w-3 h-3" /> {err}
                            </div>
                          ))}
                          {result.validations.warnings.map((warn, i) => (
                            <div key={i} className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-xl p-3 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                              <AlertTriangle className="w-3 h-3" /> {warn}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Panel Lateral: Saldo e Info */}
        <div className="space-y-6">
          <div className="bg-white shadow-sm border border-neutral-200 rounded-xl p-6 border-primary-200 bg-primary-500/[0.02] relative group overflow-hidden">
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-primary-50 blur-[80px] rounded-full group-hover:bg-primary-50 transition-all duration-700" />
            <h3 className="text-xs font-black text-neutral-500 tracking-[0.3em] uppercase mb-6 flex justify-between items-center">
              Auditoría de Insumos
              {balanceInfo.initialBalance !== null && (
                <span className="text-[8px] bg-neutral-50 px-2 py-0.5 rounded-full border border-neutral-200 group-hover:border-primary-300 transition-colors">AI TOKEN READY</span>
              )}
            </h3>

            <div className="space-y-6">
              {balanceInfo.initialBalance !== null ? (
                <>
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[10px] font-black text-neutral-500 uppercase">Presupuesto IA</span>
                      <span className="text-xl font-black text-neutral-800 tracking-tighter">
                        {balanceInfo.remaining !== null ? balanceInfo.remaining.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }) : '---'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-50 rounded-full overflow-hidden border border-neutral-200">
                      <div
                        className="h-full bg-primary-500 shadow-sm transition-all duration-1000"
                        style={{ width: `${Math.max(5, (balanceInfo.remaining! / balanceInfo.initialBalance!) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-bold text-neutral-500 mt-3 uppercase tracking-widest flex justify-between">
                      <span>Capacidad Operativa</span>
                      <span className="text-primary-500 font-black">{Math.round((balanceInfo.remaining! / balanceInfo.initialBalance!) * 100)}%</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-white border border-neutral-200 rounded-2xl">
                      <span className="text-[9px] font-black text-neutral-500 uppercase block">Consumido</span>
                      <span className="text-xs font-black text-neutral-800 block mt-1">
                        {balanceInfo.totalUsed.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                      </span>
                    </div>
                    <div className="p-4 bg-white border border-neutral-200 rounded-2xl">
                      <span className="text-[9px] font-black text-neutral-500 uppercase block">Estado Red</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-500 shadow-sm animate-pulse" />
                        <span className="text-xs font-black text-primary-500">READY</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    const balance = prompt('Ingresa el saldo inicial de tu cuenta de OpenAI (en USD):');
                    if (balance) {
                      const balanceNum = parseFloat(balance);
                      if (!isNaN(balanceNum) && balanceNum > 0) {
                        setInitialBalance(balanceNum);
                        setBalanceInfo(getEstimatedRemainingBalance());
                      }
                    }
                  }}
                  className="w-full py-4 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-neutral-500 hover:text-neutral-900"
                >
                  Configurar Presupuesto AI
                </button>
              )}
            </div>
          </div>

          <div className="bg-white shadow-sm border border-neutral-200 rounded-xl p-6 bg-white/[0.01]">
            <h4 className="text-[10px] font-black text-neutral-800 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-primary-500" />
              Protocolo Operativo
            </h4>
            <div className="space-y-4">
              {[
                { label: 'Unidad por Archivo', desc: 'Analizar 1 sola factura por proceso' },
                { label: 'Configuración AI', desc: 'API Key configurada en .env y Supabase' },
                { label: 'Soporte Técnico', desc: 'lucas@growsanjuan.com' }
              ].map((item, i) => (
                <div key={i} className="relative pl-4 border-l border-primary-200">
                  <p className="text-[10px] font-black text-neutral-700 uppercase tracking-wider">{item.label}</p>
                  <p className="text-[9px] font-medium text-neutral-500 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



