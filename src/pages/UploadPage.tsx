// Esta página maneja la subida de comprobantes y su procesamiento automático.
// Convierte imágenes a PDF, ejecuta OCR y crea registros iniciales en la base de datos.

import { useState, useEffect } from 'react';
import { FileUploader } from '../components/FileUploader';
import { extractDataFromPDF } from '../services/ocr-service';
import { extractDataWithOpenAI } from '../services/openai-ocr-service';
import { createInvoice, checkDuplicateInvoice, createInvoiceTaxesFromOCR } from '../services/invoice-service';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, AlertCircle, Loader, AlertTriangle } from 'lucide-react';
import { convertImageToPDF, isImageFile } from '../utils/file-converter';
import { recordTokenUsage, getEstimatedRemainingBalance, setInitialBalance, getInitialBalance } from '../utils/openai-balance';
import { validateInvoiceTotals } from '../utils/validators';
import { validateCUIT } from '../utils/validators';

interface UploadResult {
  filename: string;
  status: 'processing' | 'success' | 'error' | 'duplicate';
  message: string;
  invoiceId?: string;
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
  const [results, setResults] = useState<UploadResult[]>([]);
  const [balanceInfo, setBalanceInfo] = useState(getEstimatedRemainingBalance());

  // Actualizar información de saldo cuando cambian los resultados
  useEffect(() => {
    setBalanceInfo(getEstimatedRemainingBalance());
  }, [results]);

