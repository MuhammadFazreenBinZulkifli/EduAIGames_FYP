import express from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.ts';
import { requireSuperAdmin } from '../adminAuth.ts';
import { updatePlatformSettings } from '../adminServices.ts';
import {
  exportAuditLogCsv,
  getImpersonationTargets,
  getSystemHealth,
  listAdminAccounts,
  logSuperAdminAction,
  purgeLoginEvents,
} from '../superAdminServices.ts';
import {
  assignUserToInstitution,
  createInstitution,
  deleteInstitution,
  getInstitutionById,
  listInstitutionMembers,
  listInstitutions,
  listPlans,
  updateInstitution,
} from '../institutionServices.ts';

const router = express.Router();

function superAdminId(req: Request): number {
  return (req as Request & { adminId: number }).adminId;
}

router.use(requireSuperAdmin);

// ── #1 Admin management ───────────────────────────────────────────────────────

router.get('/admins', async (_req: Request, res: Response) => {
  try {
    res.json({ admins: await listAdminAccounts() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load admins' });
  }
});

router.post('/admins', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body as {
      username?: string;
      email?: string;
      password?: string;
    };
    if (!username?.trim() || !email?.trim() || !password) {
      res.status(400).json({ error: 'Full name, email, and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const dup = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if ((dup.rows as unknown[]).length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password, role, account_status)
       VALUES ($1, $2, $3, 'Admin', 'approved')
       RETURNING id, username, email, role, account_status, created_at`,
      [username.trim(), normalizedEmail, hash]
    );

    const admin = (result.rows as { id: number }[])[0];
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'admin_create',
      targetType: 'user',
      targetId: admin.id,
      details: { email: normalizedEmail },
    });

    res.status(201).json({ admin: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create admin' });
  }
});

router.post('/admins/:adminId/promote', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.adminId);
    const result = await pool.query(
      `UPDATE users SET role = 'Admin', account_status = 'approved'
       WHERE id = $1 AND role IN ('Instructor', 'Student')
       RETURNING id, username, email, role, account_status`,
      [userId]
    );
    if ((result.rows as unknown[]).length === 0) {
      res.status(404).json({ error: 'User not found or cannot be promoted' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'admin_promote',
      targetType: 'user',
      targetId: userId,
    });
    res.json({ user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to promote user' });
  }
});

router.post('/admins/:adminId/demote', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.adminId);
    if (userId === superAdminId(req)) {
      res.status(400).json({ error: 'Cannot demote yourself' });
      return;
    }
    const result = await pool.query(
      `UPDATE users SET role = 'Instructor'
       WHERE id = $1 AND role = 'Admin'
       RETURNING id, username, email, role, account_status`,
      [userId]
    );
    if ((result.rows as unknown[]).length === 0) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'admin_demote',
      targetType: 'user',
      targetId: userId,
    });
    res.json({ user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to demote admin' });
  }
});

router.post('/admins/:adminId/suspend', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.adminId);
    const result = await pool.query(
      `UPDATE users SET account_status = 'suspended'
       WHERE id = $1 AND role = 'Admin'
       RETURNING id, username, email, role, account_status`,
      [userId]
    );
    if ((result.rows as unknown[]).length === 0) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'admin_suspend',
      targetType: 'user',
      targetId: userId,
    });
    res.json({ user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to suspend admin' });
  }
});

router.post('/admins/:adminId/unsuspend', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.adminId);
    const result = await pool.query(
      `UPDATE users SET account_status = 'approved'
       WHERE id = $1 AND role = 'Admin' AND account_status = 'suspended'
       RETURNING id, username, email, role, account_status`,
      [userId]
    );
    if ((result.rows as unknown[]).length === 0) {
      res.status(404).json({ error: 'Suspended admin not found' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'admin_unsuspend',
      targetType: 'user',
      targetId: userId,
    });
    res.json({ user: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to activate admin' });
  }
});

router.delete('/admins/:adminId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.adminId);
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role = 'Admin' RETURNING id`,
      [userId]
    );
    if ((result.rows as unknown[]).length === 0) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'admin_delete',
      targetType: 'user',
      targetId: userId,
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete admin' });
  }
});

// ── #3 Platform settings (super admin extended) ───────────────────────────────

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const {
      registration_open,
      require_admin_approval,
      maintenance_mode,
      openai_enabled,
      games_enabled,
      quizzes_enabled,
      chatbot_enabled,
      ai_quiz_enabled,
    } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (registration_open !== undefined) updates.registration_open = registration_open;
    if (require_admin_approval !== undefined) updates.require_admin_approval = require_admin_approval;
    if (maintenance_mode !== undefined) updates.maintenance_mode = maintenance_mode;
    if (openai_enabled !== undefined) updates.openai_enabled = openai_enabled;
    if (games_enabled !== undefined) updates.games_enabled = games_enabled;
    if (quizzes_enabled !== undefined) updates.quizzes_enabled = quizzes_enabled;
    if (chatbot_enabled !== undefined) updates.chatbot_enabled = chatbot_enabled;
    if (ai_quiz_enabled !== undefined) updates.ai_quiz_enabled = ai_quiz_enabled;

    const settings = await updatePlatformSettings(updates);
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'platform_settings_update',
      details: updates,
    });
    res.json({ settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update settings' });
  }
});

// ── #4 Dangerous operations ───────────────────────────────────────────────────

