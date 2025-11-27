import { X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonColor?: 'red' | 'green' | 'blue';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar acción',
  message,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  confirmButtonColor = 'red',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  };

  const buttonColors = {
    red: 'bg-red-600 hover:bg-red-700',
    green: 'bg-green-600 hover:bg-green-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-2xl border border-green-600 border-opacity-30 max-w-md w-full mx-4 transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-green-600 border-opacity-20">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          {!isLoading && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              type="button"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-300 text-base leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-green-600 border-opacity-20">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-6 py-2.5 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonColors[confirmButtonColor]}`}
            type="button"
          >
            {isLoading ? 'Procesando...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

