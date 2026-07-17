@AGENTS.md

# Architecture

Next.js 16 (App Router) フロントエンド + 4つの独立した Express マイクロサービス構成。Next.js はデータを直接 DB に書かず、すべてマイクロサービス経由でアクセスする。

```
Browser → Next.js (port 3000)
              ├── users-service    (port 4002)
              ├── assets-service   (port 4003)
              ├── trades-service   (port 4004)
              └── transactions-service (port 4001)

MCP Client (Claude Desktop 等)
  → mcp-service (port 4005) ← Resource Server のみ。AS は Auth0
      └── MCP Endpoint (/mcp) → OBO Token Exchange → 各マイクロサービス
```

## サービス一覧

| サービス | ポート | スコープ | 主な役割 |
|---|---|---|---|
| transactions | 4001 | `read:transactions` | 取引履歴参照 |
| users | 4002 | `create:users` `read:users` `read:holdings` | ユーザー同期・保有資産 |
| assets | 4003 | `read:assets` | 銘柄・価格・履歴 |
| trades | 4004 | `execute:trades` | 売買実行（DB トランザクション） |
| mcp | 4005 | — | MCP サーバー（Resource Server）+ OBO Token Exchange |

# Auth0

## Next.js 側（`@auth0/nextjs-auth0` v4）

```typescript
// src/lib/auth0.ts
export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email offline_access create:users read:users read:holdings read:transactions read:assets execute:trades',
  },
});
```

- `offline_access` スコープでリフレッシュトークンを取得（Auth0 Dashboard 側でも設定済み）
- Server Actions / Server Components では `auth0.getAccessToken()` でトークンを取得してマイクロサービスへ転送
- クライアントコンポーネントからマイクロサービスを呼ぶ場合は Next.js API Route をプロキシとして挟む（`src/app/api/assets/[id]/prices/route.ts` が例）

## マイクロサービス側（`express-oauth2-jwt-bearer`）

**必ず `checkJwt` を `requiredScopes` より前に適用すること。**  
`checkJwt` がないと `req.auth` が未設定になり、`requiredScopes` が即座に 401 を返す。

```typescript
router.use(checkJwt);                          // JWT 検証 → req.auth をセット
router.get('/', requiredScopes('read:assets'), handler);  // スコープ検証
```

# データベース

## Prisma の役割

Prisma は**スキーマ管理とマイグレーションのみ**に使用。ランタイムクエリは実行しない。

```bash
npm run db:migrate   # prisma migrate dev（開発）
npm run db:push      # prisma db push（スキーマ反映）
npm run db:seed      # 初期データ投入
```

## ランタイムクエリ

全マイクロサービスで `pg` Pool による生 SQL を使用。

## ID 生成

全テーブルで `@paralleldrive/cuid2` の `createId()` を使用（Prisma の `@default(cuid())` と同じライブラリ）。

```typescript
import { createId } from '@paralleldrive/cuid2';
await pool.query('INSERT INTO holdings (id, ...) VALUES ($1, ...)', [createId(), ...]);
```

`gen_random_uuid()` は使わない。

## テーブル構成

| テーブル | 主キー形式 | 管理 |
|---|---|---|
| users | cuid2 | users-service |
| assets | cuid2（seed 時は Prisma） | assets-service |
| asset_prices | cuid2 | assets-service (priceTicker) |
| holdings | cuid2 | trades-service |
| transactions | cuid2 | trades-service |

# 価格ティッカー（assets-service）

`services/assets/src/priceTicker.ts` が 1 時間ごとに全銘柄の価格を更新し、`asset_prices` テーブルに履歴を記録。

- 通常変動: ±0〜2%
- 大きな変動（FX 以外のみ、5% の確率）: ±5〜10%
- サービス起動時に即時実行し、その後 1 時間ごとに繰り返す

# Next.js 固有のパターン

## Route Handler の params（Next.js 15+/16）

