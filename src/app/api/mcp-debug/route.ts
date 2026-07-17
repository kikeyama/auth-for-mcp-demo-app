import { auth0 } from '@/lib/auth0';
import type { NextRequest } from 'next/server';

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: '認証が必要です' }, { status: 401 });

  const mcpApiUrl = process.env.MCP_API_URL ?? 'http://localhost:4005';

  const res = await fetch(`${mcpApiUrl}/debug/tokens`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: '認証が必要です' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const mcpApiUrl = process.env.MCP_API_URL ?? 'http://localhost:4005';

  const res = await fetch(`${mcpApiUrl}/debug/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  return new Response(null, { status: 204 });
}
