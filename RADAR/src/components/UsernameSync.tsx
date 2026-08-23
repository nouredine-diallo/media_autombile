'use client';

import { useEffect } from 'react';
import { getMyName } from '@/app/actions/auth';

export function UsernameSync() {
  useEffect(() => {
    getMyName().then((name) => {
      if (name && name !== 'unknown') {
        const current = localStorage.getItem('lma-username');
        if (current !== name) {
          localStorage.setItem('lma-username', name);
        }
      }
    }).catch(() => {});
  }, []);

  return null;
}
