import pool from './db.ts';

export type GameType = 'maze' | 'snake' | 'breakout' | 'race';

export const GAME_TYPES: GameType[] = ['maze', 'snake', 'breakout', 'race'];

export interface Game {
  id?: number;
  instructor_id: number;
  quiz_id: number;
  title: string;
  description: string;
  ghost_enabled: boolean;
  game_type: GameType;
  settings: string; // JSON string for game-specific settings
  created_at?: string;
  updated_at?: string;
  quiz_title?: string;
}

export interface ClassGameRow {
  id: number;
  class_game_id: number;
  class_id: number;
  game_id: number;
  published_at: string;
  game_title: string;
  description: string;
  ghost_enabled: boolean;
  game_type: GameType;
  settings: string;
  quiz_id: number;
  quiz_title: string;
}

export async function ensureGameTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id           SERIAL PRIMARY KEY,
      instructor_id INTEGER NOT NULL,
      quiz_id       INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      title         VARCHAR(255) NOT NULL,
      description   TEXT DEFAULT '',
      ghost_enabled BOOLEAN DEFAULT FALSE,
      game_type     VARCHAR(20) DEFAULT 'maze',
      settings      TEXT DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add columns for existing tables that may not have them yet
  await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) DEFAULT 'maze'`);
  await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS settings TEXT DEFAULT '{}'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_games (
      id           SERIAL PRIMARY KEY,
      class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      published_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(class_id, game_id)
    )
  `);
}

export async function createGame(game: Omit<Game, 'id' | 'created_at' | 'updated_at'>): Promise<Game> {
  const result = await pool.query(
    `INSERT INTO games (instructor_id, quiz_id, title, description, ghost_enabled, game_type, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [game.instructor_id, game.quiz_id, game.title, game.description, game.ghost_enabled, game.game_type || 'maze', game.settings || '{}']
  );
  return (result.rows as any[])[0] as Game;
}

export async function getGamesByInstructor(instructorId: number): Promise<Game[]> {
  const result = await pool.query(
    `SELECT g.*, q.title AS quiz_title
     FROM games g
     LEFT JOIN quizzes q ON q.id = g.quiz_id
     WHERE g.instructor_id = $1
     ORDER BY g.created_at DESC`,
    [instructorId]
  );
  return result.rows as Game[];
}

export async function getGameById(gameId: number): Promise<Game | null> {
  const result = await pool.query(
    `SELECT g.*, q.title AS quiz_title
     FROM games g
     LEFT JOIN quizzes q ON q.id = g.quiz_id
     WHERE g.id = $1`,
    [gameId]
  );
  const rows = result.rows as any[];
  return rows.length > 0 ? (rows[0] as Game) : null;
}

export async function updateGame(
  gameId: number,
  instructorId: number,
  data: Pick<Game, 'title' | 'description' | 'ghost_enabled' | 'settings'>
): Promise<Game> {
  const settings = data.settings ?? '{}';
  const result = await pool.query(
    `UPDATE games
     SET title = $1, description = $2, ghost_enabled = $3, settings = $4, updated_at = NOW()
     WHERE id = $5 AND instructor_id = $6
     RETURNING *`,
    [data.title, data.description, data.ghost_enabled, settings, gameId, instructorId]
  );
  const rows = result.rows as any[];
  if (rows.length === 0) throw new Error('Game not found or you do not own it');
  return rows[0] as Game;
}

export async function deleteGame(gameId: number, instructorId: number): Promise<void> {
  const result = await pool.query(
    'DELETE FROM games WHERE id = $1 AND instructor_id = $2',
    [gameId, instructorId]
  );
  if ((result as any).rowCount === 0) throw new Error('Game not found or you do not own it');
}

export async function publishGameToClass(classId: number, gameId: number): Promise<void> {
  await pool.query(
    `INSERT INTO class_games (class_id, game_id)
     VALUES ($1, $2)
     ON CONFLICT (class_id, game_id) DO UPDATE SET published_at = NOW()`,
    [classId, gameId]
  );
}

export async function unpublishGameFromClass(
  classGameId: number,
  instructorId: number
): Promise<void> {
  await pool.query(
    `DELETE FROM class_games cg
     USING games g
     WHERE cg.id = $1 AND cg.game_id = g.id AND g.instructor_id = $2`,
    [classGameId, instructorId]
  );
}

export async function getPublishedGamesForInstructor(
  classId: number,
  instructorId: number
): Promise<ClassGameRow[]> {
  const result = await pool.query(
    `SELECT cg.id AS class_game_id, cg.published_at,
            g.id AS game_id, g.title AS game_title,
            g.description, g.ghost_enabled, g.game_type, g.settings, g.quiz_id,
            q.title AS quiz_title
     FROM class_games cg
     JOIN games g   ON g.id  = cg.game_id
     JOIN quizzes q ON q.id  = g.quiz_id
     JOIN classes c ON c.id  = cg.class_id
     WHERE cg.class_id = $1 AND c.instructor_id = $2
     ORDER BY cg.published_at DESC`,
    [classId, instructorId]
  );
  return result.rows as ClassGameRow[];
}

export async function getPublishedGamesForStudent(
  classId: number,
  studentId: number
): Promise<ClassGameRow[]> {
  const mem = await pool.query(
    'SELECT id FROM class_memberships WHERE class_id = $1 AND student_id = $2',
    [classId, studentId]
  );
  if ((mem.rows as any[]).length === 0) {
    throw new Error('You are not enrolled in this class');
  }
  const result = await pool.query(
    `SELECT cg.id AS class_game_id,
            g.id AS game_id, g.title AS game_title,
            g.description, g.ghost_enabled, g.game_type, g.settings, g.quiz_id,
            q.title AS quiz_title
     FROM class_games cg
     JOIN games g   ON g.id  = cg.game_id
     JOIN quizzes q ON q.id  = g.quiz_id
     WHERE cg.class_id = $1
     ORDER BY cg.published_at DESC`,
    [classId]
  );
  return result.rows as ClassGameRow[];
}
