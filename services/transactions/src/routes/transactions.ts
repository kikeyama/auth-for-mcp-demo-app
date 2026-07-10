import { Router, Request, Response } from 'express';
import { requiredScopes } from 'express-oauth2-jwt-bearer';
import { pool } from '../db.js';
import { checkJwt } from '../middleware/auth.js';

const router = Router();

router.use(checkJwt);

const scopes = {
  read: requiredScopes('read:transactions'),
};

/**
 * GET /transactions
 * Returns the authenticated user's transaction history.
 * Query params: limit (default 100), offset (default 0)
 */
router.get('/', scopes.read, async (req: Request, res: Response) => {
  const sub = req.auth?.payload.sub as string;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;

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

    const [txResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           t.id, t.type, t.quantity, t.price, t.total, t.created_at,
           a.symbol AS asset_symbol, a.name AS asset_name, a.currency AS asset_currency
         FROM transactions t
         JOIN assets a ON a.id = t.asset_id
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1',
        [userId]
      ),
    ]);

    res.json({
      data: txResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        quantity: Number(row.quantity),
        price: Number(row.price),
        total: Number(row.total),
        createdAt: row.created_at,
        asset: {
          symbol: row.asset_symbol,
          name: row.asset_name,
          currency: row.asset_currency,
        },
      })),
      total: Number(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[transactions] GET /', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /transactions/:id
 * Returns a single transaction by ID, scoped to the authenticated user.
 */
router.get('/:id', scopes.read, async (req: Request, res: Response) => {
  const sub = req.auth?.payload.sub as string;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         t.id, t.type, t.quantity, t.price, t.total, t.created_at,
         a.symbol AS asset_symbol, a.name AS asset_name, a.currency AS asset_currency
       FROM transactions t
       JOIN assets a ON a.id = t.asset_id
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1 AND u.auth0_id = $2`,
      [id, sub]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      type: row.type,
      quantity: Number(row.quantity),
      price: Number(row.price),
      total: Number(row.total),
      createdAt: row.created_at,
      asset: {
        symbol: row.asset_symbol,
        name: row.asset_name,
        currency: row.asset_currency,
      },
    });
  } catch (err) {
    console.error('[transactions] GET /:id', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
