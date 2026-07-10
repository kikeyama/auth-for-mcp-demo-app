# WealthVision

Auth0 認証を使った資産管理デモアプリ。株式・FX・仮想通貨・ETF の模擬売買、ポートフォリオ管理、価格履歴グラフを備える。

## 機能

- **ダッシュボード** — 総資産・損益サマリー、最近の取引履歴
- **ポートフォリオ** — 保有銘柄の一覧と含み損益
- **取引画面** — 銘柄検索・フィルタ、売買モーダル、クリックで価格履歴グラフ表示
- **取引履歴** — 過去の売買履歴一覧
- **価格自動更新** — 1 時間ごとにランダム変動（通常 ±2%、まれに ±5〜10%）

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| 認証 | Auth0 (`@auth0/nextjs-auth0` v4) |
| マイクロサービス | Express.js + TypeScript × 4 |
| JWT 検証 | `express-oauth2-jwt-bearer` |
| DB | PostgreSQL 16 |
| スキーマ管理 | Prisma 7（マイグレーションのみ） |
| グラフ | Recharts |

## 前提条件

- Node.js 20+
- PostgreSQL 16（ローカルまたは Docker）
- Auth0 アカウント

## Auth0 セットアップ

### 1. Regular Web Application を作成

Auth0 Dashboard → Applications → Create Application → Regular Web Application

| 設定 | 値 |
|---|---|
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000` |
| Refresh Token Rotation | Enabled |
| Refresh Token Expiration | Absolute expiration |

### 2. API を作成

Auth0 Dashboard → Applications → APIs → Create API

| 設定 | 値 |
|---|---|
| Identifier (Audience) | `https://api.wealthvision.local` |
| Allow Offline Access | Enabled（リフレッシュトークン用） |

API の Permissions タブで以下のスコープを追加：

```
create:users
read:users
read:holdings
read:transactions
read:assets
execute:trades
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
npm install --prefix services/users
npm install --prefix services/assets
npm install --prefix services/trades
npm install --prefix services/transactions
```

### 2. 環境変数の設定

`.env.local` を作成：

```env
# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=<openssl rand -hex 32 で生成したランダム文字列>
AUTH0_AUDIENCE=https://api.wealthvision.local
APP_BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wealth_mgmt

# Microservices
TRANSACTIONS_API_URL=http://localhost:4001
USERS_API_URL=http://localhost:4002
ASSETS_API_URL=http://localhost:4003
TRADES_API_URL=http://localhost:4004
```

各マイクロサービスの `.env`（`services/<name>/.env`）にも設定：

```env
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.wealthvision.local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wealth_mgmt
PORT=4001  # サービスごとに 4001〜4004
```

### 3. データベースの準備

```bash
# DB 作成
createdb wealth_mgmt

# マイグレーション実行
npm run db:migrate

# 初期データ投入（銘柄マスタなど）
npm run db:seed
```

## 起動

```bash
npm run dev
```

Next.js（3000）と全マイクロサービス（4001〜4004）が同時に起動する。

個別起動する場合：

```bash
npm run dev:next                              # Next.js のみ
npm run dev --prefix services/users          # users-service のみ
npm run dev --prefix services/assets         # assets-service のみ
npm run dev --prefix services/trades         # trades-service のみ
npm run dev --prefix services/transactions   # transactions-service のみ
```

## マイクロサービス一覧

| サービス | ポート | 説明 |
|---|---|---|
| transactions-service | 4001 | 取引履歴の参照 |
| users-service | 4002 | ユーザー同期・保有資産管理 |
| assets-service | 4003 | 銘柄情報・価格・価格履歴 |
| trades-service | 4004 | 売買実行（原子的トランザクション） |

## DB 管理コマンド

```bash
npm run db:migrate   # マイグレーション作成・適用（開発）
npm run db:push      # スキーマを DB に直接反映（プロトタイプ用）
npm run db:seed      # 初期データ投入
npm run db:studio    # Prisma Studio（GUI でデータ確認）
```
