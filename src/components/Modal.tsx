'use client';

import { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[8px] flex items-center justify-center z-[1000] animate-fadeIn">
      <div
        ref={modalRef}
        className="bg-bg-secondary border border-white/5 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-scaleIn overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-white hover:bg-white/5 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">{children}</div>

        {/* Footer Actions */}
        {actions && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3 bg-bg-primary/20">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
