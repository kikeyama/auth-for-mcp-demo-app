"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// All routes require a valid Auth0 access token
router.use(auth_js_1.checkJwt);
/**
 * GET /transactions
 * Returns the authenticated user's transaction history.
 * Query params: limit (default 100), offset (default 0)
 */
router.get('/', async (req, res) => {
    const sub = req.auth?.payload.sub;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    try {
        const userResult = await db_js_1.pool.query('SELECT id FROM users WHERE auth0_id = $1', [sub]);
        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const userId = userResult.rows[0].id;
        const [txResult, countResult] = await Promise.all([
            db_js_1.pool.query(`SELECT
           t.id, t.type, t.quantity, t.price, t.total, t.created_at,
           a.symbol AS asset_symbol, a.name AS asset_name, a.currency AS asset_currency
         FROM transactions t
         JOIN assets a ON a.id = t.asset_id
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`, [userId, limit, offset]),
            db_js_1.pool.query('SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1', [userId]),
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
    }
    catch (err) {
        console.error('[transactions] GET /', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * GET /transactions/:id
 * Returns a single transaction by ID, scoped to the authenticated user.
 */
router.get('/:id', async (req, res) => {
    const sub = req.auth?.payload.sub;
    const { id } = req.params;
    try {
        const result = await db_js_1.pool.query(`SELECT
         t.id, t.type, t.quantity, t.price, t.total, t.created_at,
         a.symbol AS asset_symbol, a.name AS asset_name, a.currency AS asset_currency
       FROM transactions t
       JOIN assets a ON a.id = t.asset_id
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1 AND u.auth0_id = $2`, [id, sub]);
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
    }
    catch (err) {
        console.error('[transactions] GET /:id', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
