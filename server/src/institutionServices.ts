import pool from './db.ts';
import { getPlatformFeatureFlags, type PlatformFeatureFlags } from './platformFeatures.ts';

// Feature keys that can be gated per institution / plan.
export const INSTITUTION_FEATURE_KEYS: (keyof PlatformFeatureFlags)[] = [
  'openai_enabled',
  'games_enabled',
  'quizzes_enabled',
  'chatbot_enabled',
  'ai_quiz_enabled',
];

export type FeatureSet = PlatformFeatureFlags;
// feature_overrides values: true = force on, false = force off, missing key = inherit from plan
export type FeatureOverrides = Partial<Record<keyof PlatformFeatureFlags, boolean>>;

export interface PlanRow {
  id: number;
  name: string;
  price: number;
  features: FeatureSet;
  is_default: boolean;
}

export interface InstitutionRow {
  id: number;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'trial';
  plan_id: number | null;
  seats_limit: number | null;
  email_domains: string[];
  feature_overrides: FeatureOverrides;
  primary_color: string | null;
  logo_url: string | null;
  is_default: boolean;
  created_at: string;
}

const DEFAULT_FEATURE_SET: FeatureSet = {
  openai_enabled: true,
  games_enabled: true,
  quizzes_enabled: true,
  chatbot_enabled: true,
  ai_quiz_enabled: true,
};

// Plan templates seeded on first boot. Higher tiers unlock more (paid) features.
const SEED_PLANS: { name: string; price: number; is_default: boolean; features: FeatureSet }[] = [
  {
    name: 'Free',
    price: 0,
    is_default: true,
    features: { openai_enabled: false, games_enabled: true, quizzes_enabled: true, chatbot_enabled: false, ai_quiz_enabled: false },
  },
  {
    name: 'Standard',
    price: 49,
    is_default: false,
    features: { openai_enabled: true, games_enabled: true, quizzes_enabled: true, chatbot_enabled: true, ai_quiz_enabled: false },
  },
  {
    name: 'Premium',
    price: 99,
    is_default: false,
    features: { openai_enabled: true, games_enabled: true, quizzes_enabled: true, chatbot_enabled: true, ai_quiz_enabled: true },
  },
];

function normalizeFeatureSet(value: unknown): FeatureSet {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    openai_enabled: v.openai_enabled !== false,
    games_enabled: v.games_enabled !== false,
    quizzes_enabled: v.quizzes_enabled !== false,
    chatbot_enabled: v.chatbot_enabled !== false,
    ai_quiz_enabled: v.ai_quiz_enabled !== false,
  };
}

function normalizeOverrides(value: unknown): FeatureOverrides {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out: FeatureOverrides = {};
  for (const key of INSTITUTION_FEATURE_KEYS) {
    if (typeof v[key] === 'boolean') out[key] = v[key] as boolean;
  }
  return out;
}

function mapPlan(row: any): PlanRow {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    features: normalizeFeatureSet(row.features),
    is_default: !!row.is_default,
  };
}

function mapInstitution(row: any): InstitutionRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    plan_id: row.plan_id ?? null,
    seats_limit: row.seats_limit ?? null,
    email_domains: Array.isArray(row.email_domains) ? row.email_domains : [],
    feature_overrides: normalizeOverrides(row.feature_overrides),
    primary_color: row.primary_color ?? null,
    logo_url: row.logo_url ?? null,
    is_default: !!row.is_default,
    created_at: row.created_at,
  };
}

// Creates plan/institution tables, seeds defaults, and links existing users.
export async function ensureInstitutionInfrastructure(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      features JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS institutions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
      seats_limit INTEGER,
      email_domains TEXT[] NOT NULL DEFAULT '{}',
      feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
      primary_color VARCHAR(20),
      logo_url TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed plans.
  for (const plan of SEED_PLANS) {
    await pool.query(
      `INSERT INTO plans (name, price, features, is_default)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (name) DO NOTHING`,
      [plan.name, plan.price, JSON.stringify(plan.features), plan.is_default]
    );
  }

  // Ensure a default institution exists (links pre-existing data).
  const defaultPlan = await pool.query(`SELECT id FROM plans ORDER BY price DESC LIMIT 1`);
  const premiumPlanId = (defaultPlan.rows as { id: number }[])[0]?.id ?? null;

  const existingDefault = await pool.query(`SELECT id FROM institutions WHERE is_default = TRUE LIMIT 1`);
  let defaultInstitutionId = (existingDefault.rows as { id: number }[])[0]?.id;
  if (!defaultInstitutionId) {
    const inserted = await pool.query(
      `INSERT INTO institutions (name, slug, status, plan_id, is_default)
       VALUES ($1, $2, 'active', $3, TRUE)
       ON CONFLICT (slug) DO UPDATE SET is_default = TRUE
       RETURNING id`,
      ['Default Institution', 'default', premiumPlanId]
    );
    defaultInstitutionId = (inserted.rows as { id: number }[])[0]?.id;
  }

  // Link users to an institution; backfill existing accounts to the default institution.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL`);
  if (defaultInstitutionId) {
    await pool.query(`UPDATE users SET institution_id = $1 WHERE institution_id IS NULL`, [defaultInstitutionId]);
    // New accounts default to the default institution unless reassigned.
    await pool.query(`ALTER TABLE users ALTER COLUMN institution_id SET DEFAULT ${Number(defaultInstitutionId)}`);
  }
}

