'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
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
  reach: number;
  format: string;
  save_rate: number;
}

interface PerformanceScatterProps {
  posts: Post[];
}

const FORMAT_COLORS: Record<string, string> = {
  image: SERIES[0],
  video: SERIES[1],
  carousel: SERIES[2],
  unknown: CHART.neutral,
};

const FORMAT_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Vidéo',
  carousel: 'Carrousel',
  unknown: 'Autre',
};

export function PerformanceScatter({ posts }: PerformanceScatterProps) {
  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);

  const chartData = useMemo(() => {
    return posts.map(p => ({
      x: p.reach,
      y: p.engagement_rate,
      z: p.save_rate,
      caption: p.caption,
      format: p.format,
      reach: p.reach,
      engagement: p.engagement_rate,
    }));
  }, [posts]);

  const formats = useMemo(() => {
    return Array.from(new Set(posts.map(p => p.format)));
  }, [posts]);

  if (chartData.length === 0) {
    return (
      <ChartCard title="Performance" subtitle="Engagement vs Portée">
        <EmptyChart />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Performance"
      subtitle="Engagement vs Portée — chaque point = un post"
    >
      {/* Format Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {formats.map(format => (
          <button
            key={format}
            className={`flex items-center gap-2 text-sm transition-opacity ${
              hoveredFormat && hoveredFormat !== format ? 'opacity-40' : 'opacity-100'
            }`}
            onMouseEnter={() => setHoveredFormat(format)}
            onMouseLeave={() => setHoveredFormat(null)}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: FORMAT_COLORS[format] || FORMAT_COLORS.unknown }}
            />
            <span className="text-[var(--text-secondary)]">{FORMAT_LABELS[format] || format}</span>
          </button>
        ))}
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
            <XAxis
              type="number"
              dataKey="x"
              name="Portée"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                return v.toString();
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Engagement"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg p-3 text-sm shadow-lg">
                      <div className="font-medium mb-1 line-clamp-2">{data.caption || 'Sans légende'}</div>
                      <div className="space-y-1 text-[var(--text-muted)]">
                        <div>Format: <span className="text-[var(--text-primary)]">{FORMAT_LABELS[data.format] || data.format}</span></div>
                        <div>Portée: <span className="text-[var(--text-primary)]">{data.reach.toLocaleString('fr-FR')}</span></div>
                        <div>Engagement: <span className="text-[var(--text-primary)] font-semibold">{data.engagement.toFixed(1)}%</span></div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {formats.map(format => (
              <Scatter
                key={format}
                name={FORMAT_LABELS[format] || format}
                data={chartData.filter(d => d.format === format)}
                fill={FORMAT_COLORS[format] || FORMAT_COLORS.unknown}
                opacity={hoveredFormat && hoveredFormat !== format ? 0.2 : 0.8}
                animationDuration={800}
              >
                {chartData.filter(d => d.format === format).map((entry, index) => (
                  <Cell
                    key={`${format}-${index}`}
                    r={Math.max(4, Math.min(10, entry.z / 5))}
                  />
                ))}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-2 text-center">
        La taille des points est proportionnelle au taux de sauvegarde
      </p>
    </ChartCard>
  );
}
