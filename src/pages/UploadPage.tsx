// Esta página maneja la subida de comprobantes y su procesamiento automático.
// Convierte imágenes a PDF, ejecuta OCR y crea registros iniciales en la base de datos.

import { useState } from 'react';
import { FileUploader } from '../components/FileUploader';
import { extractDataFromPDF } from '../services/ocr-service';
import { extractDataWithOpenAI } from '../services/openai-ocr-service';
import { createInvoice, checkDuplicateInvoice } from '../services/invoice-service';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { convertImageToPDF, isImageFile } from '../utils/file-converter';

interface UploadResult {
  filename: string;
  status: 'processing' | 'success' | 'error' | 'duplicate';
  message: string;
  invoiceId?: string;
}

interface UploadPageProps {
  onInvoiceCreated?: (invoiceId?: string) => void;
}

export function UploadPage({ onInvoiceCreated }: UploadPageProps) {
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

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
      try {
        const file = files[i];
        let fileToProcess = file;

        if (isImageFile(file)) {
          newResults[i] = {
            ...newResults[i],
            message: 'Convirtiendo imagen a PDF...',
          };
          setResults([...newResults]);

          const pdfBlob = await convertImageToPDF(file);
          fileToProcess = new File([pdfBlob], file.name.replace(/\.[^.]+$/, '.pdf'), {
            type: 'application/pdf',
          });
        }

        newResults[i] = {
          ...newResults[i],
          message: 'Extrayendo datos del comprobante...',
        };
        setResults([...newResults]);

        let ocrResult;
        let ocrMethod = 'OpenAI';
        try {
          newResults[i] = {
            ...newResults[i],
            message: 'Analizando comprobante con OpenAI...',
          };
          setResults([...newResults]);

          console.log(`[Upload] Iniciando OCR con OpenAI para: ${file.name}`);
          ocrResult = await extractDataWithOpenAI(fileToProcess);
          console.log(`[Upload] OpenAI OCR exitoso para: ${file.name}`, {
            supplierCuit: ocrResult.supplierCuit,
            invoiceType: ocrResult.invoiceType,
            invoiceNumber: ocrResult.invoiceNumber,
            confidence: ocrResult.confidence,
          });
        } catch (aiError) {
          console.error('[Upload] OpenAI OCR falló, usando OCR local como respaldo', aiError);
          ocrMethod = 'Local (Tesseract)';
          newResults[i] = {
            ...newResults[i],
            message: 'OpenAI falló, usando OCR local...',
          };
          setResults([...newResults]);

          console.log(`[Upload] Iniciando OCR local para: ${file.name}`);
          ocrResult = await extractDataFromPDF(fileToProcess);
          console.log(`[Upload] OCR local exitoso para: ${file.name}`, {
            supplierCuit: ocrResult.supplierCuit,
            invoiceType: ocrResult.invoiceType,
            invoiceNumber: ocrResult.invoiceNumber,
            confidence: ocrResult.confidence,
          });
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

        newResults[i] = {
          ...newResults[i],
          status: 'success',
          message: `Comprobante procesado exitosamente con ${ocrMethod}`,
          invoiceId: invoice.id,
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Cargar Comprobantes</h1>
        <p className="text-gray-600">
          Arrastra archivos PDF o imágenes para procesar automáticamente
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <FileUploader onFilesSelected={handleFilesSelected} disabled={uploading} />
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Resultados del Procesamiento</h2>
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
