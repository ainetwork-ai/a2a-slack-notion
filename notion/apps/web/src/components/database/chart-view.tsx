'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { PropertyDefinition } from '@notion/shared';
import type { DatabaseRow } from '@/stores/database';
import { cn } from '@/lib/utils';

interface ChartViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
}

type ChartType = 'bar' | 'line' | 'pie';
type AggregationFn = 'count' | 'sum' | 'avg';

// Notion block color palette
const CHART_COLORS = [
  '#337ea9', // blue
  '#448361', // green
  '#d9730d', // orange
  '#9065b0', // purple
  '#eb5757', // red
  '#cb912f', // yellow
  '#c14c8a', // pink
  '#9f6b53', // brown
];

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  line: 'Line',
  pie: 'Pie',
};

export function ChartView({ properties, rows }: ChartViewProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxisPropertyId, setXAxisPropertyId] = useState<string>('');
  const [aggregation, setAggregation] = useState<AggregationFn>('count');
  const [yAxisPropertyId, setYAxisPropertyId] = useState<string>('');

  // Properties usable as X axis grouping
  const groupableProperties = useMemo(
    () => properties.filter((p) => ['select', 'status', 'multi_select', 'checkbox', 'person'].includes(p.type)),
    [properties],
  );

  // Properties usable as Y axis aggregation (number only)
  const numericProperties = useMemo(
    () => properties.filter((p) => p.type === 'number'),
    [properties],
  );

  // Default to first groupable property
  const effectiveXId = xAxisPropertyId || groupableProperties[0]?.id || '';
  const xProp = properties.find((p) => p.id === effectiveXId);

  // Build chart data
  const chartData = useMemo(() => {
    if (!xProp) return [];

    const groups = new Map<string, { sum: number; count: number }>();

    for (const row of rows) {
      const val = row.properties.values[xProp.id];
      let labels: string[] = [];

      if (xProp.type === 'select' || xProp.type === 'status') {
        const optId = val?.type === 'select' || val?.type === 'status'
          ? (val.value as string | null)
          : null;
        if (optId) {
          const opt = xProp.options?.find((o) => o.id === optId);
          labels = [opt?.name ?? optId];
        } else {
          labels = ['(empty)'];
        }
      } else if (xProp.type === 'multi_select') {
        const ids = val?.type === 'multi_select' ? (val.value as string[]) : [];
        labels = ids.length > 0
          ? ids.map((id) => xProp.options?.find((o) => o.id === id)?.name ?? id)
          : ['(empty)'];
      } else if (xProp.type === 'checkbox') {
        const checked = val?.type === 'checkbox' ? val.value : false;
        labels = [checked ? 'Checked' : 'Unchecked'];
      } else {
        labels = ['(empty)'];
      }

      for (const label of labels) {
        const existing = groups.get(label) ?? { sum: 0, count: 0 };
        existing.count += 1;

        if (aggregation !== 'count' && yAxisPropertyId) {
          const numVal = row.properties.values[yAxisPropertyId];
          const num = numVal?.type === 'number' ? (numVal.value ?? 0) : 0;
          existing.sum += num as number;
        }

        groups.set(label, existing);
      }
    }

    return Array.from(groups.entries()).map(([name, g]) => {
      let value: number;
      if (aggregation === 'count') {
        value = g.count;
      } else if (aggregation === 'sum') {
        value = g.sum;
      } else {
        value = g.count > 0 ? g.sum / g.count : 0;
      }
      return { name, value: Math.round(value * 100) / 100 };
    });
  }, [rows, xProp, aggregation, yAxisPropertyId]);

  const yLabel =
    aggregation === 'count'
      ? 'Count'
      : aggregation === 'sum'
      ? `Sum of ${numericProperties.find((p) => p.id === yAxisPropertyId)?.name ?? ''}`
      : `Avg of ${numericProperties.find((p) => p.id === yAxisPropertyId)?.name ?? ''}`;

  const isEmpty = chartData.length === 0;

  return (
    <div className="px-4 py-3 border-b border-[var(--divider)] bg-[var(--bg-default)]">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Chart type toggle */}
        <div className="flex items-center rounded-[4px] shadow-[0_0_0_1px_var(--divider)] overflow-hidden">
          {(['bar', 'line', 'pie'] as ChartType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setChartType(type)}
              className={cn(
                'px-3 py-1 text-xs transition-colors duration-[var(--duration-micro)]',
                chartType === type
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {CHART_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        {/* X axis selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-tertiary)]">Group by</span>
          <select
            value={effectiveXId}
            onChange={(e) => setXAxisPropertyId(e.target.value)}
            className="text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none shadow-[0_0_0_1px_var(--divider)]"
          >
            {groupableProperties.length === 0 && (
              <option value="">No groupable properties</option>
            )}
            {groupableProperties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Y axis / aggregation */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-tertiary)]">Value</span>
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value as AggregationFn)}
            className="text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none shadow-[0_0_0_1px_var(--divider)]"
          >
            <option value="count">Count</option>
            {numericProperties.map((p) => (
              <option key={`sum-${p.id}`} value="sum">Sum of {p.name}</option>
            ))}
            {numericProperties.map((p) => (
              <option key={`avg-${p.id}`} value="avg">Avg of {p.name}</option>
            ))}
          </select>
          {aggregation !== 'count' && numericProperties.length > 0 && (
            <select
              value={yAxisPropertyId}
              onChange={(e) => setYAxisPropertyId(e.target.value)}
              className="text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none shadow-[0_0_0_1px_var(--divider)]"
            >
              <option value="">Select property</option>
              {numericProperties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="h-[240px] w-full">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[var(--text-tertiary)]">
              {groupableProperties.length === 0
                ? 'Add a select, status, or checkbox property to chart your data'
                : 'No data to display'}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  label={{ value: yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--text-tertiary)' }, offset: 8 }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-default)',
                    border: '1px solid var(--divider)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                  cursor={{ fill: 'var(--bg-hover)' }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={56}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-default)',
                    border: '1px solid var(--divider)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={{ fill: CHART_COLORS[0], r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <PieChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} (${Math.round((percent ?? 0) * 100)}%)`
                  }
                  labelLine={false}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-default)',
                    border: '1px solid var(--divider)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                />
                <Legend
                  iconSize={10}
                  iconType="circle"
                  formatter={(value: string) => (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{value}</span>
                  )}
                />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
