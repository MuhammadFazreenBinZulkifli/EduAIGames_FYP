import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './queries.ts';
import { setupDatabase } from './setupDatabase.ts';
import authRoutes from './routes/auth.ts';
import coursesRoutes from './routes/courses.ts';
import quizRoutes from './routes/quizzes.ts';
import classesRoutes from './routes/classes.ts';
import classContentRoutes from './routes/classContent.ts';
import adminRoutes from './routes/admin.ts';
import gameRoutes from './routes/games.ts';
import chatRoutes from './routes/chat.ts';
import notificationRoutes from './routes/notifications.ts';
import { ensureGameTables } from './gameQueries.ts';
import { ensureNotificationTables } from './notificationQueries.ts';
import { ensureUserAccountStatusColumn } from './userAccountStatus.ts';
import { ensureAdminInfrastructure } from './adminInfrastructure.ts';
import { ensureAdminRoleAndUser } from './ensureAdmin.ts';
import { ensureSuperAdminRoleAndUser } from './ensureSuperAdmin.ts';
import superAdminRoutes from './routes/superAdmin.ts';
import profileRoutes from './routes/profile.ts';
import announcementRoutes from './routes/announcements.ts';
import { getPlatformFeatureFlags } from './platformFeatures.ts';
import { ensureInstitutionInfrastructure, resolveUserFeatures } from './institutionServices.ts';
import pool from './db.ts';
import {
  getCorsOrigins,
  IS_PRODUCTION,
  NODE_ENV,
  resolveFrontendDist,
  shouldServeFrontend,
} from './envConfig.ts';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const frontendDist = resolveFrontendDist();
const serveFrontend = shouldServeFrontend(frontendDist);
const corsOrigins = getCorsOrigins();

if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!IS_PRODUCTION) {
        callback(null, true);
        return;
      }

      if (serveFrontend) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/$/, '');
      if (corsOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '6mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/class-content', classContentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/classes', announcementRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'Server is running',
    environment: NODE_ENV,
    servesFrontend: serveFrontend,
  });
});

// Public feature flags (for UI gating). When a user id is supplied we resolve
// the flags against that user's institution plan + overrides; otherwise the
// platform-wide defaults are returned.
app.get('/api/platform/features', async (req, res) => {
  try {
    const rawUserId = req.query.user_id ?? req.headers['x-user-id'];
    const userIdValue = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    const userId = Number(userIdValue);
    const features = Number.isFinite(userId) && userId > 0
      ? await resolveUserFeatures(userId)
      : await getPlatformFeatureFlags();
    res.json({ features });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load feature flags' });
  }
});

// Database sanity check (disable in production unless explicitly enabled)
if (!IS_PRODUCTION || process.env.ENABLE_DB_CHECK === 'true') {
  app.get('/api/db-check', async (_req, res) => {
    try {
      const checks = [
        { key: 'users', query: 'SELECT COUNT(*)::int AS count FROM users' },
        { key: 'courses', query: 'SELECT COUNT(*)::int AS count FROM courses' },
        { key: 'student_enrollments', query: 'SELECT COUNT(*)::int AS count FROM student_enrollments' },
        { key: 'classes', query: 'SELECT COUNT(*)::int AS count FROM classes' },
        { key: 'class_memberships', query: 'SELECT COUNT(*)::int AS count FROM class_memberships' },
        { key: 'quizzes', query: 'SELECT COUNT(*)::int AS count FROM quizzes' },
        { key: 'questions', query: 'SELECT COUNT(*)::int AS count FROM questions' },
        { key: 'question_options', query: 'SELECT COUNT(*)::int AS count FROM question_options' },
        { key: 'student_quiz_attempts', query: 'SELECT COUNT(*)::int AS count FROM student_quiz_attempts' },
        { key: 'notifications', query: 'SELECT COUNT(*)::int AS count FROM notifications' },
      ] as const;

      const counts: Record<string, number> = {};
      for (const check of checks) {
        const result = await pool.query(check.query);
        counts[check.key] = (result.rows as any[])[0].count;
      }

      res.json({
        ok: true,
        message: 'Database check passed',
        counts,
        checkedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        message: 'Database check failed',
        error: error.message || 'Unknown database error',
      });
    }
  });
}

// Production: serve built React app from the same origin as /api
if (serveFrontend && frontendDist) {
  app.use(express.static(frontendDist, { index: false, maxAge: IS_PRODUCTION ? '1d' : 0 }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }

    res.status(404).send('Frontend build not found');
  });

  console.log(`Serving frontend from ${frontendDist}`);
} else if (IS_PRODUCTION) {
  console.warn(
    'Production mode: frontend dist not found. Build EduAIGames (npm run build) or set FRONTEND_DIST_PATH.'
  );
}

// Initialize database and start server
async function start() {
  try {
    if (process.env.SKIP_DB_SETUP === 'true') {
      console.log('Skipping database setup (SKIP_DB_SETUP=true)');
    } else {
      console.log('Starting setup...');
      await setupDatabase();
      console.log('Setup complete');
    }

    await initializeDatabase();
    console.log('Database initialization complete');
    await ensureGameTables();
    console.log('Game tables ready');
    await ensureNotificationTables();
    console.log('Notification tables ready');
    await ensureUserAccountStatusColumn();
    console.log('User account status ready');
    await ensureAdminInfrastructure();
    console.log('Admin infrastructure ready');
    await ensureInstitutionInfrastructure();
    console.log('Institution infrastructure ready');
    await ensureAdminRoleAndUser();
    console.log('Admin account ready');
    await ensureSuperAdminRoleAndUser();
    console.log('Super Admin account ready');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS background_image TEXT;
    `);
    console.log('Profile columns ready');
    await pool.query(`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;`);
    await pool.query(`
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS max_attempts INTEGER;
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS show_results_after TEXT NOT NULL DEFAULT 'immediate';
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS allow_late_submit BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    console.log('Quiz settings columns ready');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_announcements (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL CHECK (char_length(content) <= 500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Announcements table ready');
    if (IS_PRODUCTION && !serveFrontend && corsOrigins.length === 0) {
      console.warn(
        'Production: set FRONTEND_URL or CORS_ORIGINS when the API and frontend are on different domains.'
      );
    }

    const server = app.listen(PORT, HOST, () => {
      const baseUrl =
        process.env.PUBLIC_URL ||
        `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
      console.log(`Server is running on ${baseUrl}`);
      if (serveFrontend) {
        console.log(`App URL: ${baseUrl}`);
      }
      if (corsOrigins.length > 0) {
        console.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);
      }
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `\nPort ${PORT} is already in use — another backend is already running.`
        );
        console.error(
          `Your app may still work via that process. Open http://localhost:${PORT}/api/health to check.`
        );
        console.error(
          'To start a fresh server: stop the other terminal/process using port 5000, then run npm run dev again.\n'
        );
        process.exit(1);
      }
      throw err;
    });
    console.log('Server listener created');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
