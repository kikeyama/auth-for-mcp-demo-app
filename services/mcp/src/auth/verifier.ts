import { ApiClient } from '@auth0/auth0-api-js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export class Auth0TokenVerifier implements OAuthTokenVerifier {
  constructor(private readonly apiClient: ApiClient) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const claims = await this.apiClient.verifyAccessToken({ accessToken: token });

    const scopes = ((claims.scope as string | undefined) ?? '').split(' ').filter(Boolean);

    return {
      token,
      clientId: (claims.azp as string | undefined) ?? (claims.sub as string) ?? '',
      scopes,
      expiresAt: claims.exp,
    };
  }
}
