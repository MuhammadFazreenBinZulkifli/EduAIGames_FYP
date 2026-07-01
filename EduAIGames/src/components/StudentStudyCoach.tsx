import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { ROUTES } from '../routes/paths'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import './App_CSS/StudentStudyCoach_CSS.css'

// Shape of the AI-generated study insights returned by the backend.
interface StudyInsights {
  summary: string
  strengths: string[]
  focus_areas: string[]
  recommendations: string[]
  encouragement: string
}

interface StudentStudyCoachProps {
  studentId: number
  classId: number
  className?: string
}

// AI "Study Coach" card: on demand, analyses the student's quiz results for the
// selected class and shows encouraging, actionable feedback. Hidden entirely
// when the platform's OpenAI feature is turned off.
export default function StudentStudyCoach({ studentId, classId, className }: StudentStudyCoachProps) {
  const { features } = usePlatformFeatures()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [insights, setInsights] = useState<StudyInsights | null>(null)
  const [emptyMsg, setEmptyMsg] = useState('')
  const [requested, setRequested] = useState(false)

  // Respect the platform feature flag — no AI feature, no card.
  if (!features.openai_enabled) return null

  // Calls the study-coach endpoint and stores the structured insights.
  const fetchInsights = async () => {
    setLoading(true)
    setError('')
    setEmptyMsg('')
    setRequested(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/study-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(studentId) },
        body: JSON.stringify({ student_id: studentId, class_id: classId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
      }
      const payload = data as { insights?: StudyInsights | null; message?: string }
      // No insights means there isn't enough data yet — show the friendly hint.
      if (!payload.insights) {
        setEmptyMsg(payload.message || 'Complete a quiz to unlock your study insights.')
        setInsights(null)
      } else {
        setInsights(payload.insights)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your study insights. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="study-coach" aria-label="AI study coach">
      <div className="study-coach__head">
        <div className="study-coach__head-text">
          <span className="study-coach__badge" aria-hidden="true">AI</span>
          <div>
            <h3 className="study-coach__title">Study Coach</h3>
            <p className="study-coach__subtitle">
              Personalized tips for {className ? <strong>{className}</strong> : 'this class'} based on your quiz results.
              {' '}
              <Link to={ROUTES.student.studyCoach} className="study-coach__hub-link">
                Open full Study Coach →
              </Link>
            </p>
          </div>
        </div>
        <button
          type="button"
          className="panel-btn panel-btn-primary panel-btn-sm study-coach__btn"
          onClick={() => void fetchInsights()}
          disabled={loading}
        >
          {loading ? 'Analyzing…' : requested ? '↻ Refresh insights' : '✨ Get my insights'}
        </button>
      </div>

      {error && (
        <p className="study-coach__error" role="alert">{error}</p>
      )}

      {!error && emptyMsg && (
        <p className="study-coach__empty">{emptyMsg}</p>
      )}

      {loading && (
        <div className="study-coach__loading" aria-live="polite">
          <span className="study-coach__dot" />
          <span className="study-coach__dot" />
          <span className="study-coach__dot" />
          <span>Reviewing your performance…</span>
        </div>
      )}

      {!loading && !insights && !error && !emptyMsg && !requested && (
        <p className="study-coach__hint">
          Tap the button to see what you're doing well and what to review next.
        </p>
      )}

      {!loading && insights && (
        <div className="study-coach__result">
          <p className="study-coach__summary">{insights.summary}</p>

          <div className="study-coach__grid">
            {insights.strengths.length > 0 && (
              <div className="study-coach__col study-coach__col--strength">
                <h4>✓ Strengths</h4>
                <ul>
                  {insights.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {insights.focus_areas.length > 0 && (
              <div className="study-coach__col study-coach__col--focus">
                <h4>◎ Focus areas</h4>
                <ul>
                  {insights.focus_areas.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {insights.recommendations.length > 0 && (
            <div className="study-coach__reco">
              <h4>→ Recommended next steps</h4>
              <ul>
                {insights.recommendations.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {insights.encouragement && (
            <p className="study-coach__encourage">{insights.encouragement}</p>
          )}
        </div>
      )}
    </section>
  )
}
