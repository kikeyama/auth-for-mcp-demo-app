'use client';

import { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface PricePoint {
  price: number;
  recordedAt: string;
}

interface Asset {
  id: string;
  name: string;
  symbol: string;
  currency: string;
  currentPrice: number;
}

interface Props {
  asset: Asset;
  fxRate: number;
  onClose: () => void;
  onTrade: (type: 'BUY' | 'SELL') => void;
  canSell: boolean;
}

const fmtJPY = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function PriceHistoryModal({ asset, fxRate, onClose, onTrade, canSell }: Props) {
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/assets/${asset.id}/prices?limit=168`)
      .then((r) => r.json())
      .then((data: { prices: PricePoint[] }) => setPrices(data.prices ?? []))
      .catch(() => setPrices([]))
      .finally(() => setLoading(false));
  }, [asset.id]);

  const first = prices[0]?.price;
  const last = prices[prices.length - 1]?.price ?? asset.currentPrice;
  const change = first != null ? last - first : null;
  const changePct = first != null && first > 0 ? (change! / first) * 100 : null;
  const isUp = change == null || change >= 0;
  const color = isUp ? 'var(--positive)' : 'var(--negative)';

  const isUSD = asset.currency === 'USD';

  const chartData = prices.map((p) => ({
    time: formatTime(p.recordedAt),
    price: isUSD ? parseFloat((p.price * fxRate).toFixed(0)) : p.price,
  }));

  const yValues = chartData.map((d) => d.price);
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 1;
  const yPad = (yMax - yMin) * 0.05 || yMax * 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{asset.name}</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{asset.symbol}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Price info */}
        <div className="flex items-end gap-4 mb-6">
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>現在価格</p>
            <p className="text-2xl font-bold font-mono" style={{ color: 'var(--foreground)' }}>
              {isUSD ? fmtJPY(asset.currentPrice * fxRate) : asset.currentPrice.toLocaleString('ja-JP') + ' JPY'}
            </p>
            {isUSD && (
              <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                {asset.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
              </p>
            )}
          </div>
          {changePct != null && (
            <p className="text-sm font-semibold mb-1" style={{ color }}>
              {isUp ? '+' : ''}{changePct.toFixed(2)}%
              <span className="ml-1 font-normal text-xs" style={{ color: 'var(--muted)' }}>（直近 {prices.length} 時間）</span>
            </p>
          )}
        </div>

        {/* Chart */}
        <div className="mb-6" style={{ height: 220 }}>
          {loading ? (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--muted)' }}>
              読み込み中...
            </div>
          ) : chartData.length < 2 ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>
              価格データが蓄積されるまでお待ちください
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[yMin - yPad, yMax + yPad]}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v.toLocaleString('ja-JP')}
                  width={60}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--muted)' }}
                  formatter={(v) => [Number(v).toLocaleString('ja-JP') + (isUSD ? ' JPY' : ' ' + asset.currency), '価格']}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={isUp ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Trade buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => onTrade('BUY')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--positive)' }}
          >
            <TrendingUp className="w-4 h-4" /> 購入する
          </button>
          {canSell && (
            <button
              onClick={() => onTrade('SELL')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--negative)' }}
            >
              <TrendingDown className="w-4 h-4" /> 売却する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
