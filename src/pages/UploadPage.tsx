import { useState } from 'react';
import { FileUploader } from '../components/FileUploader';
import { extractDataFromPDF } from '../services/ocr-service';
import { extractDataWithOpenAI } from '../services/openai-ocr-service';
import { createInvoice, checkDuplicateInvoice } from '../services/invoice-service';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, Loader, AlertTriangle, Info } from 'lucide-react';
import { convertImageToPDF, isImageFile } from '../utils/file-converter';
import { validateFileType, validateInvoiceData } from '../utils/validators';
import { isOpenAIEnabled } from '../utils/config';

interface UploadResult {
  filename: string;
  status: 'processing' | 'success' | 'error' | 'duplicate' | 'warning';
  message: string;
  invoiceId?: string;
  details?: string[];
}

export function UploadPage() {
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [showConfigWarning, setShowConfigWarning] = useState(!isOpenAIEnabled());

  const handleFilesSelected = async (files: File[]) => {
    if (!profile) return;

    console.log('[Upload] Procesando archivos:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));

    const validatedFiles: { file: File; index: number }[] = [];
    const newResults: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const validation = validateFileType(files[i]);
      if (!validation.valid) {
        newResults.push({
          filename: files[i].name,
          status: 'error',
          message: validation.error || 'Archivo inválido',
        });
      } else {
        validatedFiles.push({ file: files[i], index: i });
        newResults.push({
          filename: files[i].name,
          status: 'processing',
          message: 'En cola...',
        });
      }
    }

    setResults(newResults);
    setUploading(true);

    for (const { file, index } of validatedFiles) {
      try {
        await processFile(file, index, newResults);
      } catch (error: any) {
        console.error(`[Upload] Error procesando ${file.name}:`, error);
        newResults[index] = {
          ...newResults[index],
          status: 'error',
          message: error.message || 'Error inesperado al procesar el archivo',
        };
        setResults([...newResults]);
      }
    }

    setUploading(false);
  };

  const processFile = async (file: File, index: number, results: UploadResult[]) => {
    let fileToProcess = file;

    if (isImageFile(file)) {
      results[index] = {
        ...results[index],
        message: 'Convirtiendo imagen a PDF...',
      };
      setResults([...results]);

      try {
        const pdfBlob = await convertImageToPDF(file);
        fileToProcess = new File([pdfBlob], file.name.replace(/\.[^.]+$/, '.pdf'), {
          type: 'application/pdf',
        });
      } catch (error: any) {
        throw new Error(`Error al convertir imagen: ${error.message}`);
      }
    }

    results[index] = {
      ...results[index],
      message: 'Extrayendo datos del comprobante...',
    };
    setResults([...results]);

    let ocrResult;
    let ocrMethod = 'OpenAI';
    let useOpenAI = isOpenAIEnabled();

    try {
      if (useOpenAI) {
        results[index] = {
          ...results[index],
          message: 'Analizando con OpenAI (IA avanzada)...',
        };
        setResults([...results]);

        console.log(`[Upload] Iniciando OCR con OpenAI para: ${file.name}`);
        ocrResult = await extractDataWithOpenAI(fileToProcess);
        console.log(`[Upload] OpenAI OCR exitoso para: ${file.name}`, {
          supplierCuit: ocrResult.supplierCuit,
          invoiceType: ocrResult.invoiceType,
          invoiceNumber: ocrResult.invoiceNumber,
          confidence: ocrResult.confidence,
        });
      } else {
        throw new Error('OpenAI no está configurado');
      }
    } catch (aiError: any) {
      console.warn('[Upload] OpenAI OCR falló, usando OCR local como respaldo', aiError.message);
      ocrMethod = 'Local (Tesseract)';
      results[index] = {
        ...results[index],
        message: 'Usando OCR local (puede ser menos preciso)...',
      };
      setResults([...results]);

      console.log(`[Upload] Iniciando OCR local para: ${file.name}`);
      ocrResult = await extractDataFromPDF(fileToProcess);
      console.log(`[Upload] OCR local exitoso para: ${file.name}`, {
        supplierCuit: ocrResult.supplierCuit,
        invoiceType: ocrResult.invoiceType,
        invoiceNumber: ocrResult.invoiceNumber,
        confidence: ocrResult.confidence,
      });
    }

    const dataValidation = validateInvoiceData({
      supplierCuit: ocrResult.supplierCuit,
      invoiceType: ocrResult.invoiceType,
      invoiceNumber: ocrResult.invoiceNumber,
    });

    if (!dataValidation.valid) {
      console.error('[Upload] Validación de datos falló:', dataValidation.errors);
      throw new Error(`Datos incompletos: ${dataValidation.errors.join(', ')}`);
    }

    results[index] = {
      ...results[index],
      message: 'Verificando duplicados...',
    };
    setResults([...results]);

    const duplicate = await checkDuplicateInvoice(
      ocrResult.supplierCuit!,
      ocrResult.invoiceType!,
      ocrResult.pointOfSale || '00000',
      ocrResult.invoiceNumber!
    );

    if (duplicate) {
      results[index] = {
        ...results[index],
        status: 'duplicate',
        message: 'Comprobante duplicado - Ya existe en el sistema',
        details: [
          `CUIT: ${ocrResult.supplierCuit}`,
          `Tipo: ${ocrResult.invoiceType}`,
          `Número: ${ocrResult.pointOfSale}-${ocrResult.invoiceNumber}`,
        ],
      };
      setResults([...results]);
      return;
    }

    results[index] = {
      ...results[index],
      message: 'Guardando en base de datos...',
    };
    setResults([...results]);

    const invoice = await createInvoice({
      supplier_cuit: ocrResult.supplierCuit!,
      supplier_name: ocrResult.supplierName || 'Sin nombre',
      invoice_type: ocrResult.invoiceType!,
      point_of_sale: ocrResult.pointOfSale || '00000',
      invoice_number: ocrResult.invoiceNumber!,
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
    });

    if (ocrResult.taxes && ocrResult.taxes.length > 0) {
      for (const tax of ocrResult.taxes) {
        const { data: taxCode } = await supabase
          .from('tax_codes')
          .select('id')
          .eq('code', tax.taxType)
          .maybeSingle();

        if (taxCode) {
          await supabase.from('invoice_taxes').insert({
            invoice_id: invoice.id,
            tax_code_id: taxCode.id,
            tax_base: tax.taxBase,
            tax_amount: tax.taxAmount,
          });
        }
      }
    }

    const needsReview = ocrResult.confidence < 0.7;
    const details = [
      `Método: ${ocrMethod}`,
      `Confianza: ${(ocrResult.confidence * 100).toFixed(0)}%`,
    ];

    if (needsReview) {
      details.push('⚠️ Requiere revisión manual');
    }

    results[index] = {
      ...results[index],
      status: needsReview ? 'warning' : 'success',
      message: needsReview
        ? `Procesado con baja confianza - Revisar manualmente`
        : `Procesado exitosamente con ${ocrMethod}`,
      invoiceId: invoice.id,
      details,
    };
    setResults([...results]);
    console.log(`[Upload] Archivo procesado completamente: ${file.name}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Cargar Comprobantes</h1>
        <p className="text-gray-600">
          Arrastra archivos PDF o imágenes para procesar automáticamente
        </p>
      </div>

      {showConfigWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-yellow-900 mb-1">
              OpenAI no está configurado
            </h3>
            <p className="text-sm text-yellow-700 mb-2">
              El sistema usará OCR local (Tesseract) que puede ser menos preciso. Para mejor
              exactitud, configura la clave de OpenAI en el archivo .env
            </p>
            <button
              onClick={() => setShowConfigWarning(false)}
              className="text-sm text-yellow-800 underline hover:text-yellow-900"
            >
              Entendido, no mostrar de nuevo
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <FileUploader onFilesSelected={handleFilesSelected} disabled={uploading} />
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Resultados del Procesamiento</h2>
            <div className="text-sm text-gray-500">
              {results.filter((r) => r.status === 'success' || r.status === 'warning').length} de{' '}
              {results.length} procesados
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
                  {result.status === 'warning' && (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  {result.status === 'duplicate' && (
                    <Info className="h-5 w-5 text-blue-500" />
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
                        : result.status === 'warning'
                        ? 'text-yellow-600'
                        : result.status === 'duplicate'
                        ? 'text-blue-600'
                        : result.status === 'error'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {result.message}
                  </p>
                  {result.details && result.details.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {result.details.map((detail, i) => (
                        <li key={i} className="text-xs text-gray-500">
                          {detail}
                        </li>
                      ))}
                    </ul>
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