params は Promise なので必ず await する。型は `RouteContext<'/path/[param]'>` を使用。

```typescript
export async function GET(req: NextRequest, ctx: RouteContext<'/api/assets/[id]/prices'>) {
  const { id } = await ctx.params;
}
```

## クライアントコンポーネントからのマイクロサービス呼び出し

アクセストークンをブラウザに渡さないため、Next.js API Route をプロキシとして使う。

```
Client Component
  → fetch('/api/assets/:id/prices')   ← Next.js API Route（サーバーサイド）
      → fetch(`${ASSETS_API_URL}/...`, { Authorization: Bearer token })
```

# MCP サーバー（mcp-service）

**参照仕様:** https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

`services/mcp/` が `@modelcontextprotocol/sdk` を使った MCP サーバー（Resource Server）。
`@auth0/auth0-api-js` を使って On-Behalf-Of Token Exchange でマイクロサービスを呼び出す。

## 設計の背景

MCP Authorization 仕様を読んで確定した役割分担と、実装上の判断を記録する。

### MCP Server は Resource Server のみ

MCP 仕様は MCP Server を **OAuth 2.1 Resource Server** と定義している。
Authorization Server（トークン発行）は別エンティティ（今回は Auth0）が担う。
当初の実装では MCP Server が `/authorize`・`/token` を実装する Authorization Server として動いていたが、これは仕様違反であり修正した。

### トークンパススルーは禁止

MCP 仕様のセキュリティ要件：

> "If the MCP server makes requests to upstream APIs, it may act as an OAuth client to them.
> The MCP server **MUST NOT** pass through the token it received from the MCP client."

そのため MCP トークンをそのままマイクロサービスへ転送することは禁止されている。

### なぜ M2M・内部トークンではなく OBO なのか

マイクロサービスは `req.auth?.payload.sub`（Auth0 ユーザー ID）で SQL を発行してユーザーを特定している。
M2M トークンや内部トークンに切り替えると `sub` がサービスアカウント識別子になり、`WHERE auth0_id = $1` が機能しなくなる。
ユーザー ID を維持したままトークンを交換できる **On-Behalf-Of Token Exchange（RFC 8693）** が唯一の現実的な選択肢。

### OBO が社内ベストプラクティスであることの確認

- Auth0 ブログ（https://auth0.com/blog/auth0-auth-for-mcp-servers-generally-available）で OBO が MCP のベストプラクティスとして明示されている
- 社内 Slack `#auth0-hiive` で Auth0 チームメンバーが MCP 向けに OBO を推奨（Enterprise Basic 以上で利用可能、30 RPS レート制限）
- 社内 Confluence に動作確認済みの How-To ページあり（https://oktainc.atlassian.net/wiki/spaces/AFS/pages/992446073/）

### Auth0 の OBO 実装詳細

**参照ドキュメント:** https://auth0.com/docs/secure/call-apis-on-users-behalf/on-behalf-of-token-exchange

- `@auth0/auth0-api-js` の `ApiClient.getTokenOnBehalfOf()` で実装
- Custom API Client（`app_type: resource_server`）が必要 — MCP Server の API 設定画面から作成する
- User-Delegated Client Grant（`subject_type: user`）でダウンストリーム API へのスコープを定義

## ロール分担

| ロール | 担当 |
|---|---|
| OAuth Resource Server | mcp-service（MCP トークンを検証し OBO でマイクロサービスへ委譲） |
| OAuth Authorization Server | Auth0（ユーザー認証・トークン発行） |
| OAuth Client | MCP Client（Claude Desktop 等が Auth0 に直接登録） |

## トークン構造

| トークン | Audience | 用途 |
|---|---|---|
| MCP トークン | `http://localhost:4005/mcp` | MCP Client → MCP Server |
| API トークン | `https://api.wealthvision.local` | MCP Server → microservices（OBO 交換後） |

## 認可フロー

