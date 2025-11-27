import { useState, useCallback } from 'react';
import type { Toast, ToastType } from '../components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = {
        id,
        message,
        type,
        duration,
      };

      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'success', duration);
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'error', duration);
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'warning', duration);
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, 'info', duration);
    },
    [showToast]
  );

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
}

