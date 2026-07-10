import { auth0 } from '@/lib/auth0';
import TradePanel from '@/components/TradePanel';

type AssetType = 'STOCK' | 'FX' | 'CRYPTO' | 'ETF';

export default async function TradePage() {
  const session = await auth0.getSession();
  if (!session) return null;

  const usersApiUrl = process.env.USERS_API_URL ?? 'http://localhost:4002';
  const assetsApiUrl = process.env.ASSETS_API_URL ?? 'http://localhost:4003';
  const { token } = await auth0.getAccessToken();

  const headers = { Authorization: `Bearer ${token}` };

  let cashBalance = 0;
  let fxRates: Record<string, number> = { USD: 150 };
  let assets: {
    id: string;
    symbol: string;
    name: string;
    type: AssetType;
    currency: string;
    currentPrice: number;
    held: number;
  }[] = [];

  try {
    const [userRes, assetsRes] = await Promise.all([
      fetch(`${usersApiUrl}/users/me`, { headers, cache: 'no-store' }),
      fetch(`${assetsApiUrl}/assets`, { headers, cache: 'no-store' }),
    ]);

    if (!userRes.ok || !assetsRes.ok) return null;

    const [user, assetsData] = await Promise.all([
      userRes.json() as Promise<{ cashBalance: number }>,
      assetsRes.json() as Promise<{
        assets: { id: string; symbol: string; name: string; type: string; currency: string; currentPrice: number }[];
        fxRates: Record<string, number>;
      }>,
    ]);

    cashBalance = user.cashBalance;
    fxRates = { USD: 150, ...assetsData.fxRates };

    const holdingsRes = await fetch(`${usersApiUrl}/users/me/holdings`, { headers, cache: 'no-store' });
    const holdingMap: Record<string, number> = {};
    if (holdingsRes.ok) {
      const { holdings } = await holdingsRes.json() as { holdings: { asset: { id: string }; quantity: number }[] };
      for (const h of holdings) holdingMap[h.asset.id] = h.quantity;
    }

    assets = assetsData.assets.map((a) => ({ ...a, type: a.type as AssetType, held: holdingMap[a.id] ?? 0 }));
  } catch (err) {
    console.warn('[trade] サービス接続エラー:', err instanceof Error ? err.message : err);
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>取引</h1>
      <TradePanel data={{ cashBalance, fxRates, assets }} />
    </div>
  );
}
