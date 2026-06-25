import pool from './db.ts';

export async function logAdminAction(input: {
  adminId: number;
  action: string;
  targetType?: string;
  targetId?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.adminId,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.details ?? {}),
    ]
  );
}

// Records a blocked quiz/content moderation event in the audit log so admins can
// review patterns. admin_id is nullable, so an unknown actor is logged as null.
// Never throws — moderation logging must not break the request it is attached to.
export async function logModerationBlock(input: {
  userId?: number | null; // the instructor whose content was blocked (if known)
  category?: string; // which policy category triggered the block
  reason: string; // human-readable explanation of why it was blocked
  context: 'ai_quiz_prompt' | 'ai_quiz_output' | 'manual_quiz'; // where it happened
}): Promise<void> {
  // Wrapped in try/catch so a logging failure can't break quiz saving.
  try {
    // Insert one audit row describing the blocked attempt.
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'quiz_moderation_blocked', 'quiz', NULL, $2::jsonb)`,
      [
        // $1: the user id, or null when we don't know who triggered it.
        input.userId ?? null,
        // $2: extra detail stored as JSON for later review.
        JSON.stringify({
          context: input.context,
          category: input.category ?? null,
          reason: input.reason,
        }),
      ]
    );
  } catch (error) {
    // Log the failure to the console but swallow it (don't rethrow).
    console.error('Failed to log moderation block:', error);
  }
}

export async function insertAdminNotification(input: {
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO admin_notifications (type, title, body, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [input.type, input.title, input.body, JSON.stringify(input.metadata ?? {})]
  );
}

export async function getAdminNotifications(limit = 30) {
  const result = await pool.query(
    `SELECT id, type, title, body, metadata, read_at, created_at
     FROM admin_notifications ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getAdminUnreadCount(): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM admin_notifications WHERE read_at IS NULL`
  );
  return (result.rows as { count: number }[])[0]?.count ?? 0;
}

export async function markAdminNotificationsRead(ids?: number[]): Promise<void> {
  if (ids?.length) {
    await pool.query(
      `UPDATE admin_notifications SET read_at = NOW() WHERE id = ANY($1::int[]) AND read_at IS NULL`,
      [ids]
    );
    return;
  }
  await pool.query(`UPDATE admin_notifications SET read_at = NOW() WHERE read_at IS NULL`);
}

export async function getPlatformSettings(): Promise<Record<string, unknown>> {
  const result = await pool.query(`SELECT key, value FROM platform_settings`);
  const out: Record<string, unknown> = {};
  for (const row of result.rows as { key: string; value: unknown }[]) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getPlatformSetting<T>(key: string, fallback: T): Promise<T> {
  const result = await pool.query(`SELECT value FROM platform_settings WHERE key = $1`, [key]);
  const row = (result.rows as { value: unknown }[])[0];
  if (!row) return fallback;
  return row.value as T;
}

export async function updatePlatformSettings(
  updates: Record<string, unknown>
): Promise<Record<string, unknown>> {
  for (const [key, value] of Object.entries(updates)) {
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  }
  return getPlatformSettings();
}

export async function getAdminOverview() {
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'Student' AND account_status = 'approved') AS students,
      (SELECT COUNT(*)::int FROM users WHERE role = 'Instructor' AND account_status = 'approved') AS instructors,
      (SELECT COUNT(*)::int FROM users WHERE account_status = 'pending') AS pending_registrations,
      (SELECT COUNT(*)::int FROM users WHERE account_status = 'suspended') AS suspended_users,
      (SELECT COUNT(*)::int FROM classes) AS classes,
      (SELECT COUNT(*)::int FROM quizzes) AS quizzes,
      (SELECT COUNT(*)::int FROM games) AS games,
      (SELECT COUNT(*)::int FROM courses) AS courses,
      (SELECT COUNT(*)::int FROM student_quiz_attempts) AS quiz_attempts,
      (SELECT COUNT(*)::int FROM class_memberships) AS class_memberships,
      (SELECT COUNT(*)::int FROM admin_notifications WHERE read_at IS NULL) AS unread_admin_alerts
  `);
  const recent = await pool.query(`
    SELECT COUNT(*)::int AS count FROM users
    WHERE created_at >= NOW() - INTERVAL '7 days' AND role NOT IN ('Admin', 'SuperAdmin')
  `);
  const row = (counts.rows as any[])[0];
  return {
    ...row,
    registrations_last_7_days: (recent.rows as any[])[0]?.count ?? 0,
  };
}

