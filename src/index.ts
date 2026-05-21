import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import accountsRoutes from './modules/accounts/accounts.routes';
import filesRoutes from './modules/files/files.routes';
import storageRoutes from './modules/storage/storage.routes';
import cdnRoutes from './modules/cdn/cdn.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import foldersRoutes from './modules/folders/folders.routes';
import prisma from './database';

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard (web UI)
app.use('/dashboard', dashboardRoutes);

// Redirect root to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// API Routes
app.use('/api/accounts', accountsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/storage', storageRoutes);

// CDN Routes (includes both public and management routes)
app.use('/', cdnRoutes);

// Generate API Key endpoint (for initial setup)
app.post('/api/setup/generate-key', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Check if any keys exist
    const existingKeys = await prisma.apiKey.count();

    // If keys exist, require auth
    if (existingKeys > 0) {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({ error: 'API key required. Use X-API-Key header.' });
        return;
      }

      const keyHash = crypto
        .createHmac('sha256', config.apiKeySecret)
        .update(apiKey)
        .digest('hex');

      const keyRecord = await prisma.apiKey.findUnique({ where: { keyHash } });
      if (!keyRecord || !keyRecord.isActive) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
    }

    // Generate new API key
    const rawKey = `gdagg_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto
      .createHmac('sha256', config.apiKeySecret)
      .update(rawKey)
      .digest('hex');

    await prisma.apiKey.create({
      data: {
        keyHash,
        name,
        permissions: JSON.stringify(['*']),
        isActive: true,
      },
    });

    res.status(201).json({
      data: {
        apiKey: rawKey,
        name,
        message: 'Store this API key securely. It cannot be retrieved again.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`🚀 Google Drive Aggregator API running on port ${config.port}`);
  console.log(`   Dashboard: http://localhost:${config.port}/dashboard`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
  console.log(`   API docs: See README.md for endpoint documentation`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
