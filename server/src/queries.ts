import pool from './db.ts';
import type { AccountStatus } from './userAccountStatus.ts';

export async function initializeDatabase() {
  // Tables are now created in setupDatabase.ts
  console.log('Database already initialized');
}

export async function getAllUsers() {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, account_status, created_at
       FROM users ORDER BY created_at DESC`
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

export async function createUser(
  username: string,
  email: string,
  hashedPassword: string,
  role: string,
  accountStatus: AccountStatus = 'approved'
) {
  try {
    const insertResult = await pool.query(
      `INSERT INTO users (username, email, password, role, account_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, account_status, created_at`,
      [username, email, hashedPassword, role, accountStatus]
    );
    return (insertResult.rows as any[])[0];
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error('Email already exists');
    }
    console.error('Error creating user:', error);
    throw error;
  }
}

export interface BulkUserRow {
  username: string;
  email: string;
  password: string;
  role: 'Instructor' | 'Student';
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; email: string; message: string }[];
  createdUsers: { id: number; username: string; email: string; role: string }[];
}

export async function bulkImportUsers(
  rows: BulkUserRow[],
  hashPassword: (plain: string) => Promise<string>
): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    createdUsers: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      const existing = await getUserByEmail(row.email);
      if (existing) {
        result.skipped++;
        continue;
      }
      const hashed = await hashPassword(row.password);
      const user = await createUser(row.username, row.email, hashed, row.role, 'approved');
      result.created++;
      result.createdUsers.push(user);
    } catch (err: unknown) {
      result.failed++;
      result.errors.push({
        row: rowNum,
        email: row.email,
        message: err instanceof Error ? err.message : 'Failed to create user',
      });
    }
  }

  return result;
}

export async function updateUserPasswordByEmail(email: string, hashedPassword: string) {
  try {
    const result = await pool.query(
      `UPDATE users
       SET password = $1
       WHERE email = $2
       RETURNING id, username, email, role, created_at`,
      [hashedPassword, email]
    );
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error updating user password:', error);
    throw error;
  }
}
