/** API base URL — empty string uses same origin (/api) in production. */
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const APP_ENV = import.meta.env.MODE
export const IS_PRODUCTION = import.meta.env.PROD
