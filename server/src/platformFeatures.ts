import { getPlatformSetting, getPlatformSettings } from './adminServices.ts';

export const FEATURE_KEYS = {
  openai: 'openai_enabled',
  games: 'games_enabled',
  quizzes: 'quizzes_enabled',
  chatbot: 'chatbot_enabled',
} as const;

export type PlatformFeatureFlags = {
  openai_enabled: boolean;
  games_enabled: boolean;
  quizzes_enabled: boolean;
  chatbot_enabled: boolean;
  ai_quiz_enabled: boolean;
};

export async function getPlatformFeatureFlags(): Promise<PlatformFeatureFlags> {
  const settings = await getPlatformSettings();
  return {
    openai_enabled: settings.openai_enabled !== false,
    games_enabled: settings.games_enabled !== false,
    quizzes_enabled: settings.quizzes_enabled !== false,
    chatbot_enabled: settings.chatbot_enabled !== false,
    ai_quiz_enabled: settings.ai_quiz_enabled !== false,
  };
}

export async function isFeatureEnabled(key: keyof PlatformFeatureFlags): Promise<boolean> {
  const value = await getPlatformSetting(key, true);
  return value !== false;
}
