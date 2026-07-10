import { auth0 } from '@/lib/auth0';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet } from 'lucide-react';

function fmtJPY(n: number) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);
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

export default async function DashboardPage() {
  const session = await auth0.getSession();
  if (!session) return null;

  const usersApiUrl = process.env.USERS_API_URL ?? 'http://localhost:4002';
  const assetsApiUrl = process.env.ASSETS_API_URL ?? 'http://localhost:4003';
  const transactionsApiUrl = process.env.TRANSACTIONS_API_URL ?? 'http://localhost:4001';
  const { token } = await auth0.getAccessToken();

  const headers = { Authorization: `Bearer ${token}` };

  let user: { id: string; cashBalance: number } | null = null;
  let holdingsData: Holding[] = [];
  let fxRates: Record<string, number> = { USD: 150 };
  let recentTransactions: { id: string; type: string; total: number; createdAt: string; asset: { name: string } }[] = [];

  try {
    const [userRes, holdingsRes, ratesRes, txRes] = await Promise.all([
      fetch(`${usersApiUrl}/users/me`, { headers, cache: 'no-store' }),
      fetch(`${usersApiUrl}/users/me/holdings`, { headers, cache: 'no-store' }),
      fetch(`${assetsApiUrl}/assets/rates`, { headers, cache: 'no-store' }),
      fetch(`${transactionsApiUrl}/transactions?limit=5`, { headers, cache: 'no-store' }),
    ]);
    if (userRes.ok) user = await userRes.json() as { id: string; cashBalance: number };
    if (holdingsRes.ok) holdingsData = ((await holdingsRes.json()) as { holdings: Holding[] }).holdings;
    if (ratesRes.ok) fxRates = { USD: 150, ...(await ratesRes.json() as Record<string, number>) };
    if (txRes.ok) {
      const txData = await txRes.json() as { data: { id: string; type: string; total: number; createdAt: string; asset: { name: string } }[] };
      recentTransactions = txData.data;
    }
  } catch (err) {
    console.warn('[dashboard] サービス接続エラー:', err instanceof Error ? err.message : err);
  }

  if (!user) return null;
  const cash = user.cashBalance;

  const holdings = holdingsData.map((h) => {
    const fxRate = fxRates[h.asset.currency] ?? 1;
    const currentValue = h.asset.currentPrice * h.quantity * fxRate;
    const costValue = h.avgCost * h.quantity * fxRate;
    const pnl = currentValue - costValue;
    const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;
    return { ...h, currentValue, costValue, pnl, pnlPct };
  });

  const totalAssetValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalPortfolioValue = cash + totalAssetValue;
  const totalCost = holdings.reduce((s, h) => s + h.costValue, 0);
  const totalPnl = totalAssetValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>ダッシュボード</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>ようこそ、{session.user.name ?? session.user.email} さん</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="総資産評価額" value={fmtJPY(totalPortfolioValue)} icon={<Wallet className="w-4 h-4" />} />
        <StatCard title="保有銘柄評価額" value={fmtJPY(totalAssetValue)} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard
          title="評価損益"
          value={fmtJPY(totalPnl)}
          sub={pct(totalPnlPct)}
          positive={totalPnl >= 0}
          icon={totalPnl >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        />
        <StatCard title="現金残高" value={fmtJPY(cash)} icon={<Wallet className="w-4 h-4" />} muted />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Holdings */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>保有資産</h2>
            <Link href="/dashboard/portfolio" className="text-sm hover:opacity-80" style={{ color: 'var(--accent)' }}>
              すべて見る →
            </Link>
          </div>
          {holdings.length === 0 ? (
            <div className="py-8 text-center" style={{ color: 'var(--muted)' }}>
              <p className="mb-3">保有資産はありません</p>
              <Link href="/dashboard/trade" className="text-sm px-4 py-2 rounded-lg" style={{ background: 'var(--accent)', color: '#fff' }}>
                取引を開始する
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {holdings.slice(0, 5).map((h) => (
                <div key={h.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: assetTypeColor(h.asset.type), color: '#fff' }}
                    >
                      {assetTypeLabel(h.asset.type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{h.asset.name}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{h.asset.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{fmtJPY(h.currentValue)}</p>
                    <p className="text-xs" style={{ color: h.pnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {pct(h.pnlPct)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>最近の取引</h2>
            <Link href="/dashboard/history" className="text-sm hover:opacity-80" style={{ color: 'var(--accent)' }}>
              すべて見る →
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
              取引履歴はありません
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: tx.type === 'BUY' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: tx.type === 'BUY' ? 'var(--positive)' : 'var(--negative)',
                      }}
                    >
                      {tx.type === 'BUY' ? '買' : '売'}
                    </span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{tx.asset.name}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        {new Date(tx.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {fmtJPY(tx.total)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title, value, sub, positive, icon, muted,
}: {
  title: string; value: string; sub?: string; positive?: boolean; icon: React.ReactNode; muted?: boolean;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{title}</p>
        <span style={{ color: muted ? 'var(--muted)' : 'var(--accent)' }}>{icon}</span>
      </div>
      <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{value}</p>
      {sub && (
        <p className="text-sm mt-1" style={{ color: positive ? 'var(--positive)' : 'var(--negative)' }}>{sub}</p>
      )}
    </div>
  );
}

function assetTypeLabel(type: string) {
  return { STOCK: '株', FX: 'FX', CRYPTO: '仮', ETF: 'ETF' }[type] ?? '?';
}

function assetTypeColor(type: string) {
  return { STOCK: '#3B82F6', FX: '#10B981', CRYPTO: '#F59E0B', ETF: '#8B5CF6' }[type] ?? '#6B7280';
}
