import pool from './db.ts';
import { ensureLoginEventsTable } from './loginEvents.ts';

export async function ensureAdminInfrastructure(): Promise<void> {
  await ensureLoginEventsTable();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(50),
      target_id INT,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key VARCHAR(80) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
    ON admin_notifications(created_at DESC) WHERE read_at IS NULL
  `);

  const defaults: [string, unknown][] = [
    ['registration_open', true],
    ['require_admin_approval', true],
    ['maintenance_mode', false],
    ['openai_enabled', true],
    ['games_enabled', true],
    ['quizzes_enabled', true],
    ['chatbot_enabled', true],
    ['ai_quiz_enabled', true],
  ];
  for (const [key, value] of defaults) {
    await pool.query(
      `INSERT INTO platform_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)]
    );
  }
}