  const handleFilesSelected = async (files: File[]) => {
    if (!profile) return;

    console.log('[Upload] Procesando archivos:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));

    setUploading(true);
    const newResults: UploadResult[] = files.map((file) => ({
      filename: file.name,
      status: 'processing',
      message: 'Procesando...',
    }));
    setResults(newResults);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const isImage = isImageFile(file);
        let fileToProcess = file;

        let ocrResult;
        let ocrMethod = 'Local (Tesseract)';

        // Intentar usar OpenAI primero (vía Supabase Edge Function)
        // OpenAI puede procesar imágenes directamente, no necesita conversión
        try {
          newResults[i] = {
            ...newResults[i],
            message: 'Analizando comprobante con OpenAI...',
          };
          setResults([...newResults]);

          console.log(`[Upload] Iniciando OCR con OpenAI para: ${file.name}`);
          // Enviar el archivo original directamente (imagen o PDF)
          ocrResult = await extractDataWithOpenAI(file);
          ocrMethod = 'OpenAI';
          console.log(`[Upload] OpenAI OCR exitoso para: ${file.name}`, {
            supplierCuit: ocrResult.supplierCuit,
            invoiceType: ocrResult.invoiceType,
            invoiceNumber: ocrResult.invoiceNumber,
            confidence: ocrResult.confidence,
            tokens: ocrResult.tokens,
          });
          
          // Guardar información de tokens en el resultado y registrar el uso
          if (ocrResult.tokens) {
            newResults[i] = {
              ...newResults[i],
              tokens: ocrResult.tokens,
            };
            setResults([...newResults]);
            
            // Registrar el uso para tracking de saldo
            if (ocrResult.tokens.estimatedCost !== undefined) {
              recordTokenUsage(ocrResult.tokens.total_tokens, ocrResult.tokens.estimatedCost);
              setBalanceInfo(getEstimatedRemainingBalance());
            }
          }
        } catch (aiError) {
          const errorMessage = aiError instanceof Error ? aiError.message : 'Error desconocido';
          console.error('[Upload] OpenAI OCR falló, usando OCR local como respaldo', {
            error: aiError,
            message: errorMessage
          });
          newResults[i] = {
            ...newResults[i],
            message: `OpenAI falló (${errorMessage}), usando OCR local...`,
          };
          setResults([...newResults]);
        }

        // Si OpenAI falló, usar OCR local
        // El OCR local requiere PDF, así que convertir imagen si es necesario
        if (!ocrResult) {
          if (isImage) {
            newResults[i] = {
              ...newResults[i],
              message: 'Convirtiendo imagen a PDF para OCR local...',
            };
            setResults([...newResults]);

            const pdfBlob = await convertImageToPDF(file);
            fileToProcess = new File([pdfBlob], file.name.replace(/\.[^.]+$/, '.pdf'), {
              type: 'application/pdf',
            });
          }

          try {
            console.log(`[Upload] Iniciando OCR local para: ${file.name}`);
            ocrResult = await extractDataFromPDF(fileToProcess);
            console.log(`[Upload] OCR local exitoso para: ${file.name}`, {
              supplierCuit: ocrResult.supplierCuit,
              invoiceType: ocrResult.invoiceType,
              invoiceNumber: ocrResult.invoiceNumber,
              confidence: ocrResult.confidence,
            });
            newResults[i] = {
              ...newResults[i],
              message: 'OCR local completado, procesando datos...',
            };
            setResults([...newResults]);
          } catch (localError) {
            console.error('[Upload] OCR local falló', localError);
            throw new Error(
              `No se pudo procesar el comprobante con OCR local: ${localError instanceof Error ? localError.message : 'Error desconocido'}`
            );
          }
        }

        if (!ocrResult.supplierCuit || !ocrResult.invoiceType || !ocrResult.invoiceNumber) {
          console.error('[Upload] Datos insuficientes extraídos:', {
            supplierCuit: ocrResult.supplierCuit,
            invoiceType: ocrResult.invoiceType,
            invoiceNumber: ocrResult.invoiceNumber,
            ocrMethod,
          });
          throw new Error(`No se pudo extraer información suficiente del comprobante (método: ${ocrMethod})`);
        }

        // VALIDACIONES Y ADVERTENCIAS
        const validations = {
          isValid: true,
          errors: [] as string[],
          warnings: [] as string[],
        };

        // 1. Advertencia sobre PDFs con múltiples facturas
        if (file.type === 'application/pdf') {
          validations.warnings.push(
            '⚠️ IMPORTANTE: El sistema procesa 1 factura por archivo. Si el PDF contiene más de 1 factura, el sistema no funcionará correctamente. Por favor, separa las facturas en archivos individuales.'
          );
        }

        // 2. Validar CUIT del proveedor
        if (ocrResult.supplierCuit) {
          const cleanCuit = ocrResult.supplierCuit.replace(/[-\s]/g, '');
          if (!validateCUIT(cleanCuit)) {
            validations.errors.push(`CUIT del proveedor inválido: ${ocrResult.supplierCuit}`);
            validations.isValid = false;
          }
        }

        // 3. Validar totales
        const totalsValidation = validateInvoiceTotals({
          netTaxed: ocrResult.netTaxed,
          netUntaxed: ocrResult.netUntaxed,
          netExempt: ocrResult.netExempt,
          ivaAmount: ocrResult.ivaAmount,
          otherTaxesAmount: ocrResult.otherTaxesAmount,
          totalAmount: ocrResult.totalAmount,
        });
        if (!totalsValidation.valid) {
          validations.errors.push(...totalsValidation.errors);
          validations.isValid = false;
        }

        // 4. Validar valores razonables
        if (ocrResult.totalAmount <= 0) {
          validations.errors.push('El total de la factura debe ser mayor a 0');
          validations.isValid = false;
        }

        if (ocrResult.netTaxed < 0 || ocrResult.ivaAmount < 0) {
          validations.warnings.push('Se detectaron valores negativos en los montos. Por favor, verifica los datos extraídos.');
        }

        // 5. Validar confianza del OCR
        if (ocrResult.confidence < 0.5) {
          validations.warnings.push(`Baja confianza en la extracción (${(ocrResult.confidence * 100).toFixed(0)}%). Por favor, revisa cuidadosamente los datos extraídos.`);
        }

        // 6. Mensaje de soporte
        if (validations.errors.length > 0 || validations.warnings.length > 0) {
          validations.warnings.push('Si tienes dudas o problemas, contacta a soporte: lucas@growsanjuan.com');
        }

        const duplicate = await checkDuplicateInvoice(
          ocrResult.supplierCuit,
          ocrResult.invoiceType,
          ocrResult.pointOfSale || '00000',
          ocrResult.invoiceNumber
        );

        if (duplicate) {
          newResults[i] = {
            ...newResults[i],
            status: 'duplicate',
            message: 'Comprobante duplicado - Ya existe en el sistema',
          };
          setResults([...newResults]);
          continue;
        }

        newResults[i] = {
          ...newResults[i],
          message: 'Guardando en base de datos...',
        };
        setResults([...newResults]);

        const invoice = await createInvoice({
          supplier_cuit: ocrResult.supplierCuit,
          supplier_name: ocrResult.supplierName || 'Sin nombre',
          invoice_type: ocrResult.invoiceType,
          point_of_sale: ocrResult.pointOfSale || '00000',
          invoice_number: ocrResult.invoiceNumber,
          issue_date: ocrResult.issueDate || new Date().toISOString().split('T')[0],
          net_taxed: ocrResult.netTaxed,
          net_untaxed: ocrResult.netUntaxed,
          net_exempt: ocrResult.netExempt,
          iva_amount: ocrResult.ivaAmount,
          other_taxes_amount: ocrResult.otherTaxesAmount,
          total_amount: ocrResult.totalAmount,
          status: ocrResult.confidence >= 0.7 ? 'PROCESSED' : 'PENDING_REVIEW',
          ocr_confidence: ocrResult.confidence,
          created_by: profile.id,
          is_electronic: true,
          cai_cae: ocrResult.caiCae || null,
          cai_cae_expiration: ocrResult.caiCaeExpiration || null,
        });

        // Crear automáticamente los impuestos detectados por OCR
        if (ocrResult.taxes && ocrResult.taxes.length > 0) {
          try {
            await createInvoiceTaxesFromOCR(invoice.id, ocrResult.taxes);
            console.log(`[Upload] ${ocrResult.taxes.length} impuestos creados automáticamente`);
          } catch (taxError) {
            console.error('[Upload] Error al crear impuestos automáticamente:', taxError);
            // No fallar todo el proceso si falla la creación de impuestos
          }
        }

        newResults[i] = {
          ...newResults[i],
          status: validations.isValid ? 'success' : 'error',
          message: validations.isValid 
            ? `Comprobante procesado exitosamente con ${ocrMethod}`
            : `Comprobante procesado con errores de validación (método: ${ocrMethod})`,
          invoiceId: invoice.id,
          validations,
        };
        setResults([...newResults]);
        if (onInvoiceCreated) {
          onInvoiceCreated(invoice.id);
        }
        console.log(`[Upload] Archivo procesado completamente: ${file.name}`);
      } catch (error: any) {
        console.error(`[Upload] Error procesando ${file.name}:`, error);
        newResults[i] = {
          ...newResults[i],
          status: 'error',
          message: error.message || 'Error al procesar el archivo',
        };
        setResults([...newResults]);
      }
    }

