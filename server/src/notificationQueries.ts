import pool from './db.ts';

export type NotificationType =
  | 'student_joined'
  | 'quiz_completed'
  | 'quiz_failed'
  | 'quiz_published'
  | 'quiz_reminder'
  | 'game_published'
  | 'content_published'
  | 'announcement_published';

export type RecipientRole = 'Instructor' | 'Student';

export interface NotificationRow {
  id: number;
  recipient_id: number;
  recipient_role: RecipientRole;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export const QUIZ_PASS_THRESHOLD = 60;

export async function ensureNotificationTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_role VARCHAR(20) NOT NULL CHECK (recipient_role IN ('Instructor', 'Student')),
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications(recipient_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications(recipient_id) WHERE read_at IS NULL
  `);
}

export async function insertNotification(input: {
  recipientId: number;
  recipientRole: RecipientRole;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (recipient_id, recipient_role, type, title, body, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.recipientId,
      input.recipientRole,
      input.type,
      input.title,
      input.body,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

export async function getNotificationsForUser(
  recipientId: number,
  limit = 50
): Promise<NotificationRow[]> {
  const result = await pool.query(
    `SELECT id, recipient_id, recipient_role, type, title, body, metadata, read_at, created_at
     FROM notifications
     WHERE recipient_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [recipientId, limit]
  );
  return (result.rows as any[]).map((row) => ({
    ...row,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
  }));
}

export async function getUnreadCount(recipientId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL`,
    [recipientId]
  );
  return (result.rows as any[])[0]?.count ?? 0;
}

export async function markNotificationsRead(
  recipientId: number,
  notificationIds?: number[]
): Promise<void> {
  if (notificationIds && notificationIds.length > 0) {
    await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE recipient_id = $1 AND id = ANY($2::int[]) AND read_at IS NULL`,
      [recipientId, notificationIds]
    );
    return;
  }
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE recipient_id = $1 AND read_at IS NULL`,
    [recipientId]
  );
}

export async function clearNotificationsForUser(recipientId: number): Promise<void> {
  await pool.query('DELETE FROM notifications WHERE recipient_id = $1', [recipientId]);
}

export async function getClassStudentIds(classId: number): Promise<number[]> {
  const result = await pool.query(
    'SELECT student_id FROM class_memberships WHERE class_id = $1',
    [classId]
  );
  return (result.rows as any[]).map((r) => r.student_id);
}
