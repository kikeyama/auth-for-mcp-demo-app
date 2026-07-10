"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const transactions_js_1 = __importDefault(require("./routes/transactions.js"));
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 4001;
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/transactions', transactions_js_1.default);
// express-oauth2-jwt-bearer error handler
app.use((err, _req, res, _next) => {
    if (err.status === 401 || err.code === 'invalid_token' || err.code === 'missing_authorization_header') {
        res.status(401).json({ error: 'Unauthorized', message: err.message });
        return;
    }
    console.error('[server] unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(port, () => {
    console.log(`transactions-service listening on http://localhost:${port}`);
});
