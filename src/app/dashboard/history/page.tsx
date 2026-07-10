import { auth0 } from '@/lib/auth0';

interface Transaction {
  id: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
  asset: { symbol: string; name: string; currency: string };
}

function fmt(n: number) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);
}

function fmtNativePrice(price: number, currency: string) {
  if (currency === 'JPY') return price.toLocaleString('ja-JP') + ' JPY';
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}

export default async function HistoryPage() {
  const session = await auth0.getSession();
  if (!session) return null;

  const apiUrl = process.env.TRANSACTIONS_API_URL ?? 'http://localhost:4001';

  let transactions: Transaction[] = [];
  let fetchError: string | null = null;

  try {
    const { token } = await auth0.getAccessToken();
    const res = await fetch(`${apiUrl}/transactions?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      fetchError = body.error ?? `HTTP ${res.status}`;
    } else {
      const json = await res.json();
      transactions = json.data;
    }
  } catch (err) {
    if (err instanceof TypeError && err.message === 'fetch failed') {
      const cause = (err as NodeJS.ErrnoException & { cause?: { code?: string } }).cause;
      if (cause?.code === 'ECONNREFUSED') {
        fetchError = `transactions-service に接続できません (${apiUrl})。サービスが起動しているか確認してください。`;
      } else {
        fetchError = `接続エラー: ${cause?.code ?? err.message}`;
      }
    } else {
      fetchError = err instanceof Error ? err.message : 'API接続エラー';
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>取引履歴</h1>

      {fetchError && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--negative)' }}>
          APIエラー: {fetchError}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {transactions.length === 0 && !fetchError ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>
            取引履歴はありません
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['日時', '種別', '銘柄', '数量', '単価', '合計金額 (JPY)'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                    {new Date(tx.createdAt).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-semibold px-2.5 py-0.5 rounded"
                      style={{
                        background: tx.type === 'BUY' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: tx.type === 'BUY' ? 'var(--positive)' : 'var(--negative)',
                      }}
                    >
                      {tx.type === 'BUY' ? '購入' : '売却'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'var(--foreground)' }}>{tx.asset.name}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{tx.asset.symbol}</div>
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--foreground)' }}>
                    {tx.quantity.toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--muted)' }}>
                    {fmtNativePrice(tx.price, tx.asset.currency)}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>
                    {fmt(tx.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
