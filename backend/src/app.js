import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import apiRoutes from './routes/api.js';

const app = express();

const frontendOrigins = new Set([
  env.frontendUrl,
  env.frontendUrl.replace('localhost', '127.0.0.1'),
  env.frontendUrl.replace('127.0.0.1', 'localhost'),
]);

app.use(cors({
  origin: (origin, callback) => callback(null, !origin || frontendOrigins.has(origin)),
  credentials: true,
}));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'timetable-backend', timestamp: new Date().toISOString() });
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'Intelligent Timetable Generator API',
    status: 'running',
    version: '1.0.0',
  });
});

app.use('/api', apiRoutes);

app.use((err, _req, res, _next) => {
  console.error('Unhandled backend error:', err);

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
    },
  });
});

export default app;
