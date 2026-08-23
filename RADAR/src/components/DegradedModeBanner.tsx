'use client';

import { useEffect, useState } from 'react';
import { IconWarning } from '@/components/icons';

interface SystemStatus {
  degraded: boolean;
  consecutiveRejections: number;
  threshold: number;
}

export function DegradedModeBanner() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    fetch('/api/system/status')
      .then(res => (res.ok ? res.json() : null))
      .then(data => data && setStatus(data))
      .catch(() => {});
  }, []);

  if (!status?.degraded) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-[13px] font-medium text-[var(--danger)]">
      <IconWarning size={15} strokeWidth={2} />
      <span>
        Mode Dégradé actif — {status.consecutiveRejections} articles rejetés d&apos;affilée. Génération LLM
        suspendue. Rédigez à partir du Brief jusqu&apos;à validation d&apos;un article.
      </span>
    </div>
  );
}
