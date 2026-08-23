'use client';

import { useState, useEffect, useCallback } from 'react';

interface FocusModeOptions {
  onEscape?: () => void;
  onCtrlEnter?: () => void;
  onCtrlShiftEnter?: () => void;
}

export function useFocusMode(options?: FocusModeOptions) {
  const [isFocused, setIsFocused] = useState(false);

  const enterFocus = useCallback(() => setIsFocused(true), []);
  const exitFocus = useCallback(() => {
    setIsFocused(false);
    options?.onEscape?.();
  }, [options]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // F to enter focus mode
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !isFocused) {
        e.preventDefault();
        enterFocus();
      }

      // Escape to exit focus mode
      if (e.key === 'Escape' && isFocused) {
        e.preventDefault();
        exitFocus();
      }

      // Ctrl+Enter to validate
      if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && isFocused) {
        e.preventDefault();
        options?.onCtrlEnter?.();
      }

      // Ctrl+Shift+Enter to validate and next
      if (e.key === 'Enter' && e.ctrlKey && e.shiftKey && isFocused) {
        e.preventDefault();
        options?.onCtrlShiftEnter?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, enterFocus, exitFocus, options]);

  return { isFocused, enterFocus, exitFocus };
}
