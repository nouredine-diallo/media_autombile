'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartCard, EmptyChart } from './ChartCard';
import { AXIS_TICK, CHART, SERIES, TOOLTIP_STYLE } from './theme';

interface MetricsData {
  avg_engagement: number;
  avg_save_rate: number;
  avg_share_rate: number;
  total_posts: number;
  best_engagement: number;
  worst_engagement: number;
}

interface MetricsComparisonProps {
  data: MetricsData;
  benchmarks?: {
    engagement?: number;
    saves?: number;
    shares?: number;
  };
}

export function MetricsComparison({ data, benchmarks }: MetricsComparisonProps) {
  const chartData = useMemo(() => {
    return [
      {
        metric: 'Engagement',
        value: data.avg_engagement,
        benchmark: benchmarks?.engagement || data.best_engagement,
      },
      {
        metric: 'Saves',
        value: data.avg_save_rate,
        benchmark: benchmarks?.saves || data.avg_save_rate * 1.2,
      },
      {
        metric: 'Shares',
        value: data.avg_share_rate,
        benchmark: benchmarks?.shares || data.avg_share_rate * 1.5,
      },
      {
        metric: 'Meilleur',
        value: data.best_engagement,
        benchmark: data.best_engagement,
      },
      {
        metric: 'Écart',
        value: Math.abs(data.best_engagement - data.worst_engagement),
        benchmark: data.best_engagement,
      },
    ];
  }, [data, benchmarks]);

  if (data.total_posts === 0) {
    return (
      <ChartCard title="Métriques" subtitle="Vue d'ensemble de vos performances">
        <EmptyChart />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Métriques"
      subtitle="Vue d'ensemble de vos performances"
    >
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis
              dataKey="metric"
              tick={AXIS_TICK}
            />
            <PolarRadiusAxis
              angle={90}
              tick={{ ...AXIS_TICK, fontSize: 10 }}
              axisLine={false}
            />
            <Radar
              name="Vos moyennes"
              dataKey="value"
              stroke={SERIES[0]}
              fill={CHART.textPrimary}
              fillOpacity={0.15}
              strokeWidth={2}
              animationDuration={1000}
            />
            {benchmarks && (
              <Radar
                name="Objectifs"
                dataKey="benchmark"
                stroke={SERIES[1]}
                fill={SERIES[1]}
                fillOpacity={0.05}
                strokeWidth={1}
                strokeDasharray="4 4"
                animationDuration={1200}
              />
            )}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toFixed(2)}%`,
                String(name),
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: CHART.textSecondary }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--border-subtle)]">
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--text-primary)]">{data.total_posts}</div>
          <div className="text-xs text-[var(--text-muted)]">Posts analysés</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--success)]">{data.best_engagement.toFixed(1)}%</div>
          <div className="text-xs text-[var(--text-muted)]">Meilleur taux</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--text-secondary)]">
            {Math.abs(data.best_engagement - data.worst_engagement).toFixed(1)}%
          </div>
          <div className="text-xs text-[var(--text-muted)]">Écart max</div>
        </div>
      </div>
    </ChartCard>
  );
}
