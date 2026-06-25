import pool from './db.ts';

export type AccountStatus = 'pending' | 'approved' | 'rejected';

export async function ensureUserAccountStatusColumn(): Promise<void> {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'approved'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status)
  `);
  await pool.query(`
    UPDATE users SET account_status = 'approved'
    WHERE account_status IS NULL OR account_status = ''
  `);
}

export interface PendingUserRecord {
  id: number;
  username: string;
  email: string;
  role: string;
}

export async function getPendingUserById(userId: number): Promise<PendingUserRecord | null> {
  const result = await pool.query(
    `SELECT id, username, email, role
     FROM users
     WHERE id = $1 AND role NOT IN ('Admin', 'SuperAdmin') AND account_status = 'pending'`,
    [userId]
  );
  return (result.rows as PendingUserRecord[])[0] ?? null;
}

export async function approveUserAccount(userId: number): Promise<PendingUserRecord | null> {
  const result = await pool.query(
    `UPDATE users SET account_status = 'approved'
     WHERE id = $1 AND role NOT IN ('Admin', 'SuperAdmin') AND account_status = 'pending'
     RETURNING id, username, email, role`,
    [userId]
  );
  return (result.rows as PendingUserRecord[])[0] ?? null;
}

export async function rejectPendingUser(userId: number): Promise<PendingUserRecord | null> {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id = $1 AND role NOT IN ('Admin', 'SuperAdmin') AND account_status = 'pending'
     RETURNING id, username, email, role`,
    [userId]
  );
  return (result.rows as PendingUserRecord[])[0] ?? null;
}

export async function getPendingUsers(): Promise<
  { id: number; username: string; email: string; role: string; created_at: string }[]
> {
  const result = await pool.query(
    `SELECT id, username, email, role, created_at
     FROM users
     WHERE account_status = 'pending' AND role NOT IN ('Admin', 'SuperAdmin')
     ORDER BY created_at ASC`
  );
  return result.rows as any[];
}
