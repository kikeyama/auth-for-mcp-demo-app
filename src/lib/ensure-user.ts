import { auth0 } from './auth0';

export async function ensureUser(auth0User: { sub: string; email?: string; name?: string; picture?: string }) {
  const apiUrl = process.env.USERS_API_URL ?? 'http://localhost:4002';
  try {
    const { token } = await auth0.getAccessToken();
    await fetch(`${apiUrl}/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: auth0User.email,
        name: auth0User.name,
        picture: auth0User.picture,
      }),
      cache: 'no-store',
    });
  } catch (err) {
    console.warn(`[ensure-user] users-service に接続できません (${apiUrl}):`, err instanceof Error ? err.message : err);
  }
}
