'use client';

import { useState, useTransition } from 'react';
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react';
import { executeTrade } from '@/app/actions/trade';
import PriceHistoryModal from './PriceHistoryModal';

type AssetType = 'STOCK' | 'FX' | 'CRYPTO' | 'ETF';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  currentPrice: number;
  held: number;
}

interface Props {
  data: { cashBalance: number; fxRates: Record<string, number>; assets: Asset[] };
}

const TABS: { key: AssetType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'すべて' },
  { key: 'STOCK', label: '株式' },
  { key: 'FX', label: 'FX' },
  { key: 'CRYPTO', label: '仮想通貨' },
  { key: 'ETF', label: 'ETF' },
];

const TYPE_COLOR: Record<string, string> = {
  STOCK: '#3B82F6', FX: '#10B981', CRYPTO: '#F59E0B', ETF: '#8B5CF6',
};

const TYPE_LABEL: Record<string, string> = {
  STOCK: '株式', FX: 'FX', CRYPTO: '仮想通貨', ETF: 'ETF',
};

const fmtJPY = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

export default function TradePanel({ data }: Props) {
  const [tab, setTab] = useState<AssetType | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [cashBalance, setCashBalance] = useState(data.cashBalance);
  const [heldMap, setHeldMap] = useState<Record<string, number>>(
    Object.fromEntries(data.assets.map((a) => [a.id, a.held]))
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, startTransition] = useTransition();
  const [chartAsset, setChartAsset] = useState<Asset | null>(null);

  const filtered = data.assets.filter((a) => {
    const matchTab = tab === 'ALL' || a.type === tab;
    const matchQuery = query === '' || a.name.includes(query) || a.symbol.toLowerCase().includes(query.toLowerCase());
    return matchTab && matchQuery;
  });

  const qty = parseFloat(quantity) || 0;
  const fxRate = selected ? (data.fxRates[selected.currency] ?? 1) : 1;
  const totalJPY = selected ? qty * selected.currentPrice * fxRate : 0;
  const held = selected ? (heldMap[selected.id] ?? 0) : 0;
  const isUSD = selected?.currency === 'USD';

  function openModal(asset: Asset, type: 'BUY' | 'SELL') {
    setSelected(asset);
    setTradeType(type);
    setQuantity('');
    setError('');
    setSuccess('');
  }

  function closeModal() {
    setSelected(null);
    setQuantity('');
    setError('');
    setSuccess('');
  }

  function handleSubmit() {
    if (!selected || qty <= 0) { setError('数量を入力してください'); return; }
    if (tradeType === 'BUY' && totalJPY > cashBalance) { setError('現金残高が不足しています'); return; }
    if (tradeType === 'SELL' && qty > held) { setError('保有数量を超えています'); return; }

    startTransition(async () => {
      const res = await executeTrade({ assetId: selected.id, type: tradeType, quantity: qty });
      if ('error' in res) {
        setError(res.error);
      } else {
        setSuccess(`${tradeType === 'BUY' ? '購入' : '売却'}が完了しました`);
        setCashBalance(res.cashBalance);
        setHeldMap((prev) => ({ ...prev, [selected.id]: res.held }));
        setQuantity('');
        setTimeout(closeModal, 1500);
      }
    });
  }

  return (
    <>
      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? '#fff' : 'var(--muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="銘柄名・シンボルで検索"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          />
        </div>
        <div className="text-sm flex items-center" style={{ color: 'var(--muted)' }}>
          現金残高: <span className="ml-1 font-semibold" style={{ color: 'var(--foreground)' }}>
            {fmtJPY(cashBalance)}
          </span>
        </div>
      </div>

      {/* Asset Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['銘柄', '種別', '現在価格', '保有数量', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td
                  className="px-4 py-3 cursor-pointer hover:opacity-75 transition-opacity"
                  onClick={() => setChartAsset(a)}
                >
                  <div className="font-medium" style={{ color: 'var(--foreground)' }}>{a.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{a.symbol}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: TYPE_COLOR[a.type] + '25', color: TYPE_COLOR[a.type] }}
                  >
                    {TYPE_LABEL[a.type]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono" style={{ color: 'var(--foreground)' }}>
                  {a.currentPrice.toLocaleString('ja-JP')} {a.currency}
                </td>
                <td className="px-4 py-3" style={{ color: (heldMap[a.id] ?? 0) > 0 ? 'var(--foreground)' : 'var(--muted)' }}>
                  {(heldMap[a.id] ?? 0).toLocaleString('ja-JP')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openModal(a, 'BUY')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--positive)' }}
                    >
                      <TrendingUp className="w-3 h-3" /> 買
                    </button>
                    {(heldMap[a.id] ?? 0) > 0 && (
                      <button
                        onClick={() => openModal(a, 'SELL')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--negative)' }}
                      >
                        <TrendingDown className="w-3 h-3" /> 売
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>銘柄が見つかりません</div>
        )}
      </div>

      {/* Price History Modal */}
      {chartAsset && !selected && (
        <PriceHistoryModal
          asset={chartAsset}
          fxRate={data.fxRates[chartAsset.currency] ?? 1}
          canSell={(heldMap[chartAsset.id] ?? 0) > 0}
          onClose={() => setChartAsset(null)}
          onTrade={(type) => {
            openModal(chartAsset, type);
            setChartAsset(null);
          }}
        />
      )}

      {/* Trade Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                <span style={{ color: tradeType === 'BUY' ? 'var(--positive)' : 'var(--negative)' }}>
                  {tradeType === 'BUY' ? '購入' : '売却'}
                </span>
                　{selected.name}
              </h2>
              <button onClick={closeModal} style={{ color: 'var(--muted)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>現在価格</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--foreground)' }}>
                  {selected.currentPrice.toLocaleString('ja-JP')} {selected.currency}
                  {isUSD && (
                    <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>
                      (≈ {fmtJPY(selected.currentPrice * fxRate)})
                    </span>
                  )}
                </span>
              </div>
              {isUSD && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>適用為替レート</span>
                  <span style={{ color: 'var(--muted)' }}>1 USD = {fxRate.toLocaleString('ja-JP')} JPY</span>
                </div>
              )}
              {tradeType === 'BUY' ? (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>利用可能現金</span>
                  <span style={{ color: 'var(--foreground)' }}>{fmtJPY(cashBalance)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>保有数量</span>
                  <span style={{ color: 'var(--foreground)' }}>{held.toLocaleString('ja-JP')}</span>
                </div>
              )}

              <div>
                <label className="block text-sm mb-2" style={{ color: 'var(--muted)' }}>
                  数量
                  {tradeType === 'SELL' && (
                    <button
                      className="ml-2 text-xs underline"
                      style={{ color: 'var(--accent)' }}
                      onClick={() => setQuantity(String(held))}
                    >
                      全売却
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                />
              </div>

              <div
                className="flex justify-between p-4 rounded-xl"
                style={{ background: 'var(--background)' }}
              >
                <span className="text-sm" style={{ color: 'var(--muted)' }}>合計金額（円）</span>
                <span className="font-bold" style={{ color: 'var(--foreground)' }}>
                  {fmtJPY(totalJPY)}
                </span>
              </div>
            </div>

            {error && <p className="text-sm mb-4 text-center" style={{ color: 'var(--negative)' }}>{error}</p>}
            {success && <p className="text-sm mb-4 text-center" style={{ color: 'var(--positive)' }}>{success}</p>}

            <button
              onClick={handleSubmit}
              disabled={isPending || qty <= 0}
              className="w-full py-3 rounded-xl font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                background: tradeType === 'BUY' ? 'var(--positive)' : 'var(--negative)',
                color: '#fff',
              }}
            >
              {isPending ? '処理中...' : tradeType === 'BUY' ? '購入する' : '売却する'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