export async function getUserDetail(userId: number) {
  const userResult = await pool.query(
    `SELECT id, username, email, role, account_status, created_at FROM users WHERE id = $1`,
    [userId]
  );
  const user = (userResult.rows as any[])[0];
  if (!user) return null;

  const [classes, attempts, enrollments] = await Promise.all([
    pool.query(
      user.role === 'Student'
        ? `SELECT c.id, c.title, cm.joined_at FROM class_memberships cm
           JOIN classes c ON c.id = cm.class_id WHERE cm.student_id = $1 ORDER BY cm.joined_at DESC`
        : `SELECT c.id, c.title, c.created_at AS joined_at FROM classes c
           WHERE c.instructor_id = $1 ORDER BY c.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT sqa.id, sqa.quiz_id, q.title AS quiz_title, sqa.score, sqa.completed_at
       FROM student_quiz_attempts sqa JOIN quizzes q ON q.id = sqa.quiz_id
       WHERE sqa.student_id = $1 ORDER BY sqa.completed_at DESC LIMIT 20`,
      [userId]
    ),
    pool.query(
      `SELECT co.id, co.title, se.enrolled_at FROM student_enrollments se
       JOIN courses co ON co.id = se.course_id WHERE se.student_id = $1`,
      [userId]
    ),
  ]);

  return {
    user,
    classes: classes.rows,
    quiz_attempts: user.role === 'Student' ? attempts.rows : [],
    course_enrollments: user.role === 'Student' ? enrollments.rows : [],
  };
}

export async function getQuizAnalytics() {
  const summary = await pool.query(`
    SELECT
      COUNT(DISTINCT sqa.student_id)::int AS students_with_attempts,
      COUNT(sqa.id)::int AS total_attempts,
      ROUND(AVG(sqa.score)::numeric, 1) AS platform_avg_score,
      COUNT(*) FILTER (WHERE sqa.score < 60)::int AS below_pass_count
    FROM student_quiz_attempts sqa
  `);
  const byQuiz = await pool.query(`
    SELECT q.id, q.title, c.title AS class_title, u.username AS instructor_name,
           COUNT(sqa.id)::int AS attempt_count,
           ROUND(AVG(sqa.score)::numeric, 1) AS avg_score,
           COUNT(*) FILTER (WHERE sqa.score < 60)::int AS fail_count
    FROM quizzes q
    LEFT JOIN student_quiz_attempts sqa ON sqa.quiz_id = q.id
    LEFT JOIN classes c ON c.id = q.class_id
    JOIN users u ON u.id = q.instructor_id
    GROUP BY q.id, q.title, c.title, u.username
    ORDER BY attempt_count DESC, q.title
    LIMIT 50
  `);
  return { summary: (summary.rows as any[])[0], by_quiz: byQuiz.rows };
}

export async function getAdminGames() {
  const result = await pool.query(`
    SELECT g.id, g.title, g.game_type, g.created_at, u.username AS instructor_name,
           q.title AS quiz_title,
           (SELECT COUNT(*)::int FROM class_games cg WHERE cg.game_id = g.id) AS published_count
    FROM games g
    JOIN users u ON u.id = g.instructor_id
    JOIN quizzes q ON q.id = g.quiz_id
    ORDER BY g.created_at DESC
  `);
  return result.rows;
}

export async function getAdminContentItems() {
  const result = await pool.query(`
    SELECT i.id, i.title, i.item_type, i.created_at, c.title AS class_title,
           u.username AS instructor_name, t.name AS topic_name
    FROM class_topic_items i
    JOIN classes c ON c.id = i.class_id
    JOIN users u ON u.id = c.instructor_id
    JOIN class_topics t ON t.id = i.topic_id
    ORDER BY i.created_at DESC
    LIMIT 200
  `);
  return result.rows;
}

export async function getAdminCourses() {
  const result = await pool.query(`
    SELECT co.id, co.title, co.description, co.created_at, u.username AS instructor_name,
           (SELECT COUNT(*)::int FROM student_enrollments se WHERE se.course_id = co.id) AS enrollment_count
    FROM courses co
    JOIN users u ON u.id = co.instructor_id
    ORDER BY co.created_at DESC
  `);
  return result.rows;
}

// Admins only see Administrator actions (not Super Admin actions);
// Super Admins see everything so they can monitor admins and their own actions.
export async function getAuditLog(viewerRole?: string, limit = 100) {
  const isSuper = viewerRole === 'SuperAdmin';
  const result = await pool.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
            u.username AS admin_name, u.email AS admin_email, u.role AS admin_role
     FROM admin_audit_log a
     LEFT JOIN users u ON u.id = a.admin_id
     ${isSuper ? '' : "WHERE COALESCE(u.role, '') <> 'SuperAdmin'"}
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// An admin can only clear their own role's history:
//  - Admin clears Administrator entries (Super Admin history is preserved).
//  - Super Admin clears only Super Admin entries (Administrator history is preserved).
export async function clearAuditLog(actorRole: string): Promise<number> {
  const targetRole = actorRole === 'SuperAdmin' ? 'SuperAdmin' : 'Admin';
  const result = await pool.query(
    `DELETE FROM admin_audit_log a
     USING users u
     WHERE a.admin_id = u.id AND u.role = $1`,
    [targetRole]
  );
  return result.rowCount ?? 0;
}

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}
