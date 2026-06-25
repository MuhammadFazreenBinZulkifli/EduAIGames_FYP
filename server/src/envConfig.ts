import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '';
  return raw
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function resolveFrontendDist(): string | null {
  const candidates = [
    process.env.FRONTEND_DIST_PATH,
    path.resolve(__dirname, '../../EduAIGames/dist'),
    path.resolve(__dirname, '../public'),
  ].filter((value): value is string => Boolean(value));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }

  return null;
}

export function shouldServeFrontend(frontendDist: string | null): boolean {
  if (process.env.SERVE_FRONTEND === 'true') return true;
  if (process.env.SERVE_FRONTEND === 'false') return false;
  return IS_PRODUCTION && frontendDist !== null;
}
