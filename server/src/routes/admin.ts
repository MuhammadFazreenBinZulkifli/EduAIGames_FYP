import express from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.ts';
import { requireAdmin } from '../adminAuth.ts';
import { bulkImportUsers, type BulkUserRow } from '../queries.ts';
import {
  approveUserAccount,
  getPendingUsers,
  rejectPendingUser,
} from '../userAccountStatus.ts';
import {
  trySendRegistrationApprovedEmail,
  trySendRegistrationRejectedEmail,
} from '../emailService.ts';
import { logAdminAction } from '../adminServices.ts';
import adminExtended from './adminExtended.ts';

const router = express.Router();

function getAdminId(req: Request): number {
  return (req as Request & { adminId: number }).adminId;
}

router.use(requireAdmin);

// View all users (students + instructors; includes admin)
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, account_status, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

router.get('/users/pending', async (_req: Request, res: Response) => {
  try {
    const pending = await getPendingUsers();
    res.json({ pending, count: pending.length });
  } catch (error: any) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pending registrations' });
  }
});

router.post('/users/:userId/approve', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const approved = await approveUserAccount(userId);
    if (!approved) {
      res.status(404).json({ error: 'Pending registration not found' });
      return;
    }
    const emailResult = await trySendRegistrationApprovedEmail({
      to: approved.email,
      fullName: approved.username,
      role: approved.role,
    });
    await logAdminAction({
      adminId: getAdminId(req),
      action: 'registration_approve',
      targetType: 'user',
      targetId: userId,
      details: { email: approved.email },
    });
    res.json({
      message: 'Registration approved. The user can now log in.',
      emailSent: emailResult.emailSent,
      emailError: emailResult.emailError,
    });
  } catch (error: any) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: error.message || 'Failed to approve registration' });
  }
});

router.post('/users/:userId/reject', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const rejected = await rejectPendingUser(userId);
    if (!rejected) {
      res.status(404).json({ error: 'Pending registration not found' });
      return;
    }
    const emailResult = await trySendRegistrationRejectedEmail({
      to: rejected.email,
      fullName: rejected.username,
    });
    await logAdminAction({
      adminId: getAdminId(req),
      action: 'registration_reject',
      targetType: 'user',
      targetId: userId,
      details: { email: rejected.email },
    });
    res.json({
      message: 'Registration rejected and removed.',
      emailSent: emailResult.emailSent,
      emailError: emailResult.emailError,
    });
  } catch (error: any) {
    console.error('Error rejecting user:', error);
    res.status(500).json({ error: error.message || 'Failed to reject registration' });
  }
});

// Bulk import users from parsed spreadsheet rows
router.post('/users/import', async (req: Request, res: Response) => {
  try {
    const { users: rows } = req.body as { users?: unknown[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'users array is required' });
      return;
    }
    if (rows.length > 500) {
      res.status(400).json({ error: 'Maximum 500 users per import' });
      return;
    }

    const validated: BulkUserRow[] = [];
    const validationErrors: { row: number; email: string; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] as Record<string, unknown>;
      const rowNum = i + 1;
      const username = String(raw.username ?? raw.full_name ?? '').trim();
      const email = String(raw.email ?? '').trim().toLowerCase();
      const password = String(raw.password ?? '');
      const roleRaw = String(raw.role ?? '').trim();
      const role =
        roleRaw.toLowerCase() === 'instructor'
          ? 'Instructor'
          : roleRaw.toLowerCase() === 'student'
            ? 'Student'
            : null;

      if (!username || !email || !password) {
        validationErrors.push({
          row: rowNum,
          email: email || '(empty)',
          message: 'full_name, email, and password are required',
        });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validationErrors.push({ row: rowNum, email, message: 'Invalid email format' });
        continue;
      }
      if (password.length < 6) {
        validationErrors.push({ row: rowNum, email, message: 'Password must be at least 6 characters' });
        continue;
      }
      if (!role) {
        validationErrors.push({ row: rowNum, email, message: 'role must be Instructor or Student' });
        continue;
      }
      if (email === 'admin@admin.com') {
        validationErrors.push({ row: rowNum, email, message: 'Cannot import over the admin account' });
        continue;
      }

      validated.push({ username, email, password, role });
    }

    if (validated.length === 0) {
      res.status(400).json({
        error: 'No valid rows to import',
        validationErrors,
      });
      return;
    }

    const result = await bulkImportUsers(validated, (plain) => bcrypt.hash(plain, 10));
    await logAdminAction({
      adminId: getAdminId(req),
      action: 'users_bulk_import',
      details: { created: result.created, skipped: result.skipped },
    });

    res.status(201).json({
      message: 'Import completed',
      created: result.created,
      skipped: result.skipped,
      failed: result.failed + validationErrors.length,
      validationErrors,
      importErrors: result.errors,
      createdUsers: result.createdUsers,
    });
  } catch (error: any) {
    console.error('Error importing users:', error);
    res.status(500).json({ error: error.message || 'Failed to import users' });
  }
});

