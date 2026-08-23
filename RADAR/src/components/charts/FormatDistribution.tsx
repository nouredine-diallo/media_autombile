'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Sector,
} from 'recharts';
import { ChartCard, EmptyChart } from './ChartCard';
import { AXIS_TICK, CHART, SERIES, TOOLTIP_STYLE } from './theme';

interface FormatData {
  format: string;
  count: number;
  avg_engagement: number;
}

interface FormatDistributionProps {
  data: FormatData[];
}

const COLORS: Record<string, string> = {
  image: SERIES[0],
  video: SERIES[1],
  carousel: SERIES[2],
  unknown: CHART.neutral,
};

const LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Vidéo',
  carousel: 'Carrousel',
  unknown: 'Autre',
};

const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, value, percent,
  } = props;

  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill={CHART.textPrimary} fontSize={14} fontWeight={600}>
        {LABELS[payload.name] || payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={CHART.textMuted} fontSize={12}>
        {value} posts • {(percent * 100).toFixed(0)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 14}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.5}
      />
    </g>
  );
};

export function FormatDistribution({ data }: FormatDistributionProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const chartData = useMemo(() => {
    return data.map(d => ({
      name: d.format,
      value: d.count,
      engagement: d.avg_engagement,
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <ChartCard title="Distribution par format" subtitle="Répartition des publications">
        <EmptyChart />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Distribution par format"
      subtitle={`${data.reduce((sum, d) => sum + d.count, 0)} publications`}
    >
      <div className="flex items-center gap-6">
        <div className="h-[200px] w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeShape={renderActiveShape}
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={COLORS[entry.name] || COLORS.unknown}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: unknown, name: unknown, props: any) => [
                  `${value} posts`,
                  LABELS[props?.payload?.name] || String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-3">
          {data.map((d, i) => (
            <div
              key={d.format}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                i === activeIndex ? 'bg-[var(--surface-base)]' : 'hover:bg-[var(--surface-hover)]'
              }`}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[d.format] || COLORS.unknown }}
                />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {LABELS[d.format] || d.format}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{d.count}</div>
                <div className="text-xs text-[var(--text-muted)]">{d.avg_engagement.toFixed(1)}% eng.</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
