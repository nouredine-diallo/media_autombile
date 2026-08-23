'use client';

import { useState, useCallback, useEffect } from 'react';
import { useToast } from './Toast';

interface SmartDropzoneProps {
  onFileAccepted: (file: File) => void;
  children: React.ReactNode;
}

export default function SmartDropzone({ onFileAccepted, children }: SmartDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const { addToast } = useToast();

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(c => c + 1);
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(c => {
      const next = c - 1;
      if (next === 0) setIsDragging(false);
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      addToast({
        type: 'error',
        title: 'Format refusé',
        message: `« ${file.name} » n'est pas un CSV. Format attendu : export Instagram (CSV).`,
      });
      return;
    }

    onFileAccepted(file);
  }, [onFileAccepted, addToast]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative"
    >
      {children}

      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-12 border-2 border-dashed border-blue-500 rounded-2xl bg-slate-800/90">
            <svg className="w-16 h-16 text-blue-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xl font-medium text-blue-300">Déposez votre fichier CSV</p>
            <p className="text-sm text-slate-400">Export Instagram uniquement</p>
          </div>
        </div>
      )}
    </div>
  );
}
