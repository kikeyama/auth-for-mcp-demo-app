# WealthVision MCP Server

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) を実装したサーバー。
Claude Desktop 等の MCP クライアントから WealthVision の資産管理機能をツールとして呼び出せる。

## アーキテクチャ

```
MCP Client (Claude Desktop 等)
    │  Bearer token (audience: https://mcp.wealthvision.local)
    ▼
MCP Server (port 4005)           ← この service
    │  OBO Token Exchange
    ▼
Auth0                            ← API token 発行 (audience: https://api.wealthvision.local)
    │
    ▼
Microservices (ports 4001-4004)  ← API token で呼び出し
```

### トークンの流れ

| 区間 | トークン | Audience |
|---|---|---|
| MCP Client → MCP Server | MCP トークン | `http://localhost:4005/mcp` |
| MCP Server → microservices | API トークン（OBO 交換後） | `https://api.wealthvision.local` |

MCP 仕様（[Authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)）はトークンのパススルーを禁止しているため、On-Behalf-Of Token Exchange（RFC 8693）で別トークンに交換してからマイクロサービスを呼び出す。

## MCP ツール一覧

| ツール | 説明 | 必要スコープ |
|---|---|---|
| `list_assets` | 取引可能な銘柄の一覧と現在価格 | `read:assets` |
| `get_portfolio` | 保有銘柄と現金残高 | `read:holdings` `read:users` `read:assets` |
| `get_price_history` | 銘柄の価格履歴（最大7日分） | `read:assets` |
| `get_transactions` | 取引履歴 | `read:transactions` |
| `execute_trade` | 銘柄の購入・売却 | `execute:trades` |

## Auth0 設定

### 前提

- Auth0 テナントに WealthVision API（`https://api.wealthvision.local`）が登録済みであること
- Enterprise Basic 以上のプラン（OBO Token Exchange が利用可能）

### 1. MCP Server API を作成

Auth0 Dashboard → **Applications > APIs** → Create API

| 項目 | 値 |
|---|---|
| Name | WealthVision MCP API |
| Identifier | `http://localhost:4005/mcp`（接続 URL と完全一致させること） |
| Allow Offline Access | OFF（MCP トークンはリフレッシュ不要） |

> **重要**: Identifier（= `AUTH0_AUDIENCE`）は MCP クライアントが接続する URL と完全一致する必要がある。mcp-remote や VS Code は `resource` パラメータが接続 URL と一致しない場合にエラーを返す。

### 2. Custom API Client を作成

作成した MCP API の設定画面を開き **Add Application** をクリック。

| 項目 | 値 |
|---|---|
| Name | WealthVision MCP Client |
| Application Type | Custom API Client（自動設定） |

作成後、Application の設定画面で確認できる `Client ID` と `Client Secret` を `.env` に設定する。

### 3. OBO Token Exchange を有効化

Application 設定 → **Token Exchange** セクション → **On-Behalf-Of Token Exchange** をトグル ON → Save

Management API で行う場合：

```bash
curl -X PATCH "https://YOUR_DOMAIN/api/v2/clients/YOUR_MCP_CLIENT_ID" \
  -H "Authorization: Bearer YOUR_MGMT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token_exchange": {"allow_any_profile_of_type": ["on_behalf_of_token_exchange"]}}'
```

### 4. User-Delegated Client Grant を作成

MCP Client が WealthVision API を代理で呼べるよう権限を付与する。

Application 設定 → **API Access** → WealthVision API を選択 → **Edit** → **User-Delegated Access** で以下のスコープを有効化：

```
read:assets
read:holdings
read:transactions
read:users
execute:trades
```

Management API で行う場合：

```bash
curl -X POST "https://YOUR_DOMAIN/api/v2/client-grants" \
  -H "Authorization: Bearer YOUR_MGMT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_MCP_CLIENT_ID",
    "audience": "https://api.wealthvision.local",
    "scope": ["read:assets","read:holdings","read:transactions","read:users","execute:trades"],
    "subject_type": "user"
  }'
```

