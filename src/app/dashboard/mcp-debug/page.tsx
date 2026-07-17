'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowRight, RefreshCw, KeyRound, Copy, Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface DecodedToken {
  raw: string;
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
}

interface TokenExchangeRecord {
  id: string;
  timestamp: string;
  toolName: string;
  mcpToken: DecodedToken;
  apiToken: DecodedToken;
  fromCache: boolean;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ja-JP', { hour12: false }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

function shorten(raw: string) {
  if (raw.length <= 32) return raw;
  return `${raw.slice(0, 16)}…${raw.slice(-12)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では無視
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 p-1 rounded-md transition-opacity hover:opacity-70"
      style={{ color: copied ? 'var(--positive)' : 'var(--muted)' }}
      title="生トークンをコピー"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function TokenPanel({ label, token, accent }: { label: string; token: DecodedToken; accent: string }) {
  const payload = token.payload ?? {};
  const scope = typeof payload.scope === 'string' ? payload.scope : '';
  const aud = payload.aud;
  const audStr = Array.isArray(aud) ? aud.join(', ') : String(aud ?? '-');

  return (
    <div className="flex-1 rounded-xl p-4" style={{ background: 'var(--background)', border: `1px solid ${accent}40` }}>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-4 h-4" style={{ color: accent }} />
        <span className="text-xs font-bold" style={{ color: accent }}>{label}</span>
      </div>
      <dl className="text-xs space-y-1.5 font-mono">
        <div className="flex gap-2">
          <dt className="flex-shrink-0" style={{ color: 'var(--muted)' }}>aud:</dt>
          <dd className="break-all" style={{ color: 'var(--foreground)' }}>{audStr}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex-shrink-0" style={{ color: 'var(--muted)' }}>sub:</dt>
          <dd className="break-all" style={{ color: 'var(--foreground)' }}>{String(payload.sub ?? '-')}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex-shrink-0" style={{ color: 'var(--muted)' }}>scope:</dt>
          <dd className="break-all" style={{ color: 'var(--foreground)' }}>{scope || '(なし)'}</dd>
        </div>
        {payload.act != null && (
          <div className="flex gap-2">
            <dt className="flex-shrink-0" style={{ color: 'var(--muted)' }}>act:</dt>
            <dd className="break-all" style={{ color: 'var(--positive)' }}>{JSON.stringify(payload.act)}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="flex-shrink-0" style={{ color: 'var(--muted)' }}>exp:</dt>
          <dd style={{ color: 'var(--foreground)' }}>
            {payload.exp ? new Date(Number(payload.exp) * 1000).toLocaleString('ja-JP') : '-'}
          </dd>
        </div>
      </dl>
      <details className="mt-3">
        <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>生トークン（JWT）</summary>
        <div className="mt-1 flex items-start gap-1.5">
          <p className="text-xs font-mono break-all flex-1" style={{ color: 'var(--muted)' }}>{shorten(token.raw)}</p>
          <CopyButton text={token.raw} />
        </div>
      </details>
    </div>
  );
}

export default function McpDebugPage() {
  const [records, setRecords] = useState<TokenExchangeRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch('/api/mcp-debug')
      .then((r) => r.json())
      .then((data: { records?: TokenExchangeRecord[]; error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setRecords(data.records ?? []);
        setError('');
      })
      .catch(() => setError('mcp-service に接続できません'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load, autoRefresh]);

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClear(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    fetch(`/api/mcp-debug?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {
      // 削除に失敗しても次回ポーリングで実情が反映される
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>MCP トークンビューア</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            MCP Client から受け取ったトークンと、OBO Token Exchange で交換した API トークンを表示します（デモ用途）。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            自動更新
          </label>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> 更新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--negative)' }}>
          {error}（mcp-service が起動しているか確認してください）
        </div>
      )}

      {loading && !error && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>読み込み中...</p>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
          まだトークン交換の履歴がありません。MCP クライアントからツールを呼び出すとここに表示されます。
        </div>
      )}

      <div className="space-y-4">
        {records.map((rec) => {
          const collapsed = collapsedIds.has(rec.id);
          return (
            <div key={rec.id} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => toggleCollapsed(rec.id)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  {collapsed ? (
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  )}
                  <span className="text-sm font-bold font-mono" style={{ color: 'var(--accent)' }}>{rec.toolName}</span>
                  {rec.fromCache && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(153,33,254,0.15)', color: 'var(--accent)' }}>
                      キャッシュ済み
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{fmtTime(rec.timestamp)}</span>
                  <button
                    onClick={() => handleClear(rec.id)}
                    className="p-1 rounded-md transition-opacity hover:opacity-70"
                    style={{ color: 'var(--negative)' }}
                    title="この記録を削除（画面とサーバーの両方から消去）"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {!collapsed && (
                <div className="flex items-stretch gap-3">
                  <TokenPanel label="MCP トークン（MCP Client → MCP Server）" token={rec.mcpToken} accent="#3B82F6" />
                  <div className="flex items-center justify-center flex-shrink-0">
                    <ArrowRight className="w-5 h-5" style={{ color: 'var(--muted)' }} />
                  </div>
                  <TokenPanel label="API トークン（OBO 交換後 → microservices）" token={rec.apiToken} accent="#22c55e" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
