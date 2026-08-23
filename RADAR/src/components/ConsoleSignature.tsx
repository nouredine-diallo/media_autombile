'use client';

import { useEffect } from 'react';
import { ENGINE } from '@/lib/engine';

/**
 * Signature en console (F12) — une seule ligne, une seule fois par chargement.
 *
 * Le drapeau au niveau du module évite que la navigation client ne la répète :
 * une signature qui se répète devient du bruit.
 */
let alreadyLogged = false;

export function ConsoleSignature() {
  useEffect(() => {
    if (alreadyLogged) return;
    alreadyLogged = true;
    console.log(
      `%c Application conçue et développée par ${ENGINE.author} — Tous droits réservés`,
      'color: #3b82f6; font-size: 12px;'
    );
  }, []);

  return null;
}
