import 'dotenv/config';
import express from 'express';
import assetsRouter from './routes/assets.js';
import { startPriceTicker } from './priceTicker.js';

const app = express();
const port = Number(process.env.PORT) || 4003;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/assets', assetsRouter);

// express-oauth2-jwt-bearer error handler
app.use((err: Error & { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.status === 401 || err.code === 'invalid_token' || err.code === 'missing_authorization_header') {
    res.status(401).json({ error: 'Unauthorized', message: err.message });
    return;
  }
  if (err.status === 403 || err.code === 'insufficient_scope') {
    res.status(403).json({ error: 'Forbidden', message: err.message });
    return;
  }
  console.error('[server] unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`assets-service listening on port ${port}`);
  startPriceTicker();
});
