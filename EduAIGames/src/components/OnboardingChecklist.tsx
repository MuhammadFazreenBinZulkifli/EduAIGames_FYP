import './App_CSS/OnboardingChecklist_CSS.css'

export interface OnboardingStep {
  id: string
  label: string
  hint: string
  done: boolean
  action?: () => void
  actionLabel?: string
}

interface OnboardingChecklistProps {
  title: string
  subtitle: string
  steps: OnboardingStep[]
}

// Guided setup steps for new students or instructors on the dashboard.
export default function OnboardingChecklist({ title, subtitle, steps }: OnboardingChecklistProps) {
  const completed = steps.filter((s) => s.done).length
  const allDone = completed === steps.length
  const progress = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0

  // Hide the checklist once every setup step is complete.
  if (allDone) return null

  return (
    <section className="dash-onboarding" aria-labelledby="onboarding-heading">
      <div className="dash-onboarding__header">
        <div>
          <p className="dash-onboarding__eyebrow">Getting started</p>
          <h2 id="onboarding-heading" className="dash-onboarding__title">{title}</h2>
          <p className="dash-onboarding__subtitle">{subtitle}</p>
        </div>
        <div className="dash-onboarding__progress-wrap">
          <span className="dash-onboarding__progress-label">{completed}/{steps.length} done</span>
          <div className="dash-onboarding__progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="dash-onboarding__progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <ol className="dash-onboarding__list">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`dash-onboarding__step${step.done ? ' dash-onboarding__step--done' : ''}${!step.done && steps.slice(0, index).every((s) => s.done) ? ' dash-onboarding__step--current' : ''}`}
          >
            <span className="dash-onboarding__step-marker" aria-hidden="true">
              {step.done ? '✓' : index + 1}
            </span>
            <div className="dash-onboarding__step-body">
              <p className="dash-onboarding__step-label">{step.label}</p>
              <p className="dash-onboarding__step-hint">{step.hint}</p>
            </div>
            {!step.done && step.action && step.actionLabel && (
              <button type="button" className="panel-btn panel-btn-primary panel-btn-sm" onClick={step.action}>
                {step.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
