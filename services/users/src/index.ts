import 'dotenv/config';
import express from 'express';
import usersRouter from './routes/users.js';

const app = express();
const port = Number(process.env.PORT ?? 4002);

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/users', usersRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === 'object' && 'status' in err) {
    const e = err as { status: number; code?: string; message?: string };
    if (e.status === 401) {
      res.status(401).json({ error: 'Unauthorized', code: e.code });
      return;
    }
    if (e.status === 403) {
      res.status(403).json({ error: 'Forbidden', code: e.code });
      return;
    }
  }
  console.error('[users-service] unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`users-service listening on port ${port}`);
});
