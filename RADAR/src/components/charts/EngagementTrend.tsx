'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { ChartCard, EmptyChart } from './ChartCard';
import { AXIS_TICK, CHART, SERIES, TOOLTIP_STYLE } from './theme';

interface Post {
  timestamp: string;
  engagement_rate: number;
  save_rate: number;
  share_rate: number;
}

interface EngagementTrendProps {
  posts: Post[];
  showSaves?: boolean;
  showShares?: boolean;
}

export function EngagementTrend({ posts, showSaves = false, showShares = false }: EngagementTrendProps) {
  const chartData = useMemo(() => {
    if (posts.length === 0) return [];

    const sorted = [...posts].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const grouped = new Map<string, Post[]>();
    for (const post of sorted) {
      const date = post.timestamp.split('T')[0];
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date)!.push(post);
    }

    return Array.from(grouped.entries()).map(([date, dayPosts]) => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      engagement: dayPosts.reduce((sum, p) => sum + p.engagement_rate, 0) / dayPosts.length,
      saves: dayPosts.reduce((sum, p) => sum + p.save_rate, 0) / dayPosts.length,
      shares: dayPosts.reduce((sum, p) => sum + p.share_rate, 0) / dayPosts.length,
      count: dayPosts.length,
    }));
  }, [posts]);

  const avgEngagement = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData.reduce((sum, d) => sum + d.engagement, 0) / chartData.length;
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <ChartCard title="Tendance d'engagement" subtitle="Évolution dans le temps">
        <EmptyChart />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Tendance d'engagement"
      subtitle={`${chartData.length} jours • Moyenne: ${avgEngagement.toFixed(1)}%`}
    >
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.15}/>
                <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0}/>
              </linearGradient>
              {showSaves && (
                <linearGradient id="colorSaves" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES[1]} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={SERIES[1]} stopOpacity={0}/>
                </linearGradient>
              )}
              {showShares && (
                <linearGradient id="colorShares" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES[2]} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={SERIES[2]} stopOpacity={0}/>
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: unknown, name: unknown) => {
                const labels: Record<string, string> = {
                  engagement: 'Engagement',
                  saves: 'Saves',
                  shares: 'Shares',
                };
                return [`${Number(value).toFixed(2)}%`, labels[String(name)] || String(name)];
              }}
              labelFormatter={(label) => label}
            />
            <ReferenceLine
              y={avgEngagement}
              stroke={CHART.axis}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="engagement"
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#colorEngagement)"
              animationDuration={1000}
              animationEasing="ease-out"
            />
            {showSaves && (
              <Area
                type="monotone"
                dataKey="saves"
                stroke={SERIES[1]}
                strokeWidth={2}
                fill="url(#colorSaves)"
                animationDuration={1200}
                animationEasing="ease-out"
              />
            )}
            {showShares && (
              <Area
                type="monotone"
                dataKey="shares"
                stroke={SERIES[2]}
                strokeWidth={2}
                fill="url(#colorShares)"
                animationDuration={1400}
                animationEasing="ease-out"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
