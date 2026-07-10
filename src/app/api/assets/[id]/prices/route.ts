import { auth0 } from '@/lib/auth0';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/assets/[id]/prices'>) {
  const { id } = await ctx.params;
  const limit = req.nextUrl.searchParams.get('limit') ?? '168';

  const { token } = await auth0.getAccessToken();
  const assetsApiUrl = process.env.ASSETS_API_URL ?? 'http://localhost:4003';

  const res = await fetch(`${assetsApiUrl}/assets/${id}/prices?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