// Delete a user account (cannot delete Admin)
router.delete('/users/:userId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const check = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if ((check.rows as { role: string }[]).length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (['Admin', 'SuperAdmin'].includes((check.rows as { role: string }[])[0].role)) {
      res.status(403).json({ error: 'Cannot delete admin account' });
      return;
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await logAdminAction({
      adminId: getAdminId(req),
      action: 'user_delete',
      targetType: 'user',
      targetId: userId,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Failed to delete user' });
  }
});

// View all classes
router.get('/classes', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.description, c.join_code, c.created_at, c.updated_at,
              c.instructor_id, u.username AS instructor_username
       FROM classes c
       JOIN users u ON c.instructor_id = u.id
       ORDER BY c.created_at DESC`
    );
    res.json({ classes: result.rows });
  } catch (error: any) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch classes' });
  }
});

// Update class basic info
router.put('/classes/:classId', async (req: Request, res: Response) => {
  try {
    const classId = Number(req.params.classId);
    const { title, description } = req.body;

    if (!Number.isFinite(classId)) {
      res.status(400).json({ error: 'Invalid class id' });
      return;
    }

    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Class title is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE classes
       SET title = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, title, description, join_code, instructor_id, updated_at`,
      [title, description || '', classId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }

    res.json({ message: 'Class updated successfully', class: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: error.message || 'Failed to update class' });
  }
});

// Delete a class
router.delete('/classes/:classId', async (req: Request, res: Response) => {
  try {
    const classId = Number(req.params.classId);
    if (!Number.isFinite(classId)) {
      res.status(400).json({ error: 'Invalid class id' });
      return;
    }

    const result = await pool.query('DELETE FROM classes WHERE id = $1 RETURNING id', [classId]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }

    await logAdminAction({
      adminId: getAdminId(req),
      action: 'class_delete',
      targetType: 'class',
      targetId: classId,
    });
    res.json({ message: 'Class deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: error.message || 'Failed to delete class' });
  }
});

// View all quizzes
router.get('/quizzes', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT q.id, q.title, q.description, q.created_at, q.updated_at,
              q.instructor_id, q.class_id, u.username AS instructor_username,
              c.title AS class_title
       FROM quizzes q
       JOIN users u ON q.instructor_id = u.id
       LEFT JOIN classes c ON q.class_id = c.id
       ORDER BY q.created_at DESC`
    );
    res.json({ quizzes: result.rows });
  } catch (error: any) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quizzes' });
  }
});

// Update quiz basic info
router.put('/quizzes/:quizId', async (req: Request, res: Response) => {
  try {
    const quizId = Number(req.params.quizId);
    const { title, description } = req.body;

    if (!Number.isFinite(quizId)) {
      res.status(400).json({ error: 'Invalid quiz id' });
      return;
    }

    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Quiz title is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE quizzes
       SET title = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, title, description, class_id, instructor_id, updated_at`,
      [title, description || '', quizId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    res.json({ message: 'Quiz updated successfully', quiz: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to update quiz' });
  }
});

// Delete a quiz
router.delete('/quizzes/:quizId', async (req: Request, res: Response) => {
  try {
    const quizId = Number(req.params.quizId);
    if (!Number.isFinite(quizId)) {
      res.status(400).json({ error: 'Invalid quiz id' });
      return;
    }

    const result = await pool.query('DELETE FROM quizzes WHERE id = $1 RETURNING id', [quizId]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    await logAdminAction({
      adminId: getAdminId(req),
      action: 'quiz_delete',
      targetType: 'quiz',
      targetId: quizId,
    });
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to delete quiz' });
  }
});

router.use(adminExtended);

export default router;
