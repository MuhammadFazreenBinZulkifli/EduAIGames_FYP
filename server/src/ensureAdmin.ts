import bcrypt from 'bcryptjs';
import pool from './db.ts';

const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = '123456';
const ADMIN_USERNAME = 'Admin';

/** Ensure user_role enum includes Admin and default admin account exists. */
export async function ensureAdminRoleAndUser(): Promise<void> {
  await pool.query(`
    DO $$ BEGIN
      ALTER TYPE user_role ADD VALUE 'Admin';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);

  if ((existing.rows as { id: number }[]).length === 0) {
    await pool.query(
      `INSERT INTO users (username, email, password, role, account_status)
       VALUES ($1, $2, $3, $4, 'approved')`,
      [ADMIN_USERNAME, ADMIN_EMAIL, hash, 'Admin']
    );
    console.log(`Admin account created: ${ADMIN_EMAIL}`);
  } else {
    await pool.query(
      `UPDATE users SET username = $1, password = $2, role = $3, account_status = 'approved' WHERE email = $4`,
      [ADMIN_USERNAME, hash, 'Admin', ADMIN_EMAIL]
    );
    console.log(`Admin account updated: ${ADMIN_EMAIL}`);
  }
}
