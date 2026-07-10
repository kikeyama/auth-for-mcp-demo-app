import 'dotenv/config';
import express from 'express';
import transactionsRouter from './routes/transactions.js';

const app = express();
const port = Number(process.env.PORT) || 4001;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/transactions', transactionsRouter);

// express-oauth2-jwt-bearer error handler
app.use((err: Error & { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