export async function listPlans(): Promise<PlanRow[]> {
  const result = await pool.query(`SELECT * FROM plans ORDER BY price ASC`);
  return (result.rows as any[]).map(mapPlan);
}

export async function listInstitutions(): Promise<(InstitutionRow & {
  plan_name: string | null;
  member_count: number;
  student_count: number;
  instructor_count: number;
  effective_features: FeatureSet;
})[]> {
  const result = await pool.query(`
    SELECT i.*, p.name AS plan_name, p.features AS plan_features,
      (SELECT COUNT(*)::int FROM users u WHERE u.institution_id = i.id AND u.role IN ('Student','Instructor')) AS member_count,
      (SELECT COUNT(*)::int FROM users u WHERE u.institution_id = i.id AND u.role = 'Student') AS student_count,
      (SELECT COUNT(*)::int FROM users u WHERE u.institution_id = i.id AND u.role = 'Instructor') AS instructor_count
    FROM institutions i
    LEFT JOIN plans p ON p.id = i.plan_id
    ORDER BY i.is_default DESC, i.name ASC
  `);
  const globalFlags = await getPlatformFeatureFlags();
  return (result.rows as any[]).map((row) => {
    const inst = mapInstitution(row);
    const planFeatures = normalizeFeatureSet(row.plan_features);
    return {
      ...inst,
      plan_name: row.plan_name ?? null,
      member_count: row.member_count ?? 0,
      student_count: row.student_count ?? 0,
      instructor_count: row.instructor_count ?? 0,
      effective_features: computeEffectiveFeatures(globalFlags, planFeatures, inst.feature_overrides),
    };
  });
}

export async function getInstitutionById(id: number): Promise<InstitutionRow | null> {
  const result = await pool.query(`SELECT * FROM institutions WHERE id = $1`, [id]);
  const row = (result.rows as any[])[0];
  return row ? mapInstitution(row) : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || `inst-${Date.now()}`;
}

export async function createInstitution(input: {
  name: string;
  plan_id?: number | null;
  seats_limit?: number | null;
  email_domains?: string[];
  status?: string;
  primary_color?: string | null;
}): Promise<InstitutionRow> {
  let slug = slugify(input.name);
  const dup = await pool.query(`SELECT 1 FROM institutions WHERE slug = $1`, [slug]);
  if ((dup.rows as unknown[]).length > 0) slug = `${slug}-${Date.now().toString(36)}`;

  let planId = input.plan_id ?? null;
  if (planId == null) {
    const def = await pool.query(`SELECT id FROM plans WHERE is_default = TRUE LIMIT 1`);
    planId = (def.rows as { id: number }[])[0]?.id ?? null;
  }

  const status = ['active', 'suspended', 'trial'].includes(String(input.status)) ? input.status : 'active';
  const result = await pool.query(
    `INSERT INTO institutions (name, slug, status, plan_id, seats_limit, email_domains, primary_color)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.name.trim(),
      slug,
      status,
      planId,
      input.seats_limit ?? null,
      input.email_domains ?? [],
      input.primary_color ?? null,
    ]
  );
  return mapInstitution((result.rows as any[])[0]);
}

export async function updateInstitution(
  id: number,
  updates: {
    name?: string;
    plan_id?: number | null;
    seats_limit?: number | null;
    email_domains?: string[];
    status?: string;
    primary_color?: string | null;
    feature_overrides?: Record<string, boolean | null>;
  }
): Promise<InstitutionRow | null> {
  const existing = await getInstitutionById(id);
  if (!existing) return null;

  // Merge feature overrides: boolean sets, null clears (inherit plan).
  let overrides = { ...existing.feature_overrides };
  if (updates.feature_overrides && typeof updates.feature_overrides === 'object') {
    for (const key of INSTITUTION_FEATURE_KEYS) {
      if (key in updates.feature_overrides) {
        const val = updates.feature_overrides[key];
        if (val === null) delete overrides[key];
        else if (typeof val === 'boolean') overrides[key] = val;
      }
    }
  }

  const name = updates.name?.trim() ?? existing.name;
  const planId = updates.plan_id !== undefined ? updates.plan_id : existing.plan_id;
  const seats = updates.seats_limit !== undefined ? updates.seats_limit : existing.seats_limit;
  const domains = updates.email_domains !== undefined ? updates.email_domains : existing.email_domains;
  const status = updates.status && ['active', 'suspended', 'trial'].includes(updates.status) ? updates.status : existing.status;
  const color = updates.primary_color !== undefined ? updates.primary_color : existing.primary_color;

  const result = await pool.query(
    `UPDATE institutions
     SET name = $1, plan_id = $2, seats_limit = $3, email_domains = $4, status = $5,
         primary_color = $6, feature_overrides = $7::jsonb, updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [name, planId, seats, domains, status, color, JSON.stringify(overrides), id]
  );
  return mapInstitution((result.rows as any[])[0]);
}

