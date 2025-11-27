import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

export function ToastComponent({ toast, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animación de entrada
    setTimeout(() => setIsVisible(true), 10);

    // Auto-cerrar después de la duración
    const duration = toast.duration || 5000;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(toast.id), 300); // Esperar animación de salida
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onClose]);

  const icons = {
    success: <CheckCircle className="text-green-400" size={20} />,
    error: <XCircle className="text-red-400" size={20} />,
    warning: <AlertCircle className="text-yellow-400" size={20} />,
    info: <Info className="text-blue-400" size={20} />,
  };

  const colors = {
    success: 'border-green-500 bg-green-500 bg-opacity-10',
    error: 'border-red-500 bg-red-500 bg-opacity-10',
    warning: 'border-yellow-500 bg-yellow-500 bg-opacity-10',
    info: 'border-blue-500 bg-blue-500 bg-opacity-10',
  };

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-lg border backdrop-blur-sm transition-all duration-300 ${
        colors[toast.type]
      } ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}
      style={{
        minWidth: '300px',
        maxWidth: '500px',
      }}
    >
      {icons[toast.type]}
      <p className="flex-1 text-white text-sm">{toast.message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onClose(toast.id), 300);
        }}
        className="text-gray-400 hover:text-white transition-colors"
        type="button"
      >
        <X size={18} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastComponent toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}

