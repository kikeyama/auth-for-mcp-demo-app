import { createId } from '@paralleldrive/cuid2';
import { pool } from './db.js';

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Returns a random multiplier simulating price movement.
// Non-FX assets have a 5% chance of a large swing (±5–10%).
// All assets otherwise move ±0–2%.
function nextMultiplier(type: string): number {
  const isLargeSwing = type !== 'FX' && Math.random() < 0.05;

  if (isLargeSwing) {
    const magnitude = 0.05 + Math.random() * 0.05; // 5–10%
    const sign = Math.random() < 0.5 ? 1 : -1;
    return 1 + sign * magnitude;
  }

  const magnitude = Math.random() * 0.02; // 0–2%
  const sign = Math.random() < 0.5 ? 1 : -1;
  return 1 + sign * magnitude;
}

async function tick() {
  try {
    const { rows } = await pool.query<{ id: string; type: string; current_price: string }>(
      'SELECT id, type, current_price FROM assets'
    );

    const updates = rows.map((row) => ({
      id: row.id,
      price: Math.max(0.0001, Number(row.current_price) * nextMultiplier(row.type)),
    }));

    await Promise.all(
      updates.flatMap(({ id, price }) => [
        pool.query(
          'UPDATE assets SET current_price = $1, price_updated_at = NOW() WHERE id = $2',
          [price, id]
        ),
        pool.query(
          "INSERT INTO asset_prices (id, asset_id, price) VALUES ($1, $2, $3)",
          [createId(), id, price]
        ),
      ])
    );

    console.log(`[priceTicker] updated ${updates.length} assets`);
  } catch (err) {
    console.error('[priceTicker] error:', err instanceof Error ? err.message : err);
  }
}

export function startPriceTicker() {
  // Run immediately on startup, then on the interval.
  tick();
  setInterval(tick, INTERVAL_MS);
  console.log(`[priceTicker] started (interval: ${INTERVAL_MS / 1000}s)`);
}
