import 'dotenv/config';
import express from 'express';
import { ApiClient } from '@auth0/auth0-api-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { Auth0TokenVerifier } from './auth/verifier.js';
import { OboExchanger } from './auth/obo.js';
import { registerTools } from './tools.js';
import { getRecords, removeRecord } from './debug/store.js';

const port              = Number(process.env.PORT ?? 4005);
const auth0Domain       = process.env.AUTH0_DOMAIN!;
const mcpAudience       = process.env.AUTH0_AUDIENCE!;       // https://mcp.wealthvision.local
const mcpClientId       = process.env.MCP_CLIENT_ID!;
const mcpClientSecret   = process.env.MCP_CLIENT_SECRET!;
const apiAudience       = process.env.API_AUDIENCE!;         // https://api.wealthvision.local
const mcpBaseUrl        = process.env.MCP_BASE_URL ?? `http://localhost:${port}`;

// @auth0/auth0-api-js の ApiClient を一元管理
// - verifyAccessToken: MCP トークンの検証（audience = mcpAudience）
// - getTokenOnBehalfOf: ダウンストリーム API トークンの取得（OBO TE）
const apiClient = new ApiClient({
  domain: auth0Domain,
  audience: mcpAudience,
  clientId: mcpClientId,
  clientSecret: mcpClientSecret,
});

const verifier = new Auth0TokenVerifier(apiClient);
// OBO で要求するスコープはツール呼び出し時に MCP トークンの authInfo.scopes から都度渡す
// （ユーザーが同意した範囲だけをダウンストリーム API へ引き継ぐ）
const obo = new OboExchanger(apiClient, apiAudience);

const app = express();
app.use(express.json());

// ── RFC 9728: OAuth 2.0 Protected Resource Metadata ───────────────────────
// MCP Client はこのドキュメントから Authorization Server（Auth0）の場所を発見する。
const protectedResourceMetadata = {
  resource: `${mcpBaseUrl}/mcp`,
  authorization_servers: [`https://${auth0Domain}/`],
  scopes_supported: [
    'read:assets',
    'read:holdings',
    'read:transactions',
    'read:users',
    'execute:trades',
  ],
  resource_name: 'WealthVision MCP Server',
};

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(`${mcpBaseUrl}/mcp`));
const resourceMetadataPath = new URL(resourceMetadataUrl).pathname;

app.get(resourceMetadataPath, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(protectedResourceMetadata);
});
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(protectedResourceMetadata);
});

// ── MCP Endpoint ─────────────────────────────────────────────────────────
// 1. requireBearerAuth が MCP トークン（audience = mcpAudience）を検証
// 2. ツール呼び出し時に OboExchanger が API トークン（audience = apiAudience）へ交換
app.all('/mcp', requireBearerAuth({ verifier, resourceMetadataUrl }), async (req, res) => {
  const server = new McpServer({ name: 'wealthvision', version: '1.0.0' });
  registerTools(server, obo);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── デモ用トークンビューア ──────────────────────────────────────────────
// MCP トークンと OBO 交換後の API トークンをデコードして直近の履歴を返す。
// 本番運用ではトークンの生データを晒すため、明示的に無効化しない限りは
// デモ・開発用途を想定（ENABLE_TOKEN_DEBUG=false で無効化可能）。
if (process.env.ENABLE_TOKEN_DEBUG !== 'false') {
  app.get('/debug/tokens', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ records: getRecords() });
  });
  app.delete('/debug/tokens/:id', (req, res) => {
    const removed = removeRecord(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.status(204).end();
  });
  console.log('Token debug viewer: enabled at /debug/tokens (ENABLE_TOKEN_DEBUG=false to disable)');
}

app.listen(port, () => {
  console.log(`mcp-service listening on port ${port}`);
  console.log(`MCP endpoint:      ${mcpBaseUrl}/mcp`);
  console.log(`Resource metadata: ${resourceMetadataUrl}`);
  console.log(`Auth server:       https://${auth0Domain}/`);
  console.log(`MCP audience:      ${mcpAudience}`);
  console.log(`API audience:      ${apiAudience}`);
});
