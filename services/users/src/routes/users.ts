import { Router, Request, Response } from 'express';
import { requiredScopes } from 'express-oauth2-jwt-bearer';
import { createId } from '@paralleldrive/cuid2';
import { pool } from '../db.js';
import { checkJwt } from '../middleware/auth.js';

const router = Router();

router.use(checkJwt);

const scopes = {
  create: requiredScopes('create:users'),
  readUser: requiredScopes('read:users'),
  readHoldings: requiredScopes('read:holdings'),
};

/**
 * POST /users/sync
 * Upsert the authenticated user from their Auth0 profile claims.
 * Called on every dashboard load to keep the local record fresh.
 */
router.post('/sync', scopes.create, async (req: Request, res: Response) => {
  const sub = req.auth?.payload.sub as string;
  const { email, name, picture } = req.body as {
    email?: string;
    name?: string;
    picture?: string;
  };

  try {
    const result = await pool.query(
      `INSERT INTO users (id, auth0_id, email, name, picture, cash_balance, created_at, updated_at)
       VALUES ($5, $1, $2, $3, $4, 10000000, NOW(), NOW())
       ON CONFLICT (auth0_id) DO UPDATE
         SET email      = EXCLUDED.email,
             name       = EXCLUDED.name,
             picture    = EXCLUDED.picture,
             updated_at = NOW()
       RETURNING id`,
      [sub, email ?? '', name ?? null, picture ?? null, createId()]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[users] POST /sync', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /users/me
 * Returns the authenticated user's profile and cash balance.
 */
router.get('/me', scopes.readUser, async (req: Request, res: Response) => {
  const sub = req.auth?.payload.sub as string;

  try {
    const result = await pool.query(
      `SELECT id, auth0_id, email, name, picture, cash_balance, created_at, updated_at
       FROM users WHERE auth0_id = $1`,
      [sub]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      email: row.email,
      name: row.name,
      picture: row.picture,
      cashBalance: Number(row.cash_balance),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[users] GET /me', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /users/me/holdings
 * Returns the authenticated user's holdings including asset details.
 */
router.get('/me/holdings', scopes.readHoldings, async (req: Request, res: Response) => {
  const sub = req.auth?.payload.sub as string;

  try {
    const userResult = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE auth0_id = $1',
      [sub]
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const userId = userResult.rows[0].id;

    const result = await pool.query(
      `SELECT
         h.id, h.quantity, h.avg_cost, h.updated_at,
         a.id AS asset_id, a.symbol, a.name AS asset_name,
         a.type AS asset_type, a.currency, a.current_price
       FROM holdings h
       JOIN assets a ON a.id = h.asset_id
       WHERE h.user_id = $1
       ORDER BY h.updated_at DESC`,
      [userId]
    );

    res.json({
      holdings: result.rows.map((row) => ({
        id: row.id,
        quantity: Number(row.quantity),
        avgCost: Number(row.avg_cost),
        updatedAt: row.updated_at,
        asset: {
          id: row.asset_id,
          symbol: row.symbol,
          name: row.asset_name,
          type: row.asset_type,
          currency: row.currency,
          currentPrice: Number(row.current_price),
        },
      })),
    });
  } catch (err) {
    console.error('[users] GET /me/holdings', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