export async function deleteInstitution(id: number): Promise<{ ok: boolean; reason?: string }> {
  const inst = await getInstitutionById(id);
  if (!inst) return { ok: false, reason: 'Institution not found' };
  if (inst.is_default) return { ok: false, reason: 'The default institution cannot be deleted' };

  // Move any members back to the default institution to avoid orphaning accounts.
  const def = await pool.query(`SELECT id FROM institutions WHERE is_default = TRUE LIMIT 1`);
  const defaultId = (def.rows as { id: number }[])[0]?.id ?? null;
  if (defaultId) {
    await pool.query(`UPDATE users SET institution_id = $1 WHERE institution_id = $2`, [defaultId, id]);
  }
  await pool.query(`DELETE FROM institutions WHERE id = $1`, [id]);
  return { ok: true };
}

export async function listInstitutionMembers(id: number) {
  const result = await pool.query(
    `SELECT id, username, email, role, account_status, created_at
     FROM users WHERE institution_id = $1 AND role IN ('Student','Instructor','Admin')
     ORDER BY role, username`,
    [id]
  );
  return result.rows;
}

export async function assignUserToInstitution(userId: number, institutionId: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users SET institution_id = $1 WHERE id = $2 RETURNING id`,
    [institutionId, userId]
  );
  return (result.rows as unknown[]).length > 0;
}

function computeEffectiveFeatures(
  globalFlags: PlatformFeatureFlags,
  planFeatures: FeatureSet,
  overrides: FeatureOverrides
): FeatureSet {
  const out = { ...DEFAULT_FEATURE_SET };
  for (const key of INSTITUTION_FEATURE_KEYS) {
    const planValue = planFeatures[key] !== false;
    const overridden = key in overrides ? overrides[key] === true : planValue;
    // A platform-wide kill switch always wins.
    out[key] = globalFlags[key] !== false && overridden;
  }
  return out;
}

// Resolves the live feature set for one institution (plan + overrides + global kill switch).
export async function resolveInstitutionFeatures(institutionId: number | null | undefined): Promise<FeatureSet> {
  const globalFlags = await getPlatformFeatureFlags();
  if (institutionId == null) return globalFlags;

  const result = await pool.query(
    `SELECT i.feature_overrides, p.features AS plan_features
     FROM institutions i LEFT JOIN plans p ON p.id = i.plan_id
     WHERE i.id = $1`,
    [institutionId]
  );
  const row = (result.rows as any[])[0];
  if (!row) return globalFlags;
  return computeEffectiveFeatures(globalFlags, normalizeFeatureSet(row.plan_features), normalizeOverrides(row.feature_overrides));
}

// Resolves the live feature set for a specific user based on their institution.
export async function resolveUserFeatures(userId: number | null | undefined): Promise<FeatureSet> {
  if (userId == null) return getPlatformFeatureFlags();
  const result = await pool.query(`SELECT institution_id FROM users WHERE id = $1`, [userId]);
  const row = (result.rows as { institution_id: number | null }[])[0];
  if (!row) return getPlatformFeatureFlags();
  return resolveInstitutionFeatures(row.institution_id);
}

// Returns the institution status for a user (used to block suspended tenants at login).
export async function getUserInstitutionContext(userId: number): Promise<{
  institution_id: number | null;
  institution_name: string | null;
  status: string | null;
  plan_name: string | null;
} | null> {
  const result = await pool.query(
    `SELECT u.institution_id, i.name AS institution_name, i.status, p.name AS plan_name
     FROM users u
     LEFT JOIN institutions i ON i.id = u.institution_id
     LEFT JOIN plans p ON p.id = i.plan_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = (result.rows as any[])[0];
  if (!row) return null;
  return {
    institution_id: row.institution_id ?? null,
    institution_name: row.institution_name ?? null,
    status: row.status ?? null,
    plan_name: row.plan_name ?? null,
  };
}
