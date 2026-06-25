import express from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.ts';

const router = express.Router();

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4 MB base64 ceiling

// Get a user's public profile
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.userId);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
    const result = await pool.query(
      `SELECT id, username, email, role, avatar_url FROM users WHERE id = $1`,
      [id]
    );
    const user = (result.rows as any[])[0];
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ profile: user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch profile' });
  }
});

// Update username and/or avatar_url
router.put('/:userId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.userId);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
    const { username, avatar_url } = req.body as { username?: string; avatar_url?: string | null };

    if (avatar_url && avatar_url.length > MAX_AVATAR_BYTES) {
      res.status(400).json({ error: 'Avatar image is too large. Please use a smaller image.' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [id];
    let idx = 2;

    if (username !== undefined) {
      const trimmed = String(username).trim();
      if (!trimmed) { res.status(400).json({ error: 'Username cannot be empty' }); return; }
      updates.push(`username = $${idx++}`);
      values.push(trimmed);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $1
       RETURNING id, username, email, role, avatar_url`,
      values
    );
    res.json({ profile: (result.rows as any[])[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update profile' });
  }
});

// Change password — requires old password verification
router.post('/:userId/change-password', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.userId);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid user id' }); return; }
    const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Old password and new password are required' });
      return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    const result = await pool.query('SELECT password FROM users WHERE id = $1', [id]);
    const user = (result.rows as any[])[0];
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $2 WHERE id = $1', [id, hashed]);

    res.json({ message: 'Password changed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password' });
  }
});

export default router;
