import express from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.ts';
import {
  getAdminOverview,
  getUserDetail,
  getQuizAnalytics,
  getAdminGames,
  getAdminContentItems,
  getAdminCourses,
  getAuditLog,
  clearAuditLog,
  getPlatformSettings,
  updatePlatformSettings,
  logAdminAction,
  getAdminNotifications,
  getAdminUnreadCount,
  markAdminNotificationsRead,
  rowsToCsv,
} from '../adminServices.ts';
import { approveUserAccount, getPendingUsers } from '../userAccountStatus.ts';
import { isEmailServiceConfigured, sendTestEmail } from '../emailService.ts';
import { getLoginActivityByDay } from '../loginEvents.ts';

const router = express.Router();

function adminId(req: Request): number {
  return (req as Request & { adminId: number }).adminId;
}

function adminRole(req: Request): string {
  return (req as Request & { adminRole: string }).adminRole;
}

router.get('/login-activity', async (req: Request, res: Response) => {
  try {
    const days = Math.min(30, Math.max(7, parseInt(String(req.query.days || 14), 10) || 14));
    const activity = await getLoginActivityByDay(days);
    res.json({ activity, days });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load login activity' });
  }
});

router.get('/overview', async (_req: Request, res: Response) => {
  try {
    res.json({ overview: await getAdminOverview() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load overview' });
  }
});

router.get('/users/:userId/detail', async (req: Request, res: Response) => {
  try {
    const detail = await getUserDetail(Number(req.params.userId));
    if (!detail) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(detail);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load user detail' });
  }
});

router.put('/users/:userId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const { username, email, role } = req.body as {
      username?: string;
      email?: string;
      role?: string;
    };
    const check = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
    const existing = (check.rows as any[])[0];
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (existing.role === 'Admin' || existing.role === 'SuperAdmin') {
      res.status(403).json({ error: 'Cannot edit admin account' });
      return;
    }
    if (role && !['Instructor', 'Student'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    const result = await pool.query(
      `UPDATE users SET
         username = COALESCE($1, username),
         email = COALESCE($2, email),
         role = COALESCE($3, role)
       WHERE id = $4
       RETURNING id, username, email, role, account_status, created_at`,
      [
        username?.trim() || null,
        email?.trim().toLowerCase() || null,
        role || null,
        userId,
      ]
    );
    await logAdminAction({
      adminId: adminId(req),
      action: 'user_update',
      targetType: 'user',
      targetId: userId,
      details: { username, email, role },
    });
    res.json({ message: 'User updated', user: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

router.post('/users/:userId/suspend', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const result = await pool.query(
      `UPDATE users SET account_status = 'suspended'
       WHERE id = $1 AND role NOT IN ('Admin', 'SuperAdmin') AND account_status = 'approved'
       RETURNING id, username, email`,
      [userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found or cannot be suspended' });
      return;
    }
    await logAdminAction({ adminId: adminId(req), action: 'user_suspend', targetType: 'user', targetId: userId });
    res.json({ message: 'User suspended', user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to suspend user' });
  }
});

router.post('/users/:userId/unsuspend', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const result = await pool.query(
      `UPDATE users SET account_status = 'approved'
       WHERE id = $1 AND account_status = 'suspended'
       RETURNING id, username, email`,
      [userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Suspended user not found' });
      return;
    }
    await logAdminAction({ adminId: adminId(req), action: 'user_unsuspend', targetType: 'user', targetId: userId });
    res.json({ message: 'User reactivated', user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to unsuspend user' });
  }
});

router.post('/users/:userId/reset-password', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const { new_password } = req.body as { new_password?: string };
    if (!new_password || new_password.length < 6) {
      res.status(400).json({ error: 'new_password must be at least 6 characters' });
      return;
    }
    const check = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (['Admin', 'SuperAdmin'].includes((check.rows as any[])[0]?.role)) {
      res.status(403).json({ error: 'Cannot reset admin password here' });
      return;
    }
    const hash = await bcrypt.hash(new_password, 10);
    const result = await pool.query(
      `UPDATE users SET password = $1 WHERE id = $2 AND role NOT IN ('Admin', 'SuperAdmin')
       RETURNING id, username, email`,
      [hash, userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await logAdminAction({ adminId: adminId(req), action: 'user_reset_password', targetType: 'user', targetId: userId });
    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

router.post('/users/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { user_ids } = req.body as { user_ids?: number[] };
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      res.status(400).json({ error: 'user_ids array is required' });
      return;
    }
    const result = await pool.query(
      `DELETE FROM users WHERE id = ANY($1::int[]) AND role NOT IN ('Admin', 'SuperAdmin') RETURNING id`,
      [user_ids]
    );
    await logAdminAction({
      adminId: adminId(req),
      action: 'users_bulk_delete',
      details: { count: result.rowCount, ids: user_ids },
    });
    res.json({ message: `${result.rowCount} user(s) deleted`, deleted: result.rowCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Bulk delete failed' });
  }
});

router.post('/users/approve-all', async (req: Request, res: Response) => {
  try {
    const pending = await getPendingUsers();
    let approved = 0;
    for (const p of pending) {
      const ok = await approveUserAccount(p.id);
      if (ok) approved++;
    }
    await logAdminAction({
      adminId: adminId(req),
      action: 'users_approve_all',
      details: { approved },
    });
    res.json({ message: `${approved} registration(s) approved`, approved });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Bulk approve failed' });
  }
});

router.get('/analytics/quizzes', async (_req: Request, res: Response) => {
  try {
    res.json(await getQuizAnalytics());
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load analytics' });
  }
});

router.get('/games', async (_req: Request, res: Response) => {
  try {
    res.json({ games: await getAdminGames() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch games' });
  }
});

router.delete('/games/:gameId', async (req: Request, res: Response) => {
  try {
    const gameId = Number(req.params.gameId);
    await pool.query('DELETE FROM class_games WHERE game_id = $1', [gameId]);
    const result = await pool.query('DELETE FROM games WHERE id = $1 RETURNING id, title', [gameId]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    await logAdminAction({
      adminId: adminId(req),
      action: 'game_delete',
      targetType: 'game',
      targetId: gameId,
    });
    res.json({ message: 'Game deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete game' });
  }
});

router.get('/content', async (_req: Request, res: Response) => {
  try {
    res.json({ items: await getAdminContentItems() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch content' });
  }
});

router.delete('/content/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = Number(req.params.itemId);
    const result = await pool.query(
      'DELETE FROM class_topic_items WHERE id = $1 RETURNING id, title',
      [itemId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Content item not found' });
      return;
    }
    await logAdminAction({
      adminId: adminId(req),
      action: 'content_delete',
      targetType: 'content',
      targetId: itemId,
    });
    res.json({ message: 'Content item removed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete content' });
  }
});

router.get('/courses', async (_req: Request, res: Response) => {
  try {
    res.json({ courses: await getAdminCourses() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch courses' });
  }
});

router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    res.json({ entries: await getAuditLog(adminRole(req)) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch audit log' });
  }
});

// Clear audit log history scoped to the requester's own role.
router.delete('/audit-log', async (req: Request, res: Response) => {
  try {
    const role = adminRole(req);
    const deleted = await clearAuditLog(role);
    await logAdminAction({
      adminId: adminId(req),
      action: 'audit_log_clear',
      details: { scope: role === 'SuperAdmin' ? 'SuperAdmin' : 'Admin', deleted },
    });
    res.json({ deleted });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to clear audit log' });
  }
});

router.get('/notifications', async (_req: Request, res: Response) => {
  try {
    const notifications = await getAdminNotifications();
    const unreadCount = await getAdminUnreadCount();
    res.json({ notifications, unreadCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
});

router.post('/notifications/mark-read', async (req: Request, res: Response) => {
  try {
    const { notification_ids } = req.body as { notification_ids?: number[] };
    await markAdminNotificationsRead(notification_ids);
    res.json({ ok: true, unreadCount: await getAdminUnreadCount() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to mark read' });
  }
});

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getPlatformSettings();
    res.json({
      settings,
      smtp_configured: isEmailServiceConfigured(),
      frontend_url: process.env.FRONTEND_URL || 'http://localhost:5173',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load settings' });
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const { registration_open, require_admin_approval } = req.body as {
      registration_open?: boolean;
      require_admin_approval?: boolean;
    };
    const updates: Record<string, unknown> = {};
    if (typeof registration_open === 'boolean') updates.registration_open = registration_open;
    if (typeof require_admin_approval === 'boolean') {
      updates.require_admin_approval = require_admin_approval;
    }
    const settings = await updatePlatformSettings(updates);
    await logAdminAction({
      adminId: adminId(req),
      action: 'settings_update',
      details: updates,
    });
    res.json({ message: 'Settings saved', settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save settings' });
  }
});

router.post('/settings/test-email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!isEmailServiceConfigured()) {
      res.status(503).json({ error: 'SMTP is not configured' });
      return;
    }
    await sendTestEmail(email.trim().toLowerCase());
    res.json({ message: `Test email sent to ${email}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Test email failed' });
  }
});

router.get('/export/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    let csv = '';
    let filename = 'export.csv';

    if (type === 'users') {
      const result = await pool.query(
        `SELECT username AS full_name, email, role, account_status, created_at FROM users WHERE role NOT IN ('Admin', 'SuperAdmin') ORDER BY created_at DESC`
      );
      csv = rowsToCsv(['full_name', 'email', 'role', 'account_status', 'created_at'], result.rows as any[]);
      filename = 'users_export.csv';
    } else if (type === 'classes') {
      const result = await pool.query(
        `SELECT c.title, c.description, c.join_code, u.username AS instructor, c.created_at
         FROM classes c JOIN users u ON u.id = c.instructor_id ORDER BY c.created_at DESC`
      );
      csv = rowsToCsv(['title', 'description', 'join_code', 'instructor', 'created_at'], result.rows as any[]);
      filename = 'classes_export.csv';
    } else if (type === 'quizzes') {
      const result = await pool.query(
        `SELECT q.title, q.description, u.username AS instructor, c.title AS class_title, q.created_at
         FROM quizzes q JOIN users u ON u.id = q.instructor_id
         LEFT JOIN classes c ON c.id = q.class_id ORDER BY q.created_at DESC`
      );
      csv = rowsToCsv(['title', 'description', 'instructor', 'class_title', 'created_at'], result.rows as any[]);
      filename = 'quizzes_export.csv';
    } else if (type === 'attempts') {
      const result = await pool.query(
        `SELECT u.username AS student_name, u.email AS student_email, q.title AS quiz_title,
                sqa.score, sqa.correct_answers, sqa.total_questions, sqa.completed_at
         FROM student_quiz_attempts sqa
         JOIN users u ON u.id = sqa.student_id
         JOIN quizzes q ON q.id = sqa.quiz_id
         ORDER BY sqa.completed_at DESC`
      );
      csv = rowsToCsv(
        ['student_name', 'student_email', 'quiz_title', 'score', 'correct_answers', 'total_questions', 'completed_at'],
        result.rows as any[]
      );
      filename = 'quiz_attempts_export.csv';
    } else if (type === 'pending') {
      const pending = await getPendingUsers();
      csv = rowsToCsv(
        ['username', 'email', 'role', 'created_at'],
        pending.map((p) => ({ ...p }))
      );
      filename = 'pending_registrations.csv';
    } else {
      res.status(400).json({ error: 'Invalid export type' });
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Export failed' });
  }
});

export default router;
