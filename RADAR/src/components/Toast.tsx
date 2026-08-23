'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import type { ElementType } from 'react';
import { IconCheck, IconClose, IconInfo, IconWarning } from '@/components/icons';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  addToast: (options: { type?: ToastType; title?: string; message: string }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((options: { type?: ToastType; title?: string; message: string }) => {
    const id = Math.random().toString(36).slice(2);
    const message = options.title ? `${options.title}: ${options.message}` : options.message;
    setToasts(prev => [...prev, { id, message, type: options.type || 'info', duration: 3000 }]);
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, addToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(() => onRemove(toast.id), 200);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const handleClick = () => {
    setIsLeaving(true);
    setTimeout(() => onRemove(toast.id), 200);
  };

  // Le toast est du chrome : c'est le seul endroit, avec la barre latérale,
  // où le verre dépoli est autorisé (jamais sur du contenu dense).
  const typeStyles: Record<ToastType, string> = {
    success: 'border-[var(--success-border)] text-[var(--success)]',
    error: 'border-[var(--danger-border)] text-[var(--danger)]',
    info: 'border-[var(--accent-border)] text-[var(--accent)]',
    warning: 'border-[var(--warn-border)] text-[var(--warn)]',
  };

  const icons: Record<ToastType, ElementType> = {
    success: IconCheck,
    error: IconClose,
    info: IconInfo,
    warning: IconWarning,
  };
  const Icon = icons[toast.type];

  return (
    <div
      className={`
        chrome-glass flex max-w-sm cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[13px] font-medium
        ${typeStyles[toast.type]}
        transition-all duration-[var(--dur)] ease-[var(--ease)]
        ${isVisible && !isLeaving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
      onClick={handleClick}
      style={{ boxShadow: 'var(--shadow-lg)' }}
    >
      <Icon size={15} strokeWidth={2} />
      <span className="text-[var(--text-primary)]">{toast.message}</span>
    </div>
  );
}