```
MCP Client → GET /mcp → 401 + WWW-Authenticate: Bearer resource_metadata="..."
           → GET /.well-known/oauth-protected-resource/mcp
           ← { authorization_servers: ["https://AUTH0_DOMAIN/"] }
           → Auth0 OIDC discovery / CIMD / PKCE フロー
           ← access_token（audience = https://mcp.wealthvision.local）
           → GET /mcp + Bearer <MCP token>
           → requireBearerAuth が MCP トークンを検証
           → tool 呼び出し時に OboExchanger.getToken() で API トークンへ交換
           → 各マイクロサービスを API トークンで呼び出し
```

## OBO Token Exchange 実装

`src/auth/obo.ts` の `OboExchanger`:
- `@auth0/auth0-api-js` の `ApiClient.getTokenOnBehalfOf()` を使用
- `(sub, scope)` をキーにしてメモリキャッシュ（有効期限 -30 秒でリフレッシュ）
- MCP トークンと API トークンの audience が異なるため、MCP 仕様のトークンパススルー禁止に準拠
- OBO に渡す `scope` はハードコードせず、`getToken(token, scopes)` の呼び出し元（各ツールハンドラー）が MCP トークンの `authInfo.scopes`（= ユーザーが同意した範囲）を都度渡す。ユーザーが許可していないスコープを下流 API に渡さないための設計

`src/auth/verifier.ts` の `Auth0TokenVerifier`:
- 同じ `ApiClient` を使って MCP トークンの JWT 検証

## Auth0 設定（Custom API Client）

| 設定 | 値 |
|---|---|
| API 登録 | `http://localhost:4005/mcp`（新規作成） |
| Custom API Client 作成 | MCP API 設定画面 > Add Application |
| `app_type` | `resource_server` |
| `resource_server_identifier` | `http://localhost:4005/mcp` |
| OBO 有効化 | Token Exchange > On-Behalf-Of Token Exchange: ON |
| User-Delegated Grant | audience=`https://api.wealthvision.local`、subject_type=user、全スコープ |

## resource フィールドの一貫性要件

MCP クライアント（mcp-remote、VS Code 等）は `resource` パラメータが接続 URL と一致することを強制する。そのため以下5箇所すべてが一致していなければならない：

```
mcp-remote が送る resource           = http://localhost:4005/mcp  （接続 URL と同一）
protectedResourceMetadata.resource   = http://localhost:4005/mcp  （mcpBaseUrl/mcp）
Auth0 の API identifier              = http://localhost:4005/mcp  （Dashboard 登録）
JWT の aud クレーム                   = http://localhost:4005/mcp  （発行されるトークン）
AUTH0_AUDIENCE（.env）               = http://localhost:4005/mcp
```

`https://mcp.wealthvision.local` のような意味のある URI を audience にすると、mcp-remote が "Protected resource does not match expected URL" エラーを返す。ローカル開発では接続 URL をそのまま Auth0 の API identifier として登録することで解決する。

## Client ID Metadata Document

CIMD は Auth0 側の機能。MCP Client が自分の HTTPS URL を `client_id` として Auth0 に送ると、Auth0 がその URL からメタデータを取得してクライアントを検証する。mcp-service 側の変更は不要。

## MCP ツール

| ツール | 必要スコープ | 説明 |
|---|---|---|
| `list_assets` | `read:assets` | 銘柄一覧と現在価格 |
| `get_portfolio` | `read:holdings` `read:users` `read:assets` | 保有銘柄と現金残高 |
| `get_price_history` | `read:assets` | 銘柄の価格履歴 |
| `get_transactions` | `read:transactions` | 取引履歴 |
| `execute_trade` | `execute:trades` | 売買実行 |

スコープの検査は MCP トークン（`extra.authInfo.scopes`）で行い、実際の API 呼び出しは OBO 後の API トークンで行う。

## 環境変数（services/mcp/.env）