router.post('/purge-login-events', async (req: Request, res: Response) => {
  try {
    const keepDays = Math.min(365, Math.max(7, parseInt(String(req.body?.keep_days ?? 90), 10) || 90));
    const deleted = await purgeLoginEvents(keepDays);
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'purge_login_events',
      details: { keep_days: keepDays, deleted },
    });
    res.json({ ok: true, deleted, keep_days: keepDays });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to purge login events' });
  }
});

// ── #5 Impersonation ──────────────────────────────────────────────────────────

router.get('/impersonate/targets', async (_req: Request, res: Response) => {
  try {
    res.json({ targets: await getImpersonationTargets() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load users' });
  }
});

router.post('/impersonate', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.body?.user_id);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, username, email, role FROM users
       WHERE id = $1 AND role IN ('Student', 'Instructor') AND account_status = 'approved'`,
      [userId]
    );
    const target = (result.rows as { id: number; username: string; email: string; role: string }[])[0];
    if (!target) {
      res.status(404).json({ error: 'User not found or cannot be impersonated' });
      return;
    }

    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'impersonate_start',
      targetType: 'user',
      targetId: userId,
      details: { role: target.role, email: target.email },
    });

    res.json({
      user: {
        id: target.id,
        username: target.username,
        email: target.email,
        role: target.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Impersonation failed' });
  }
});

// ── #6 Audit export ───────────────────────────────────────────────────────────

router.get('/audit-log/export', async (req: Request, res: Response) => {
  try {
    const csv = await exportAuditLogCsv();
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'audit_log_export',
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log-export.csv"');
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Export failed' });
  }
});

// ── #7 Institutions & plans (multi-tenant / paid features) ────────────────────

router.get('/plans', async (_req: Request, res: Response) => {
  try {
    res.json({ plans: await listPlans() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load plans' });
  }
});

router.get('/institutions', async (_req: Request, res: Response) => {
  try {
    res.json({ institutions: await listInstitutions() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load institutions' });
  }
});

router.post('/institutions', async (req: Request, res: Response) => {
  try {
    const { name, plan_id, seats_limit, email_domains, status, primary_color } = req.body as Record<string, unknown>;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Institution name is required' });
      return;
    }
    const institution = await createInstitution({
      name: String(name),
      plan_id: plan_id == null ? null : Number(plan_id),
      seats_limit: seats_limit == null || seats_limit === '' ? null : Number(seats_limit),
      email_domains: Array.isArray(email_domains) ? email_domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean) : [],
      status: status ? String(status) : 'active',
      primary_color: primary_color ? String(primary_color) : null,
    });
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'institution_create',
      targetType: 'institution',
      targetId: institution.id,
      details: { name: institution.name },
    });
    res.status(201).json({ institution });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create institution' });
  }
});

router.put('/institutions/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid institution id' });
      return;
    }
    const { name, plan_id, seats_limit, email_domains, status, primary_color, feature_overrides } = req.body as Record<string, unknown>;
    const updated = await updateInstitution(id, {
      name: name !== undefined ? String(name) : undefined,
      plan_id: plan_id !== undefined ? (plan_id == null ? null : Number(plan_id)) : undefined,
      seats_limit: seats_limit !== undefined ? (seats_limit == null || seats_limit === '' ? null : Number(seats_limit)) : undefined,
      email_domains: email_domains !== undefined && Array.isArray(email_domains)
        ? email_domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
        : undefined,
      status: status !== undefined ? String(status) : undefined,
      primary_color: primary_color !== undefined ? (primary_color ? String(primary_color) : null) : undefined,
      feature_overrides: (feature_overrides && typeof feature_overrides === 'object')
        ? (feature_overrides as Record<string, boolean | null>)
        : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'institution_update',
      targetType: 'institution',
      targetId: id,
      details: { name: updated.name, status: updated.status, plan_id: updated.plan_id },
    });
    res.json({ institution: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update institution' });
  }
});

router.delete('/institutions/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid institution id' });
      return;
    }
    const result = await deleteInstitution(id);
    if (!result.ok) {
      res.status(400).json({ error: result.reason || 'Cannot delete institution' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'institution_delete',
      targetType: 'institution',
      targetId: id,
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete institution' });
  }
});

router.get('/institutions/:id/members', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid institution id' });
      return;
    }
    const institution = await getInstitutionById(id);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    res.json({ members: await listInstitutionMembers(id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load members' });
  }
});

router.post('/institutions/assign-user', async (req: Request, res: Response) => {
  try {
    const userId = Number((req.body as Record<string, unknown>).user_id);
    const institutionId = Number((req.body as Record<string, unknown>).institution_id);
    if (!Number.isFinite(userId) || !Number.isFinite(institutionId)) {
      res.status(400).json({ error: 'user_id and institution_id are required' });
      return;
    }
    const institution = await getInstitutionById(institutionId);
    if (!institution) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    const ok = await assignUserToInstitution(userId, institutionId);
    if (!ok) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await logSuperAdminAction({
      superAdminId: superAdminId(req),
      action: 'institution_assign_user',
      targetType: 'user',
      targetId: userId,
      details: { institution_id: institutionId },
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to assign user' });
  }
});

// ── #8 System health ──────────────────────────────────────────────────────────

router.get('/system-health', async (_req: Request, res: Response) => {
  try {
    res.json(await getSystemHealth());
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Health check failed' });
  }
});

export default router;
