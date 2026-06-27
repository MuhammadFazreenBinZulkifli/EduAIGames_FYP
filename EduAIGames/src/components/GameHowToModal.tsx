import { useEffect, type ReactNode } from 'react'
import './App_CSS/GameHowToModal_CSS.css'

export interface HowToStep {
  icon: ReactNode
  text: ReactNode
}

interface GameHowToModalProps {
  open: boolean
  /** Game display name, e.g. "Snake Quest". */
  gameName: string
  /** Short one-line summary shown under the title. */
  subtitle?: string
  /** Accent colour for the icon badge / progress accents. */
  accent?: string
  /** Emoji or icon shown in the header badge. */
  icon?: ReactNode
  steps: HowToStep[]
  /** Primary action label, e.g. "Start Game" or "Got it". */
  primaryLabel: string
  onPrimary: () => void
  /** Called when the modal is dismissed (X / backdrop / Escape). */
  onClose: () => void
  /** Current "don't show again" value. */
  dontShowAgain: boolean
  onDontShowAgainChange: (value: boolean) => void
}

/**
 * Reusable "How to Play" modal shown before a learning game starts (for both
 * students and instructors). Includes a per-game "don't show again" toggle.
 */
export default function GameHowToModal({
  open,
  gameName,
  subtitle,
  accent = '#e86a10',
  icon = '🎮',
  steps,
  primaryLabel,
  onPrimary,
  onClose,
  dontShowAgain,
  onDontShowAgainChange,
}: GameHowToModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="game-howto__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-howto-title"
      onClick={onClose}
    >
      <div className="game-howto__modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="game-howto__close" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <div className="game-howto__header">
          <span
            className="game-howto__badge"
            style={{ background: `${accent}22`, borderColor: `${accent}66`, color: accent }}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="game-howto__heading">
            <p className="game-howto__kicker">How to Play</p>
            <h2 id="game-howto-title" className="game-howto__title">{gameName}</h2>
            {subtitle && <p className="game-howto__subtitle">{subtitle}</p>}
          </div>
        </div>

        <ol className="game-howto__steps">
          {steps.map((step, i) => (
            <li key={i} className="game-howto__step">
              <span className="game-howto__step-icon" aria-hidden="true">{step.icon}</span>
              <span className="game-howto__step-text">{step.text}</span>
            </li>
          ))}
        </ol>

        <label className="game-howto__toggle">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => onDontShowAgainChange(e.target.checked)}
          />
          <span>Don&apos;t show this again for {gameName}</span>
        </label>

        <div className="game-howto__actions">
          <button
            type="button"
            className="panel-btn panel-btn-primary game-howto__primary"
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
