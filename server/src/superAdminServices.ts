import pool from './db.ts';
import { getPlatformSettings, logAdminAction, rowsToCsv } from './adminServices.ts';
import { isEmailServiceConfigured } from './emailService.ts';

export async function listAdminAccounts() {
  const result = await pool.query(
    `SELECT id, username, email, role, account_status, created_at
     FROM users WHERE role = 'Admin'
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getImpersonationTargets() {
  const result = await pool.query(
    `SELECT id, username, email, role, account_status
     FROM users
     WHERE role IN ('Student', 'Instructor') AND account_status = 'approved'
     ORDER BY role, username`
  );
  return result.rows;
}

export async function getSystemHealth() {
  const tableChecks = [
    'users',
    'classes',
    'quizzes',
    'student_quiz_attempts',
    'user_login_events',
    'admin_audit_log',
    'admin_notifications',
    'notifications',
  ] as const;

  const counts: Record<string, number> = {};
  for (const table of tableChecks) {
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = (result.rows as { count: number }[])[0]?.count ?? 0;
  }

  const settings = await getPlatformSettings();
  const dbOk = await pool.query('SELECT NOW() AS now');
  const openAiConfigured = !!process.env.OPENAI_API_KEY;

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    database: {
      connected: true,
      serverTime: (dbOk.rows as { now: string }[])[0]?.now,
    },
    tableCounts: counts,
    integrations: {
      smtpConfigured: isEmailServiceConfigured(),
      openAiConfigured,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    },
    settings: {
      registration_open: settings.registration_open !== false,
      require_admin_approval: settings.require_admin_approval !== false,
      maintenance_mode: settings.maintenance_mode === true,
      openai_enabled: settings.openai_enabled !== false,
      games_enabled: settings.games_enabled !== false,
      quizzes_enabled: settings.quizzes_enabled !== false,
      chatbot_enabled: settings.chatbot_enabled !== false,
      ai_quiz_enabled: settings.ai_quiz_enabled !== false,
    },
  };
}

export async function exportAuditLogCsv(): Promise<string> {
  const result = await pool.query(
    `SELECT a.id, a.created_at, u.username AS admin_name, u.email AS admin_email,
            a.action, a.target_type, a.target_id, a.details
     FROM admin_audit_log a
     LEFT JOIN users u ON u.id = a.admin_id
     ORDER BY a.created_at DESC
     LIMIT 5000`
  );
  const rows = (result.rows as Record<string, unknown>[]).map((r) => ({
    ...r,
    details: r.details ? JSON.stringify(r.details) : '',
  }));
  return rowsToCsv(
    ['id', 'created_at', 'admin_name', 'admin_email', 'action', 'target_type', 'target_id', 'details'],
    rows
  );
}

export async function purgeLoginEvents(keepDays: number): Promise<number> {
  const result = await pool.query(
    `DELETE FROM user_login_events
     WHERE logged_in_at < NOW() - ($1::int || ' days')::interval
     RETURNING id`,
    [keepDays]
  );
  return result.rowCount ?? 0;
}

export async function logSuperAdminAction(input: {
  superAdminId: number;
  action: string;
  targetType?: string;
  targetId?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  await logAdminAction({
    adminId: input.superAdminId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    details: input.details,
  });
}
