import bcrypt from 'bcryptjs';
import pool from './db.ts';

const SUPER_ADMIN_EMAIL = 'superadmin@admin.com';
const SUPER_ADMIN_PASSWORD = '123456';
const SUPER_ADMIN_USERNAME = 'Super Admin';

/** Ensure user_role enum includes SuperAdmin and default super admin account exists. */
export async function ensureSuperAdminRoleAndUser(): Promise<void> {
  await pool.query(`
    DO $$ BEGIN
      ALTER TYPE user_role ADD VALUE 'SuperAdmin';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  const hash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [SUPER_ADMIN_EMAIL]);

  if ((existing.rows as { id: number }[]).length === 0) {
    await pool.query(
      `INSERT INTO users (username, email, password, role, account_status)
       VALUES ($1, $2, $3, $4, 'approved')`,
      [SUPER_ADMIN_USERNAME, SUPER_ADMIN_EMAIL, hash, 'SuperAdmin']
    );
    console.log(`Super Admin account created: ${SUPER_ADMIN_EMAIL}`);
  } else {
    await pool.query(
      `UPDATE users SET username = $1, password = $2, role = $3, account_status = 'approved' WHERE email = $4`,
      [SUPER_ADMIN_USERNAME, hash, 'SuperAdmin', SUPER_ADMIN_EMAIL]
    );
    console.log(`Super Admin account updated: ${SUPER_ADMIN_EMAIL}`);
  }
}
