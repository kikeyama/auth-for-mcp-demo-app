@AGENTS.md

# Architecture

Next.js 16 (App Router) フロントエンド + 4つの独立した Express マイクロサービス構成。Next.js はデータを直接 DB に書かず、すべてマイクロサービス経由でアクセスする。

```
Browser → Next.js (port 3000)
              ├── users-service    (port 4002)
              ├── assets-service   (port 4003)
              ├── trades-service   (port 4004)
              └── transactions-service (port 4001)
```

## サービス一覧

| サービス | ポート | スコープ | 主な役割 |
|---|---|---|---|
| transactions | 4001 | `read:transactions` | 取引履歴参照 |
| users | 4002 | `create:users` `read:users` `read:holdings` | ユーザー同期・保有資産 |
| assets | 4003 | `read:assets` | 銘柄・価格・履歴 |
| trades | 4004 | `execute:trades` | 売買実行（DB トランザクション） |

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

# 開発上の注意

- `src/lib/prisma.ts` は残してあるが使用していない（後で削除予定）
- Next.js からの直接 DB アクセスはゼロ。すべてマイクロサービス経由
- `src/app/actions/trade.ts` が売買の唯一のエントリポイント（Server Action）
