import pool from './db.ts';

export async function ensureLoginEventsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_login_events (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      logged_in_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_login_events_logged_in_at
    ON user_login_events(logged_in_at DESC)
  `);
}

export async function recordUserLogin(userId: number, role: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_login_events (user_id, role) VALUES ($1, $2)`,
    [userId, role]
  );
}

export async function getLoginActivityByDay(days = 14): Promise<
  { label: string; date: string; students: number; instructors: number; admin: number }[]
> {
  const result = await pool.query(
    `SELECT DATE(logged_in_at AT TIME ZONE 'UTC') AS day, role, COUNT(*)::int AS count
     FROM user_login_events
     WHERE logged_in_at >= NOW() - ($1::int || ' days')::interval
     GROUP BY day, role
     ORDER BY day`,
    [days]
  );

  const now = new Date();
  const buckets: Record<string, { students: number; instructors: number; admin: number }> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { students: 0, instructors: 0, admin: 0 };
  }

  for (const row of result.rows as { day: string | Date; role: string; count: number }[]) {
    const dayKey =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10);
    if (!buckets[dayKey]) continue;
    if (row.role === 'Student') buckets[dayKey].students = row.count;
    else if (row.role === 'Instructor') buckets[dayKey].instructors = row.count;
    else if (row.role === 'Admin') buckets[dayKey].admin = row.count;
  }

  return Object.entries(buckets).map(([date, counts]) => {
    const d = new Date(date + 'T12:00:00Z');
    return {
      date,
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      ...counts,
    };
  });
}