    setUploading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Cargar Comprobantes </h1>
        <p className="text-gray-600">
          Arrastra archivos PDF o imágenes para procesar automáticamente
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <FileUploader onFilesSelected={handleFilesSelected} disabled={uploading} />
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Resultados del Procesamiento</h2>
            <div className="flex items-center gap-4">
              {balanceInfo.initialBalance !== null ? (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Saldo estimado:</span>{' '}
                  <span className={balanceInfo.remaining !== null && balanceInfo.remaining < 5 ? 'text-red-600 font-bold' : 'text-green-600'}>
                    ${balanceInfo.remaining !== null ? balanceInfo.remaining.toFixed(2) : 'N/A'}
                  </span>
                  {' '}
                  <span className="text-gray-400">
                    (usado: ${balanceInfo.totalUsed.toFixed(2)})
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const balance = prompt('Ingresa el saldo inicial de tu cuenta de OpenAI (en USD):');
                    if (balance) {
                      const balanceNum = parseFloat(balance);
                      if (!isNaN(balanceNum) && balanceNum > 0) {
                        setInitialBalance(balanceNum);
                        setBalanceInfo(getEstimatedRemainingBalance());
                      } else {
                        alert('Por favor ingresa un número válido mayor a 0');
                      }
                    }
                  }}
                  className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  Configurar saldo inicial
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {results.map((result, index) => (
              <div key={index} className="px-6 py-4 flex items-start space-x-4">
                <div className="flex-shrink-0 mt-1">
                  {result.status === 'processing' && (
                    <Loader className="h-5 w-5 text-blue-500 animate-spin" />
                  )}
                  {result.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {result.status === 'duplicate' && (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  {result.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{result.filename}</p>
                  <p
                    className={`text-sm mt-1 ${
                      result.status === 'success'
                        ? 'text-green-600'
                        : result.status === 'duplicate'
                        ? 'text-yellow-600'
                        : result.status === 'error'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {result.message}
                  </p>
                  {result.tokens && (
                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Tokens:</span>
                        <span>{result.tokens.total_tokens.toLocaleString()} total</span>
                        <span className="text-gray-400">({result.tokens.prompt_tokens.toLocaleString()} entrada + {result.tokens.completion_tokens.toLocaleString()} salida)</span>
                      </div>
                      {result.tokens.estimatedCost !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Costo estimado:</span>
                          <span className="text-blue-600">${result.tokens.estimatedCost.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {result.validations && (result.validations.errors.length > 0 || result.validations.warnings.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {result.validations.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-3">
                          <div className="flex items-start">
                            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-red-800 mb-1">Errores detectados:</h4>
                              <ul className="list-disc list-inside text-xs text-red-700 space-y-1">
                                {result.validations.errors.map((error, idx) => (
                                  <li key={idx}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                      {result.validations.warnings.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                          <div className="flex items-start">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-yellow-800 mb-1">Advertencias:</h4>
                              <ul className="list-disc list-inside text-xs text-yellow-700 space-y-1">
                                {result.validations.warnings.map((warning, idx) => (
                                  <li key={idx}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
