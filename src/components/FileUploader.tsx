// Este componente maneja la subida de archivos (PDFs e imágenes).
// Soporta drag & drop, múltiples archivos, subida de carpetas y estética GrowLabs.

import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, FolderOpen, AlertCircle } from 'lucide-react';
import { isImageFile, isPDFFile } from '../utils/file-converter';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function FileUploader({ onFilesSelected, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<'files' | 'folder'>('files');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Efecto para aplicar el atributo webkitdirectory al input de carpeta
  // ya que React no siempre lo maneja correctamente vía props en TS
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [uploadMode]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    // Cuando se arrastra una carpeta, e.dataTransfer.files contiene los archivos de la carpeta
    const files = Array.from(e.dataTransfer.files).filter(
      (file) => isImageFile(file) || isPDFFile(file)
    );

    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    // Filtrar archivos válidos (especialmente importante para carpetas que pueden traer basura)
    const validFiles = files.filter(file => isImageFile(file) || isPDFFile(file));

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }

    // Resetear el valor para permitir subir la misma carpeta/archivo si se desea
    e.target.value = '';
  };

  const triggerUpload = () => {
    if (uploadMode === 'files') {
      fileInputRef.current?.click();
    } else {
      folderInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-4">
      {/* Selector de Modo */}
      <div className="flex p-1 bg-white border border-neutral-200 rounded-2xl w-fit mx-auto lg:mx-0">
        <button
          onClick={() => setUploadMode('files')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${uploadMode === 'files'
              ? 'bg-primary-500 text-black shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
            }`}
        >
          ARCHIVOS
        </button>
        <button
          onClick={() => setUploadMode('folder')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${uploadMode === 'folder'
              ? 'bg-primary-500 text-black shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900'
            }`}
        >
          CARPETA
        </button>
      </div>

      {/* Area de Drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerUpload}
        className={`
          relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer
          transition-all duration-500 group overflow-hidden
          ${isDragging
            ? 'border-primary-500 bg-primary-50 shadow-[0_0_50px_rgba(34,197,94,0.1)]'
            : 'border-neutral-200 hover:border-primary-300 bg-white/[0.01]'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
        `}
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 blur-[60px] -mr-16 -mt-16 group-hover:bg-primary-50 transition-colors" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary-50 blur-[60px] -ml-16 -mb-16 group-hover:bg-primary-50 transition-colors" />

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <input
          ref={folderInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        <div className="relative flex flex-col items-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary-100 blur-2xl rounded-full scale-150 animate-pulse" />
            <div className="relative p-6 rounded-2xl bg-white border border-neutral-200 shadow-2xl group-hover:border-primary-300 transition-all">
              {uploadMode === 'files' ? (
                <div className="flex -space-x-3">
                  <FileText className="h-10 w-10 text-primary-500" />
                  <Upload className="h-10 w-10 text-neutral-700 translate-y-1" />
                </div>
              ) : (
                <div className="flex -space-x-2">
                  <FolderOpen className="h-10 w-10 text-primary-500" />
                  <Upload className="h-10 w-10 text-neutral-700 translate-y-1" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-lg font-black text-neutral-700 tracking-widest uppercase italic">
              {isDragging ? 'SOLTAR AHORA' : uploadMode === 'files' ? 'CARGAR ARCHIVOS' : 'CARGAR CARPETA'}
            </h4>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.3em]">
              {uploadMode === 'files'
                ? 'Arrastra PDFs o imágenes para iniciar secuencia'
                : 'Selecciona una carpeta para escaneo masivo'
              }
            </p>
          </div>

          {!disabled && (
            <div className="pt-4 flex items-center gap-4 text-neutral-500">
              <div className="h-[1px] w-8 bg-neutral-50" />
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Máximo 20MB por archivo</span>
              </div>
              <div className="h-[1px] w-8 bg-neutral-50" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



