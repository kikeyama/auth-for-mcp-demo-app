'use server';

import { auth0 } from '@/lib/auth0';
import { revalidatePath } from 'next/cache';

interface TradeInput {
  assetId: string;
  type: 'BUY' | 'SELL';
  quantity: number;
}

export async function executeTrade(input: TradeInput) {
  const session = await auth0.getSession();
  if (!session) return { error: '認証が必要です' };

  const { assetId, type, quantity } = input;
  if (quantity <= 0) return { error: '数量が無効です' };

  const tradesApiUrl = process.env.TRADES_API_URL ?? 'http://localhost:4004';
  const { token } = await auth0.getAccessToken();

  const res = await fetch(`${tradesApiUrl}/trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assetId, type, quantity }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: '取引に失敗しました' })) as { error?: string };
    return { error: body.error ?? '取引に失敗しました' };
  }

  revalidatePath('/dashboard');
  const data = await res.json() as { cashBalance: number; held: number };
  return data;
}