```
AUTH0_DOMAIN=         # Auth0 テナントドメイン
AUTH0_AUDIENCE=       # MCP Server の audience（接続 URL と一致させる。例: http://localhost:4005/mcp）
MCP_CLIENT_ID=        # Custom API Client の client_id
MCP_CLIENT_SECRET=    # Custom API Client の client_secret
API_AUDIENCE=         # ダウンストリーム API の audience（https://api.wealthvision.local）
MCP_BASE_URL=         # MCP サーバーの公開 URL（例: http://localhost:4005）
```

## MCP クライアント接続（2025年7月時点）

| クライアント | 接続方法 | CIMD | DCR | 備考 |
|---|---|---|---|---|
| Claude Code（CLI） | HTTP MCP | ○ | ○ | 企業管理環境では `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` で HTTP MCP 無効になる場合あり |
| Claude Desktop | mcp-remote（stdio） | × | ○ | `{"type":"http","url":"..."}` 形式は非対応。mcp-remote stdio 経由のみ動作 |
| VS Code + Copilot | HTTP（native） | ○ | ○ | `.vscode/mcp.json` の `oauth.clientId` で CIMD 設定可能 |

CIMD（Client ID Metadata Document）は Auth0 側では対応済みだが、クライアント側の実装がまだ少ない。現時点でデモするなら **Claude Desktop + mcp-remote + DCR** が最も確実。

### Claude Desktop + mcp-remote 設定（推奨）

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wealthvision_local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:4005/mcp"]
    }
  }
}
```

mcp-remote は初回起動時に Auth0 で DCR を実行してトークンを取得し、`~/.mcp-auth/` にキャッシュする。Auth0 側でクライアントを削除した場合はキャッシュも削除すること：

```bash
rm -rf ~/.mcp-auth/
```

## デモ用トークンビューア

MCP トークンと OBO 交換後の API トークンを画面で見比べられるようにした（audience や scope の違い、トークンパススルーでないことを可視化する目的）。

- **バックエンド**: `services/mcp/src/debug/store.ts` が `OboExchanger.getToken()` 呼び出しごとに MCP トークン / API トークンをデコードしてメモリに保持（最大30件）。`GET /debug/tokens` で取得。`ENABLE_TOKEN_DEBUG=false` で無効化可能
- **フロントエンド**: `src/app/api/mcp-debug/route.ts`（ログイン必須のプロキシ）→ `src/app/dashboard/mcp-debug/page.tsx`（3秒ごとポーリング、`aud`/`sub`/`scope`/`act`/`exp` を整形表示、生JWTは折りたたみ + コピーボタンで全文コピー可能）
- サイドバーの「MCPトークン」からアクセス

### OBO スコープは動的（ハードコードしない）

`OboExchanger.getToken(token, scopes, toolName)` の `scopes` は呼び出し元の各ツールハンドラーが `extra.authInfo.scopes`（MCP トークンに実際に付与されていたスコープ = ユーザーが同意した範囲）を渡す。`toolName` はトークンビューアで「どのツール呼び出しか」を表示するためのラベル。

### 同意画面での Permission 表示に関する既知の論点

現状 MCP Server API（`https://mcp.wealthvision.local` または接続URL）自体には Permission を1つも定義していない。この場合、Auth0 の同意画面にユーザーが許可する内容が人間が読める形で表示されない可能性がある（scope名がそのまま出るか、何も出ないかは未検証）。

対応案: MCP Server API 側にも `read:assets` 等と同名の Permission を description 付きで定義する。ダウンストリームの WealthVision API の Permission（OBO の User-Delegated Grant で使用）とは役割が異なり、両方に同名スコープを定義することになるが、これは MCP のトークン構造上自然な重複。**未実装、対応するかは未決定。**

# 開発上の注意

- `src/lib/prisma.ts` は残してあるが使用していない（後で削除予定）
- Next.js からの直接 DB アクセスはゼロ。すべてマイクロサービス経由
- `src/app/actions/trade.ts` が売買の唯一のエントリポイント（Server Action）
