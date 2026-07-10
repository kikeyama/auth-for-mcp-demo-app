import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  secret: process.env.AUTH0_SECRET!,
  appBaseUrl: process.env.APP_BASE_URL!,
  // Required to issue JWT access tokens for microservices.
  // Register an API in Auth0 Dashboard and set AUTH0_AUDIENCE to its identifier.
  ...(process.env.AUTH0_AUDIENCE && {
    authorizationParameters: {
      audience: process.env.AUTH0_AUDIENCE,
      scope: 'openid profile email offline_access create:users read:users read:holdings read:transactions read:assets execute:trades',
    },
  }),
});
