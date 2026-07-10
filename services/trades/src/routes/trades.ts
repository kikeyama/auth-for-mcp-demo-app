import { Router, Request, Response } from 'express';
import { requiredScopes } from 'express-oauth2-jwt-bearer';
import { createId } from '@paralleldrive/cuid2';
import { pool } from '../db.js';
import { checkJwt } from '../middleware/auth.js';

const router = Router();

router.use(checkJwt);

const scopes = {
  execute: requiredScopes('execute:trades'),
};

router.post('/', scopes.execute, async (req: Request, res: Response) => {
  const auth0Id: string | undefined = req.auth?.payload.sub;

  const { assetId, type, quantity } = req.body as {
    assetId?: unknown;
    type?: unknown;
    quantity?: unknown;
  };

  // Validation
  if (!assetId || !type || quantity === undefined || quantity === null) {
    res.status(400).json({ error: 'assetId, type, and quantity are required' });
    return;
  }
  if (type !== 'BUY' && type !== 'SELL') {
    res.status(400).json({ error: 'type must be BUY or SELL' });
    return;
  }
  if (typeof quantity !== 'number' || quantity <= 0) {
    res.status(400).json({ error: 'quantity must be a positive number' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Get user by auth0_id with row lock
    const userResult = await client.query<{ id: string; cash_balance: string }>(
      'SELECT id, cash_balance FROM users WHERE auth0_id = $1 FOR UPDATE',
      [auth0Id]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = userResult.rows[0];
    const cashBalance = parseFloat(user.cash_balance);

    // Step 2: Get asset
    const assetResult = await client.query<{ currency: string; current_price: string }>(
      'SELECT currency, current_price FROM assets WHERE id = $1',
      [assetId]
    );
    if (assetResult.rows.length === 0) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const asset = assetResult.rows[0];
    const price = parseFloat(asset.current_price);

    // Step 3: FX rate if asset currency is USD
    let fxRate = 1;
    if (asset.currency === 'USD') {
      const fxResult = await client.query<{ current_price: string }>(
        "SELECT current_price FROM assets WHERE symbol = 'USD/JPY'"
      );
      fxRate = fxResult.rows.length > 0 ? parseFloat(fxResult.rows[0].current_price) : 150;
    }

    // Step 4: Calculate total
    const total = price * (quantity as number) * fxRate;

    // Step 5: Get existing holding with row lock
    const holdingResult = await client.query<{ id: string; quantity: string; avg_cost: string }>(
      'SELECT id, quantity, avg_cost FROM holdings WHERE user_id = $1 AND asset_id = $2 FOR UPDATE',
      [user.id, assetId]
    );
    const existingHolding = holdingResult.rows[0] ?? null;

    if (type === 'BUY') {
      // Step 6: BUY logic
      if (total > cashBalance) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: 'Insufficient cash balance' });
        return;
      }

      // Update user cash balance
      await client.query(
        'UPDATE users SET cash_balance = $1, updated_at = NOW() WHERE id = $2',
        [cashBalance - total, user.id]
      );

      let newQty: number;
      if (existingHolding) {
        const currentHeld = parseFloat(existingHolding.quantity);
        const existingAvgCost = parseFloat(existingHolding.avg_cost);
        newQty = currentHeld + (quantity as number);
        const newAvgCost = (existingAvgCost * currentHeld + price * (quantity as number)) / newQty;

        await client.query(
          'UPDATE holdings SET quantity = $1, avg_cost = $2, updated_at = NOW() WHERE id = $3',
          [newQty, newAvgCost, existingHolding.id]
        );
      } else {
        newQty = quantity as number;

        await client.query(
          'INSERT INTO holdings (id, user_id, asset_id, quantity, avg_cost, created_at, updated_at) VALUES ($5, $1, $2, $3, $4, NOW(), NOW())',
          [user.id, assetId, quantity, price, createId()]
        );
      }

      // Insert transaction record
      await client.query(
        "INSERT INTO transactions (id, user_id, asset_id, type, quantity, price, total, created_at) VALUES ($6, $1, $2, 'BUY', $3, $4, $5, NOW())",
        [user.id, assetId, quantity, price, total, createId()]
      );

      await client.query('COMMIT');
      res.json({ cashBalance: cashBalance - total, held: newQty });

    } else {
      // Step 7: SELL logic
      if (!existingHolding) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: 'No holding found for this asset' });
        return;
      }

      const currentHeld = parseFloat(existingHolding.quantity);
      if ((quantity as number) > currentHeld) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(400).json({ error: 'Insufficient holdings quantity' });
        return;
      }

      const newQty = currentHeld - (quantity as number);
      const newCash = cashBalance + total;

      // Update user cash balance
      await client.query(
        'UPDATE users SET cash_balance = $1, updated_at = NOW() WHERE id = $2',
        [newCash, user.id]
      );

      // Update or delete holding
      if (newQty === 0) {
        await client.query('DELETE FROM holdings WHERE id = $1', [existingHolding.id]);
      } else {
        await client.query(
          'UPDATE holdings SET quantity = $1, updated_at = NOW() WHERE id = $2',
          [newQty, existingHolding.id]
        );
      }

      // Insert transaction record
      await client.query(
        "INSERT INTO transactions (id, user_id, asset_id, type, quantity, price, total, created_at) VALUES ($6, $1, $2, 'SELL', $3, $4, $5, NOW())",
        [user.id, assetId, quantity, price, total, createId()]
      );

      await client.query('COMMIT');
      res.json({ cashBalance: newCash, held: newQty });
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[trades-service] DB error', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
