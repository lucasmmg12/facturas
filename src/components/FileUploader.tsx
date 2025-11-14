// Este componente maneja la subida de archivos (PDFs e imágenes).
// Soporta drag & drop, múltiples archivos y conversión automática de imágenes.

import { useState, useRef } from 'react';
import { Upload, File, Image } from 'lucide-react';
import { isImageFile, isPDFFile } from '../utils/file-converter';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function FileUploader({ onFilesSelected, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => isImageFile(file) || isPDFFile(file)
    );

    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-all duration-200
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      <div className="flex flex-col items-center space-y-4">
        <div className="flex space-x-2">
          <Upload className="h-12 w-12 text-gray-400" />
          <File className="h-12 w-12 text-gray-400" />
          <Image className="h-12 w-12 text-gray-400" />
        </div>

        <div>
          <p className="text-lg font-medium text-gray-900">
            Arrastra archivos aquí o haz clic para seleccionar
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Archivos PDF o imágenes (JPG, PNG)
          </p>
        </div>
      </div>
    </div>
  );
}
