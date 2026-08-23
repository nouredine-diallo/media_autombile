'use client';

import { ReactNode } from 'react';
import { IconTrend } from '@/components/icons';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, children, action, className = '' }: ChartCardProps) {
  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-label text-[var(--text-primary)]">{title}</h3>
          {subtitle && <p className="t-caption mt-0.5 text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}

interface EmptyChartProps {
  message?: string;
}

export function EmptyChart({ message = 'Pas encore de données' }: EmptyChartProps) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
      <IconTrend size={18} strokeWidth={1.75} className="text-[var(--text-faint)]" />
      <span className="t-caption">{message}</span>
    </div>
  );
}
