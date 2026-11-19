import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { publicRouter } from './src/server/routes-public.ts';
import { customerRouter } from './src/server/routes-customer.ts';
import { adminRouter } from './src/server/routes-admin.ts';
import { realtimeHub } from './src/server/realtime.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '5mb' }));

  // Serve uploaded product images safely
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'just-burger' });
  });

  // Mount API routes
  app.use('/api', publicRouter);
  app.use('/api', customerRouter);
  app.use('/api', adminRouter);

  // Attach WebSocket real-time hub on port 3000
  realtimeHub.attach(server);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`JUST BURGER server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start JUST BURGER server:', err);
  process.exit(1);
});
