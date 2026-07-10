import { auth0 } from '@/lib/auth0';
import PortfolioChart from '@/components/PortfolioChart';

function fmtJPY(n: number) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);
}

function fmtNative(price: number, currency: string) {
  if (currency === 'JPY') {
    return price.toLocaleString('ja-JP') + ' JPY';
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}

function pct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

interface Holding {
  id: string;
  quantity: number;
  avgCost: number;
  asset: {
    id: string;
    symbol: string;
    name: string;
    type: string;
    currency: string;
    currentPrice: number;
  };
}

export default async function PortfolioPage() {
  const session = await auth0.getSession();
  if (!session) return null;

  const usersApiUrl = process.env.USERS_API_URL ?? 'http://localhost:4002';
  const assetsApiUrl = process.env.ASSETS_API_URL ?? 'http://localhost:4003';
  const { token } = await auth0.getAccessToken();

  const headers = { Authorization: `Bearer ${token}` };

  let user: { cashBalance: number } | null = null;
  let holdingsData: Holding[] = [];
  let fxRates: Record<string, number> = { USD: 150 };

  try {
    const [userRes, holdingsRes, ratesRes] = await Promise.all([
      fetch(`${usersApiUrl}/users/me`, { headers, cache: 'no-store' }),
      fetch(`${usersApiUrl}/users/me/holdings`, { headers, cache: 'no-store' }),
      fetch(`${assetsApiUrl}/assets/rates`, { headers, cache: 'no-store' }),
    ]);
    if (userRes.ok) user = await userRes.json() as { cashBalance: number };
    if (holdingsRes.ok) holdingsData = ((await holdingsRes.json()) as { holdings: Holding[] }).holdings;
    if (ratesRes.ok) fxRates = { USD: 150, ...(await ratesRes.json() as Record<string, number>) };
  } catch (err) {
    console.warn('[portfolio] サービス接続エラー:', err instanceof Error ? err.message : err);
  }

  if (!user) return null;
  const cash = user.cashBalance;

  const holdings = holdingsData.map((h) => {
    const fxRate = fxRates[h.asset.currency] ?? 1;
    const currentValue = h.asset.currentPrice * h.quantity * fxRate;
    const costValue = h.avgCost * h.quantity * fxRate;
    const pnl = currentValue - costValue;
    const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;
    return { ...h, currentValue, costValue, pnl, pnlPct, fxRate };
  });

  const totalAssetValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalPortfolioValue = cash + totalAssetValue;

  const chartData = [
    ...(cash > 0 ? [{ name: '現金', value: cash, type: 'CASH' }] : []),
    ...holdings.map((h) => ({ name: h.asset.name, value: h.currentValue, type: h.asset.type })),
  ];

  const byType: Record<string, { value: number; count: number }> = {};
  holdings.forEach((h) => {
    if (!byType[h.asset.type]) byType[h.asset.type] = { value: 0, count: 0 };
    byType[h.asset.type].value += h.currentValue;
    byType[h.asset.type].count += 1;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>ポートフォリオ</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-1 rounded-2xl p-6 flex flex-col items-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>総資産評価額</p>
          <p className="text-2xl font-bold mb-6" style={{ color: 'var(--foreground)' }}>{fmtJPY(totalPortfolioValue)}</p>
          <PortfolioChart data={chartData} />
          <div className="mt-4 w-full space-y-2">
            {chartData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: typeColor(d.type) }} />
                  <span style={{ color: 'var(--muted)' }}>{d.name}</span>
                </div>
                <span style={{ color: 'var(--foreground)' }}>
                  {((d.value / totalPortfolioValue) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Holdings Table */}
        <div className="lg:col-span-2 rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>保有銘柄一覧</h2>
          {holdings.length === 0 ? (
            <div className="py-12 text-center" style={{ color: 'var(--muted)' }}>保有資産はありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    {['銘柄', '種別', '数量', '平均取得単価', '現在価格', '評価額 (JPY)', '評価損益 (JPY)'].map((h) => (
                      <th key={h} className="pb-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 font-medium" style={{ color: 'var(--foreground)' }}>
                        <div>{h.asset.name}</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>{h.asset.symbol}</div>
                      </td>
                      <td className="py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{ background: typeColor(h.asset.type) + '30', color: typeColor(h.asset.type) }}
                        >
                          {typeLabel(h.asset.type)}
                        </span>
                      </td>
                      <td className="py-3" style={{ color: 'var(--foreground)' }}>{h.quantity.toLocaleString('ja-JP')}</td>
                      <td className="py-3 font-mono" style={{ color: 'var(--muted)' }}>
                        <div>{fmtNative(h.avgCost, h.asset.currency)}</div>
                        {h.asset.currency !== 'JPY' && (
                          <div className="text-xs" style={{ color: 'var(--muted)' }}>
                            ≈ {fmtJPY(h.avgCost * h.fxRate)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 font-mono" style={{ color: 'var(--foreground)' }}>
                        <div>{fmtNative(h.asset.currentPrice, h.asset.currency)}</div>
                        {h.asset.currency !== 'JPY' && (
                          <div className="text-xs" style={{ color: 'var(--muted)' }}>
                            ≈ {fmtJPY(h.asset.currentPrice * h.fxRate)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 font-medium" style={{ color: 'var(--foreground)' }}>
                        {fmtJPY(h.currentValue)}
                      </td>
                      <td className="py-3">
                        <div style={{ color: h.pnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                          {fmtJPY(h.pnl)}
                        </div>
                        <div className="text-xs" style={{ color: h.pnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                          {pct(h.pnlPct)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* By Type Summary */}
      {Object.keys(byType).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(byType).map(([type, { value, count }]) => (
            <div
              key={type}
              className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: typeColor(type) }} />
                <span className="text-sm font-medium" style={{ color: typeColor(type) }}>{typeLabel(type)}</span>
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{fmtJPY(value)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{count} 銘柄</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function typeLabel(type: string) {
  return { STOCK: '株式', FX: 'FX', CRYPTO: '仮想通貨', ETF: 'ETF', CASH: '現金' }[type] ?? type;
}

function typeColor(type: string) {
  return { STOCK: '#3B82F6', FX: '#10B981', CRYPTO: '#F59E0B', ETF: '#8B5CF6', CASH: '#6B7280' }[type] ?? '#9921FE';
}
