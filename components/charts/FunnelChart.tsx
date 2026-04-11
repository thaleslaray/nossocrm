import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell
} from 'recharts';

interface FunnelChartProps {
  data: Array<{ name: string; count: number; fill?: string }>;
}

/**
 * Componente React `FunnelChart`.
 *
 * @param {FunnelChartProps} { data } - Parâmetro `{ data }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const FunnelChart: React.FC<FunnelChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Sem dados
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={50}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
        barSize={32}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" hide />
        <YAxis
          dataKey="name"
          type="category"
          width={100}
          tick={{ fill: 'var(--chart-text)', fontSize: 12, fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          formatter={(value: number) => [`${value} negócios`, 'Quantidade']}
          contentStyle={{
            backgroundColor: 'var(--chart-tooltip-bg)',
            border: '1px solid var(--chart-tooltip-border)',
            borderRadius: '8px',
            color: 'var(--chart-tooltip-text)',
            fontSize: '12px'
          }}
          itemStyle={{ color: '#e2e8f0' }}
        />
        <Bar
          dataKey="count"
          radius={[0, 4, 4, 0]}
          background={{ fill: 'rgba(148, 163, 184, 0.05)', radius: 4 }}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill || '#0ea5e9'} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            fill="var(--chart-text)"
            fontSize={12}
            fontWeight={600}
            formatter={(val) => (typeof val === 'number' && val !== 0) ? val : ''}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default FunnelChart;
