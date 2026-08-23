'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { ChartCard, EmptyChart } from './ChartCard';
import { AXIS_TICK, CHART, SERIES, TOOLTIP_STYLE } from './theme';

interface Post {
  id: string;
  caption: string;
  engagement_rate: number;
  save_rate: number;
  reach: number;
}

interface TopPostsProps {
  posts: Post[];
  limit?: number;
  metric?: 'engagement_rate' | 'save_rate' | 'reach';
}

const METRIC_CONFIG = {
  engagement_rate: {
    label: 'Engagement',
    color: SERIES[0],
    format: (v: number) => `${v.toFixed(1)}%`,
  },
  save_rate: {
    label: 'Taux de sauvegarde',
    color: SERIES[1],
    format: (v: number) => `${v.toFixed(1)}%`,
  },
  reach: {
    label: 'Portée',
    color: SERIES[2],
    format: (v: number) => v.toLocaleString('fr-FR'),
  },
};

export function TopPosts({ posts, limit = 5, metric = 'engagement_rate' }: TopPostsProps) {
  const config = METRIC_CONFIG[metric];

  const chartData = useMemo(() => {
    if (posts.length === 0) return [];

    const sorted = [...posts]
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, limit)
      .reverse();

    return sorted.map(p => ({
      name: p.caption ? p.caption.substring(0, 30) + (p.caption.length > 30 ? '...' : '') : 'Sans légende',
      value: p[metric],
      fullCaption: p.caption,
    }));
  }, [posts, limit, metric]);

  if (chartData.length === 0) {
    return (
      <ChartCard title={`Top ${config.label}`} subtitle={`${limit} meilleures performances`}>
        <EmptyChart />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={`Top ${config.label}`}
      subtitle={`${limit} meilleures performances`}
    >
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={config.format}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ ...AXIS_TICK, fill: CHART.textSecondary }}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: unknown) => [config.format(Number(value)), config.label]}
              labelFormatter={(label) => ''}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg p-3 text-sm shadow-lg">
                      <div className="font-medium mb-1 line-clamp-2">{data.fullCaption}</div>
                      <div className="text-[var(--text-muted)]">
                        {config.label}: <span className="text-[var(--text-primary)] font-semibold">{config.format(data.value)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={config.color}
                  opacity={0.2 + (index / chartData.length) * 0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
