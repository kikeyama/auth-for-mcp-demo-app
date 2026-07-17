import { ApiClient } from '@auth0/auth0-api-js';
import { recordExchange } from '../debug/store.js';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix seconds
}

export class OboExchanger {
  // キー: `${sub}:${scope}` → キャッシュされた下流APIトークン
  private readonly cache = new Map<string, CachedToken>();

  constructor(
    private readonly apiClient: ApiClient,
    private readonly downstreamAudience: string,
  ) {}

  // scopes: MCP トークンに付与されていたスコープ（extra.authInfo.scopes）。
  // ユーザーが同意した範囲だけを OBO で下流 API トークンへ引き継ぐ。
  // toolName: デモ用トークンビューア（/debug/tokens）に表示するための呼び出し元ツール名
  async getToken(incomingToken: string, scopes: string[], toolName: string): Promise<string> {
    const sub = extractSub(incomingToken);
    const scope = scopes.join(' ');
    const cacheKey = `${sub}:${scope}`;

    const cached = this.cache.get(cacheKey);
    // 有効期限まで 30 秒以上あればキャッシュを返す
    if (cached && cached.expiresAt > Math.floor(Date.now() / 1000) + 30) {
      recordExchange(toolName, incomingToken, cached.accessToken, true);
      return cached.accessToken;
    }

    const result = await this.apiClient.getTokenOnBehalfOf(incomingToken, {
      audience: this.downstreamAudience,
      // 空文字列を渡すと Auth0 が意図しない解釈をする可能性があるため、
      // スコープが無い場合はパラメータ自体を省略する
      ...(scope && { scope }),
    });

    this.cache.set(cacheKey, {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
    });

    recordExchange(toolName, incomingToken, result.accessToken, false);
    return result.accessToken;
  }
}

function extractSub(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub?: string };
    return payload.sub ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
