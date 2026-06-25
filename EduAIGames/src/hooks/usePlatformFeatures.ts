import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'

export interface PlatformFeatures {
  openai_enabled: boolean
  games_enabled: boolean
  quizzes_enabled: boolean
  chatbot_enabled: boolean
  ai_quiz_enabled: boolean
}

const DEFAULT_FEATURES: PlatformFeatures = {
  openai_enabled: true,
  games_enabled: true,
  quizzes_enabled: true,
  chatbot_enabled: true,
  ai_quiz_enabled: true,
}

let cachedFeatures: PlatformFeatures | null = null
let cachedForUserId: number | null = null
let fetchPromise: Promise<PlatformFeatures> | null = null

// Reads the signed-in user's id so feature flags resolve against their
// institution's plan + overrides (paid feature gating).
function currentUserId(): number | null {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: number }
    return typeof parsed.id === 'number' ? parsed.id : null
  } catch {
    return null
  }
}

export async function fetchPlatformFeatures(force = false): Promise<PlatformFeatures> {
  const userId = currentUserId()
  // Invalidate the cache when the active account changes.
  if (userId !== cachedForUserId) cachedFeatures = null
  if (!force && cachedFeatures) return cachedFeatures
  if (!force && fetchPromise) return fetchPromise

  const url = userId != null
    ? `${API_BASE_URL}/api/platform/features?user_id=${userId}`
    : `${API_BASE_URL}/api/platform/features`

  fetchPromise = fetch(url)
    .then(async (res) => {
      if (!res.ok) return DEFAULT_FEATURES
      const data = await res.json()
      const features: PlatformFeatures = {
        openai_enabled: data.features?.openai_enabled !== false,
        games_enabled: data.features?.games_enabled !== false,
        quizzes_enabled: data.features?.quizzes_enabled !== false,
        chatbot_enabled: data.features?.chatbot_enabled !== false,
        ai_quiz_enabled: data.features?.ai_quiz_enabled !== false,
      }
      cachedFeatures = features
      cachedForUserId = userId
      return features
    })
    .catch(() => DEFAULT_FEATURES)
    .finally(() => {
      fetchPromise = null
    })

  return fetchPromise
}

export function invalidatePlatformFeaturesCache(): void {
  cachedFeatures = null
  cachedForUserId = null
}

export function usePlatformFeatures() {
  const [features, setFeatures] = useState<PlatformFeatures>(cachedFeatures ?? DEFAULT_FEATURES)
  const [loading, setLoading] = useState(!cachedFeatures)

  useEffect(() => {
    let active = true
    void fetchPlatformFeatures().then((f) => {
      if (active) {
        setFeatures(f)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [])

  return { features, loading }
}
