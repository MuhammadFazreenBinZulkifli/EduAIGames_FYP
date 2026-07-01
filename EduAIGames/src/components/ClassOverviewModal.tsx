import { useEffect } from 'react'
import './App_CSS/ClassOverviewModal_CSS.css'

export interface ClassOverviewResult {
  headline: string
  summary: string
  your_progress: string
  class_snapshot: string
  next_steps: string[]
  sparse_note?: string
}

interface ClassOverviewModalProps {
  open: boolean
  classTitle: string
  loading: boolean
  error: string
  overview: ClassOverviewResult | null
  isSparse: boolean
  onClose: () => void
}

export default function ClassOverviewModal({
  open,
  classTitle,
  loading,
  error,
  overview,
  isSparse,
  onClose,
}: ClassOverviewModalProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, loading, onClose])

  if (!open) return null

  return (
    <div
      className="class-overview__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-overview-title"
      onClick={loading ? undefined : onClose}
    >
      <div className="class-overview__modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="class-overview__close"
          aria-label="Close"
          onClick={onClose}
          disabled={loading}
        >
          ×
        </button>

        <header className="class-overview__header">
          <span className="class-overview__badge" aria-hidden="true">AI</span>
          <div className="class-overview__heading">
            <p className="class-overview__kicker">Class analysis</p>
            <h2 id="class-overview-title" className="class-overview__title">
              {overview?.headline || classTitle}
            </h2>
            <p className="class-overview__subtitle">{classTitle}</p>
          </div>
        </header>

        <div className="class-overview__body">
          {loading && (
            <div className="class-overview__loading" aria-live="polite">
              <div className="class-overview__loader-bar">
                <div className="class-overview__loader-fill" />
              </div>
              <p>Reading class content and your progress…</p>
            </div>
          )}

          {error && !loading && (
            <div className="class-overview__error" role="alert">
              {error}
            </div>
          )}

          {overview && !loading && !error && (
            <>
              {isSparse && overview.sparse_note && (
                <div className="class-overview__notice" role="status">
                  {overview.sparse_note}
                </div>
              )}

              <section className="class-overview__section">
                <h3>Overview</h3>
                <p>{overview.summary}</p>
              </section>

              <section className="class-overview__section">
                <h3>Your progress</h3>
                <p>{overview.your_progress}</p>
              </section>

              <section className="class-overview__section">
                <h3>Class snapshot</h3>
                <p>{overview.class_snapshot}</p>
              </section>

              {overview.next_steps.length > 0 && (
                <section className="class-overview__section">
                  <h3>Suggested next steps</h3>
                  <ul className="class-overview__steps">
                    {overview.next_steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="class-overview__footer">
          <button
            type="button"
            className="panel-btn panel-btn-secondary class-overview__done"
            onClick={onClose}
            disabled={loading}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