### 5. MCP Client の登録と接続

MCP クライアントは CIMD または DCR で Auth0 に登録する。

#### CIMD サポート状況（2025年7月時点）

CIMD（Client ID Metadata Document）は Auth0 側では対応済みだが、クライアント側の実装がまだ少ない。現時点では **Claude Desktop + mcp-remote + DCR** が最も確実に動作する構成。

| クライアント | CIMD | DCR | 備考 |
|---|---|---|---|
| Claude Code（CLI） | ○ | ○ | 企業管理環境では HTTP MCP が無効の場合あり |
| Claude Desktop | × | ○ | native HTTP 形式非対応。mcp-remote stdio 経由のみ |
| VS Code + Copilot | ○ | ○ | `.vscode/mcp.json` の `oauth.clientId` で設定 |

---

#### Claude Code

**CIMD を使う場合（Auth0 が CIMD をサポートしている場合）**

Auth0 の AS メタデータに `client_id_metadata_document_supported: true` があれば、Claude Code は自動的に CIMD フローを使う。Claude Code の CIMD メタデータ URL は以下のとおりで、これが `client_id` として Auth0 に送信される：

```
https://claude.ai/oauth/claude-code-client-metadata
```

Auth0 側の追加設定は不要。サーバーを追加するだけで Claude Code が自動検出する。

```bash
# MCP サーバーを登録（CIMD / DCR を自動選択）
claude mcp add --transport http wealthvision http://localhost:4005/mcp

# 認証（ブラウザが開く）
claude mcp login wealthvision
# または Claude Code セッション内で /mcp を実行
```

**DCR または事前登録を使う場合**

Auth0 が CIMD をサポートしていない場合、またはコールバックポートを固定したい場合：

```bash
# コールバックポートを固定して DCR（Auth0 側への事前登録不要）
claude mcp add --transport http --callback-port 8080 wealthvision http://localhost:4005/mcp

# 事前登録済みの client_id を使う場合
claude mcp add --transport http \
  --client-id YOUR_CLIENT_ID --client-secret --callback-port 8080 \
  wealthvision http://localhost:4005/mcp
```

コールバック固定の場合は Auth0 の Allowed Callback URLs に `http://localhost:8080/callback` を追加しておく。

**設定ファイル（`.mcp.json` または `~/.claude.json`）で管理する場合**

```json
{
  "mcpServers": {
    "wealthvision": {
      "type": "http",
      "url": "http://localhost:4005/mcp",
      "oauth": {
        "callbackPort": 8080
      }
    }
  }
}
```

---

#### Claude Desktop

Claude Desktop は `{"type":"http","url":"..."}` 形式の HTTP MCP 接続を現時点でサポートしていない。**mcp-remote を stdio プロキシとして使う**。

設定ファイルを編集する：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wealthvision": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:4005/mcp"]
    }
  }
}
```

mcp-remote が初回起動時に Auth0 で DCR を実行し、`~/.mcp-auth/` にトークンをキャッシュする。Auth0 側でクライアントを削除した場合はキャッシュも削除する：

```bash
rm -rf ~/.mcp-auth/
```

---

#### Auth0 に CIMD サポートがない場合の事前登録（共通）

Auth0 が CIMD / DCR をサポートしていない場合は、Auth0 Dashboard で SPA または Regular Web Application を手動作成し、以下を設定する：

| 項目 | Claude Code | Claude Desktop |
|---|---|---|
| Application Type | SPA（Public Client） | Regular Web Application |
| Allowed Callback URLs | `http://localhost/callback`（ポートワイルドカード） | `https://claude.ai/api/mcp/auth_callback` |

作成した `client_id` を上記の `--client-id` オプションまたは設定ファイルの `oauth.clientId` に指定する。

## 環境変数

`.env` ファイルを作成して以下を設定：

