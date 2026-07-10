'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = {
  STOCK: '#3B82F6',
  FX: '#10B981',
  CRYPTO: '#F59E0B',
  ETF: '#8B5CF6',
  CASH: '#6B7280',
};

interface Props {
  data: { name: string; value: number; type: string }[];
}

export default function PortfolioChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
        データなし
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.type] ?? '#9921FE'} strokeWidth={0} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) =>
            new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Number(value))
          }
          contentStyle={{ background: '#1A0230', border: '1px solid #3D1265', borderRadius: 8, color: '#F0E6FF' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
