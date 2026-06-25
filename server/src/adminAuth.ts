import type { Request, Response, NextFunction } from 'express';
import pool from './db.ts';

export function isAdminRole(role: string): boolean {
  return role === 'Admin' || role === 'SuperAdmin';
}

export function isSuperAdminRole(role: string): boolean {
  return role === 'SuperAdmin';
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers['x-admin-id'] ?? req.body?.admin_id ?? req.query?.admin_id;
    const adminId = Number(raw);
    if (!Number.isFinite(adminId)) {
      res.status(401).json({ error: 'Admin authentication required (x-admin-id)' });
      return;
    }

    const result = await pool.query(
      'SELECT id, role, username, email FROM users WHERE id = $1',
      [adminId]
    );
    const user = (result.rows as { id: number; role: string; username: string; email: string }[])[0];
    if (!user || !isAdminRole(user.role)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    (req as Request & { adminId: number; adminRole: string }).adminId = user.id;
    (req as Request & { adminId: number; adminRole: string }).adminRole = user.role;
    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Auth check failed';
    res.status(500).json({ error: message });
  }
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers['x-admin-id'] ?? req.body?.admin_id ?? req.query?.admin_id;
    const adminId = Number(raw);
    if (!Number.isFinite(adminId)) {
      res.status(401).json({ error: 'Super Admin authentication required (x-admin-id)' });
      return;
    }

    const result = await pool.query(
      'SELECT id, role, username, email FROM users WHERE id = $1',
      [adminId]
    );
    const user = (result.rows as { id: number; role: string; username: string; email: string }[])[0];
    if (!user || !isSuperAdminRole(user.role)) {
      res.status(403).json({ error: 'Super Admin access required' });
      return;
    }

    (req as Request & { adminId: number; adminRole: string }).adminId = user.id;
    (req as Request & { adminId: number; adminRole: string }).adminRole = user.role;
    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Auth check failed';
    res.status(500).json({ error: message });
  }
}
