import type { Request, Response, NextFunction } from 'express';
import { isFeatureEnabled, type PlatformFeatureFlags } from './platformFeatures.ts';
import { resolveUserFeatures } from './institutionServices.ts';

const MESSAGES: Record<keyof PlatformFeatureFlags, string> = {
  openai_enabled: 'OpenAI features are currently disabled for your institution.',
  games_enabled: 'Games are not available on your institution\u2019s current plan.',
  quizzes_enabled: 'Quizzes are not available on your institution\u2019s current plan.',
  chatbot_enabled: 'The AI chatbot is not available on your institution\u2019s current plan.',
  ai_quiz_enabled: 'AI Quiz generation is not available on your institution\u2019s current plan.',
};

// Best-effort extraction of the requesting user's id so feature checks can be
// resolved against that user's institution. Falls back to platform-wide flags.
function resolveRequestUserId(req: Request): number | null {
  const candidates = [
    req.headers['x-user-id'],
    req.headers['x-admin-id'],
    (req.body as Record<string, unknown> | undefined)?.user_id,
    (req.body as Record<string, unknown> | undefined)?.student_id,
    (req.body as Record<string, unknown> | undefined)?.instructor_id,
    req.query?.user_id,
    req.query?.student_id,
    req.query?.instructor_id,
  ];
  for (const candidate of candidates) {
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

export function requireFeature(feature: keyof PlatformFeatureFlags) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = resolveRequestUserId(req);
      let enabled: boolean;
      if (userId != null) {
        const features = await resolveUserFeatures(userId);
        enabled = features[feature] !== false;
      } else {
        enabled = await isFeatureEnabled(feature);
      }
      if (!enabled) {
        res.status(503).json({
          error: MESSAGES[feature],
          code: 'FEATURE_DISABLED',
          feature,
        });
        return;
      }
      next();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Feature check failed';
      res.status(500).json({ error: message });
    }
  };
}
