'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let toastListeners: Array<(toast: ToastMessage) => void> = [];

export function showToast(message: string, type: ToastMessage['type'] = 'info') {
  const toast: ToastMessage = {
    id: uuid(),
    message,
    type,
  };
  toastListeners.forEach((listener) => listener(toast));
}

function uuid() {
  return Math.random().toString(36).substring(2, 9);
}

const typeStyles = {
  success: {
    toast: 'border-status-success/20 bg-bg-secondary/90',
    icon: 'text-status-success',
    iconText: '✓',
  },
  error: {
    toast: 'border-status-error/20 bg-bg-secondary/90',
    icon: 'text-status-error',
    iconText: '✕',
  },
  info: {
    toast: 'border-status-info/20 bg-bg-secondary/90',
    icon: 'text-status-info',
    iconText: 'ℹ',
  },
  warning: {
    toast: 'border-status-warning/20 bg-bg-secondary/90',
    icon: 'text-status-warning',
    iconText: '⚠',
  },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    toastListeners.push(addToast);
    return () => {
      toastListeners = toastListeners.filter((listener) => listener !== addToast);
    };
  }, [addToast]);

  return (
    <div className="fixed top-6 right-6 z-[2000] flex flex-col gap-2 max-w-[380px] w-full">
      {toasts.map((toast) => {
        const styles = typeStyles[toast.type] || typeStyles.info;
        return (
          <ToastItem
            key={toast.id}
            toast={toast}
            styles={styles}
            onDismiss={removeToast}
          />
        );
      })}
    </div>
  );
}

interface ToastItemProps {
  toast: ToastMessage;
  styles: typeof typeStyles['info'];
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, styles, onDismiss }: ToastItemProps) {
  const { id } = toast;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      onClick={() => onDismiss(id)}
      className={`flex items-center gap-3 p-4 rounded-xl border backdrop-blur-[12px] shadow-2xl cursor-pointer select-none transition-all duration-300 hover:scale-[1.02] animate-slideInRight ${styles.toast}`}
    >
      <div className={`text-base font-bold w-5 h-5 flex items-center justify-center rounded-full ${styles.icon}`}>
        {styles.iconText}
      </div>
      <p className="text-sm font-medium text-white flex-1">{toast.message}</p>
      <button className="text-text-muted hover:text-white transition-all text-xs">✕</button>
    </div>
  );
}