```env
# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=http://localhost:4005/mcp          # 接続 URL と一致させること（Step 1 の Identifier）
MCP_CLIENT_ID=your_custom_api_client_id           # Step 2 で取得
MCP_CLIENT_SECRET=your_custom_api_client_secret   # Step 2 で取得
API_AUDIENCE=https://api.wealthvision.local       # OBO 交換先

# Server
MCP_BASE_URL=http://localhost:4005
PORT=4005

# デモ用トークンビューア（/debug/tokens）。false で無効化
ENABLE_TOKEN_DEBUG=true

# Microservices
ASSETS_API_URL=http://localhost:4003
USERS_API_URL=http://localhost:4002
TRADES_API_URL=http://localhost:4004
TRANSACTIONS_API_URL=http://localhost:4001
```

## 起動

```bash
# 単体起動
npm run dev

# 全サービス起動（プロジェクトルートから）
npm run dev
```

## エンドポイント

| パス | 説明 |
|---|---|
| `POST /mcp` | MCP Streamable HTTP エンドポイント（要 Bearer token） |
| `GET /mcp` | SSE セッション用（要 Bearer token） |
| `DELETE /mcp` | セッション終了（要 Bearer token） |
| `GET /.well-known/oauth-protected-resource/mcp` | RFC 9728 Protected Resource Metadata |
| `GET /.well-known/oauth-protected-resource` | 同上（fallback） |
| `GET /health` | ヘルスチェック |
| `GET /debug/tokens` | デモ用トークンビューア。直近のツール呼び出しで使われた MCP トークン / API トークンをデコードして返す（`ENABLE_TOKEN_DEBUG=false` で無効化） |

## デモ用トークンビューア

MCP トークン（MCP Client → MCP Server）と OBO 交換後の API トークン（MCP Server → microservices）を並べて確認できる画面を Next.js 側に用意している。

- **画面**: `/dashboard/mcp-debug`（サイドバーの「MCPトークン」からアクセス）
- **仕組み**: `services/mcp/src/debug/store.ts` が `OboExchanger.getToken()` 呼び出しごとに MCP トークンと API トークンをデコードしてメモリに保持（最大30件）。Next.js の `/api/mcp-debug` がこれをプロキシし、画面が3秒おとにポーリングして表示する。
- **表示内容**: 各トークンの `aud` / `sub` / `scope` / `act`（委任チェーン）/ `exp` と生JWT（折りたたみ表示）。audience の違いと scope の絞り込みが一目で分かる。
- **無効化**: `.env` に `ENABLE_TOKEN_DEBUG=false` を設定するとエンドポイント自体が登録されない（本番相当の環境で誤って有効化しないための安全弁）。

## 認可フロー詳細（MCP spec 準拠）

1. MCP Client が `/mcp` を呼び出す（トークンなし）
2. MCP Server が `401` + `WWW-Authenticate: Bearer resource_metadata="http://localhost:4005/.well-known/oauth-protected-resource/mcp"` を返す
3. MCP Client が Protected Resource Metadata を取得 → `authorization_servers: ["https://YOUR_AUTH0_DOMAIN/"]` を発見
4. MCP Client が Auth0 の OIDC discovery を取得
5. MCP Client が Auth0 で PKCE + CIMD/DCR/pre-registration フローで認証
6. MCP Client が MCP トークン（audience=`https://mcp.wealthvision.local`）を取得
7. MCP Client が Bearer token 付きで `/mcp` を呼び出す
8. MCP Server が `@auth0/auth0-api-js` の `ApiClient.verifyAccessToken()` でトークンを検証
9. ツール呼び出し時に `OboExchanger.getTokenOnBehalfOf()` で API トークン（audience=`https://api.wealthvision.local`）へ交換
10. API トークンでマイクロサービスを呼び出し

## 依存パッケージ

| パッケージ | 用途 |
|---|---|
| `@modelcontextprotocol/sdk` | MCP Server / Streamable HTTP Transport / Bearer auth middleware |
| `@auth0/auth0-api-js` | JWT 検証 + OBO Token Exchange |
| `express` | HTTP サーバー |
| `dotenv` | 環境変数 |
