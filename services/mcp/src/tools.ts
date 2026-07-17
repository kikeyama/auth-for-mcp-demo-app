import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OboExchanger } from './auth/obo.js';

const ASSETS_API = process.env.ASSETS_API_URL ?? 'http://localhost:4003';
const USERS_API  = process.env.USERS_API_URL  ?? 'http://localhost:4002';
const TRADES_API = process.env.TRADES_API_URL ?? 'http://localhost:4004';
const TX_API     = process.env.TRANSACTIONS_API_URL ?? 'http://localhost:4001';

async function apiFetch(url: string, oboToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${oboToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function registerTools(server: McpServer, obo: OboExchanger) {

  // ── 銘柄一覧 ─────────────────────────────────────────────────────────────
  server.registerTool(
    'list_assets',
    {
      description: '取引可能な銘柄の一覧と現在価格を返す。種別（STOCK / FX / CRYPTO / ETF）で絞り込み可能。',
      inputSchema: {
        type: z.enum(['STOCK', 'FX', 'CRYPTO', 'ETF']).optional().describe('銘柄種別フィルタ'),
      },
    },
    async ({ type }, extra) => {
      const authInfo = extra.authInfo as AuthInfo;
      const token = await obo.getToken(authInfo.token, authInfo.scopes, 'list_assets');
      const data = await apiFetch(`${ASSETS_API}/assets`, token) as {
        assets: { id: string; symbol: string; name: string; type: string; currency: string; currentPrice: number }[];
        fxRates: Record<string, number>;
      };

      const assets = type ? data.assets.filter(a => a.type === type) : data.assets;
      const usdJpy = data.fxRates['USD'] ?? 1;

      const lines = assets.map(a => {
        const jpy = a.currency === 'USD'
          ? `¥${Math.round(a.currentPrice * usdJpy).toLocaleString('ja-JP')} (${a.currentPrice} USD)`
          : `¥${a.currentPrice.toLocaleString('ja-JP')}`;
        return `${a.name} [${a.symbol}] ${a.type} ${jpy}`;
      });

      return { content: [{ type: 'text' as const, text: lines.join('\n') || '銘柄なし' }] };
    },
  );

  // ── ポートフォリオ ────────────────────────────────────────────────────────
  server.registerTool(
    'get_portfolio',
    {
      description: 'ログインユーザーの保有銘柄と現金残高を返す。',
      inputSchema: {},
    },
    async (_args, extra) => {
      const authInfo = extra.authInfo as AuthInfo;
      const token = await obo.getToken(authInfo.token, authInfo.scopes, 'get_portfolio');

      const [holdingsData, ratesData, meData] = await Promise.all([
        apiFetch(`${USERS_API}/users/me/holdings`, token) as Promise<{
          holdings: { quantity: number; avgCost: number; asset: { symbol: string; name: string; currency: string; currentPrice: number } }[];
        }>,
        apiFetch(`${ASSETS_API}/assets/rates`, token) as Promise<Record<string, number>>,
        apiFetch(`${USERS_API}/users/me`, token) as Promise<{ cashBalance: number }>,
      ]);

      const usdJpy = ratesData['USD'] ?? 1;
      const lines = holdingsData.holdings.map(h => {
        const currentJpy = h.asset.currency === 'USD' ? h.asset.currentPrice * usdJpy : h.asset.currentPrice;
        const pnl = (currentJpy - h.avgCost) * h.quantity;
        const pnlStr = pnl >= 0
          ? `+¥${Math.round(pnl).toLocaleString('ja-JP')}`
          : `-¥${Math.round(Math.abs(pnl)).toLocaleString('ja-JP')}`;
        return `${h.asset.name} [${h.asset.symbol}] 数量:${h.quantity} 平均取得:¥${Math.round(h.avgCost).toLocaleString('ja-JP')} 損益:${pnlStr}`;
      });

      lines.unshift(`現金残高: ¥${meData.cashBalance.toLocaleString('ja-JP')}`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── 価格履歴 ─────────────────────────────────────────────────────────────
  server.registerTool(
    'get_price_history',
    {
      description: '指定した銘柄の価格履歴を返す（最大168件=7日分）。',
      inputSchema: {
        asset_id: z.string().describe('銘柄 ID (list_assets で取得)'),
        limit: z.number().int().min(1).max(168).default(24).describe('取得件数（デフォルト24=1日分）'),
      },
    },
    async ({ asset_id, limit }, extra) => {
      const authInfo = extra.authInfo as AuthInfo;
      const token = await obo.getToken(authInfo.token, authInfo.scopes, 'get_price_history');
      const data = await apiFetch(
        `${ASSETS_API}/assets/${encodeURIComponent(asset_id)}/prices?limit=${limit}`,
        token,
      ) as { prices: { price: number; recordedAt: string }[] };

      if (!data.prices.length) {
        return { content: [{ type: 'text' as const, text: '価格データがまだありません' }] };
      }

      const first = data.prices[0].price;
      const last  = data.prices[data.prices.length - 1].price;
      const pct   = ((last - first) / first * 100).toFixed(2);
      const sign  = last >= first ? '+' : '';

      const lines = data.prices.map(p =>
        `${new Date(p.recordedAt).toLocaleString('ja-JP')} ¥${p.price.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`,
      );
      lines.unshift(`変動: ${sign}${pct}% (${data.prices.length}件)`);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── 取引履歴 ─────────────────────────────────────────────────────────────
  server.registerTool(
    'get_transactions',
    {
      description: 'ログインユーザーの取引履歴を返す。',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe('取得件数'),
      },
    },
    async ({ limit }, extra) => {
      const authInfo = extra.authInfo as AuthInfo;
      const token = await obo.getToken(authInfo.token, authInfo.scopes, 'get_transactions');
      const data = await apiFetch(`${TX_API}/transactions?limit=${limit}`, token) as {
        transactions: { type: string; quantity: number; price: number; total: number; createdAt: string; asset: { symbol: string; name: string } }[];
      };

      if (!data.transactions.length) {
        return { content: [{ type: 'text' as const, text: '取引履歴なし' }] };
      }

      const lines = data.transactions.map(t => {
        const date = new Date(t.createdAt).toLocaleString('ja-JP');
        const typeLabel = t.type === 'BUY' ? '購入' : '売却';
        return `${date} ${typeLabel} ${t.asset.name}[${t.asset.symbol}] ${t.quantity}口 @¥${Math.round(t.price).toLocaleString('ja-JP')} 合計¥${Math.round(t.total).toLocaleString('ja-JP')}`;
      });

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // ── 売買実行 ─────────────────────────────────────────────────────────────
  server.registerTool(
    'execute_trade',
    {
      description: '銘柄の購入または売却を実行する。`execute:trades` スコープが必要。',
      inputSchema: {
        asset_id: z.string().describe('銘柄 ID'),
        type: z.enum(['BUY', 'SELL']).describe('BUY=購入 / SELL=売却'),
        quantity: z.number().positive().describe('数量（小数可）'),
      },
    },
    async ({ asset_id, type, quantity }, extra) => {
      const authInfo = extra.authInfo as AuthInfo;

      if (!authInfo.scopes.includes('execute:trades')) {
        return {
          content: [{ type: 'text' as const, text: 'エラー: execute:trades スコープが必要です' }],
          isError: true,
        };
      }

      const token = await obo.getToken(authInfo.token, authInfo.scopes, 'execute_trade');
      const data = await apiFetch(`${TRADES_API}/trades`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset_id, type, quantity }),
      }) as { cashBalance: number; held: number };

      const typeLabel = type === 'BUY' ? '購入' : '売却';
      return {
        content: [{
          type: 'text' as const,
          text: `${typeLabel}完了\n保有数量: ${data.held}\n現金残高: ¥${Math.round(data.cashBalance).toLocaleString('ja-JP')}`,
        }],
      };
    },
  );
}
