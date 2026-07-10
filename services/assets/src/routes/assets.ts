import { Router, Request, Response } from 'express';
import { requiredScopes } from 'express-oauth2-jwt-bearer';
import { pool } from '../db.js';
import { checkJwt } from '../middleware/auth.js';

const router = Router();

router.use(checkJwt);

const scopes = {
  read: requiredScopes('read:assets'),
};

/**
 * GET /assets/rates
 * Returns FX rates derived from assets where symbol matches '%/JPY'.
 * e.g. USD/JPY row → { USD: 155.5 }
 */
router.get('/rates', scopes.read, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<{ symbol: string; current_price: string }>(
      `SELECT symbol, current_price FROM assets WHERE symbol LIKE '%/JPY'`
    );

    const fxRates: Record<string, number> = {};
    for (const row of result.rows) {
      const baseCurrency = row.symbol.split('/')[0];
      fxRates[baseCurrency] = Number(row.current_price);
    }

    res.json(fxRates);
  } catch (err) {
    console.error('[assets] GET /rates', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /assets
 * Returns all assets sorted by type ASC, symbol ASC.
 * Also computes fxRates from FX assets (symbol LIKE '%/JPY').
 */
router.get('/', scopes.read, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, symbol, name, type, currency, current_price, price_updated_at
       FROM assets
       ORDER BY type ASC, symbol ASC`
    );

    const fxRates: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.symbol && row.symbol.includes('/JPY')) {
        const baseCurrency = row.symbol.split('/')[0];
        fxRates[baseCurrency] = Number(row.current_price);
      }
    }

    const assets = result.rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      type: row.type,
      currency: row.currency,
      currentPrice: Number(row.current_price),
    }));

    res.json({ assets, fxRates });
  } catch (err) {
    console.error('[assets] GET /', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /assets/:id/prices
 * Returns historical prices for an asset, newest first.
 * Query params: limit (default 168 = 7 days of hourly data)
 */
router.get('/:id/prices', scopes.read, async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 168, 720);

  try {
    const result = await pool.query<{ price: string; recorded_at: Date }>(
      `SELECT price, recorded_at
       FROM asset_prices
       WHERE asset_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [id, limit]
    );

    res.json({
      prices: result.rows.reverse().map((row) => ({
        price: Number(row.price),
        recordedAt: row.recorded_at,
      })),
    });
  } catch (err) {
    console.error('[assets] GET /:id/prices', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
