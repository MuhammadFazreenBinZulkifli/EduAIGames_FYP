import { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import './App_CSS/ChangePasswordModal_CSS.css'

interface ChangePasswordModalProps {
  userId: number
  onClose: () => void
}

type Step = 'form' | 'success'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 6 characters', ok: password.length >= 6 },
    { label: 'At least one number', ok: /\d/.test(password) },
    { label: 'At least one letter', ok: /[a-zA-Z]/.test(password) },
  ]
  const score = checks.filter((c) => c.ok).length
  const colors = ['', '#ef4444', '#f59e0b', '#22c55e']
  const labels = ['', 'Weak', 'Fair', 'Strong']

  if (!password) return null

  return (
    <div className="cpwd__strength">
      <div className="cpwd__strength-bar">
        <div
          className="cpwd__strength-fill"
          style={{ width: `${(score / 3) * 100}%`, background: colors[score] }}
        />
      </div>
      <p className="cpwd__strength-label" style={{ color: colors[score] }}>{labels[score]}</p>
      <div className="cpwd__strength-checks">
        {checks.map((c) => (
          <span key={c.label} className={`cpwd__check${c.ok ? ' cpwd__check--ok' : ''}`}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// Overlay modal for changing the user's password.
export default function ChangePasswordModal({ userId, onClose }: ChangePasswordModalProps) {
  const { toast } = usePanelUI()
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('form')
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Trap focus on mount.
  useEffect(() => {
    firstInputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Verifies the current password server-side before applying the new one.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPwd.length < 6) { setError('New password must be at least 6 characters.'); return }
    if (newPwd !== confirmPwd) { setError('New passwords do not match.'); return }
    if (newPwd === oldPwd) { setError('New password must be different from the current one.'); return }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/${userId}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      setStep('success')
      toast('Password changed successfully!', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cpwd__overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="cpwd__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cpwd-title"
      >
        {/* Decorative header */}
        <div className="cpwd__header">
          <div className="cpwd__header-deco" aria-hidden />
          <div className="cpwd__header-icon">🔒</div>
          <div className="cpwd__header-copy">
            <h2 id="cpwd-title" className="cpwd__title">Change Password</h2>
            <p className="cpwd__subtitle">Keep your account safe with a strong new password</p>
          </div>
          <button type="button" className="cpwd__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === 'success' ? (
          <div className="cpwd__success">
            <div className="cpwd__success-icon">🎉</div>
            <h3 className="cpwd__success-title">Password Updated!</h3>
            <p className="cpwd__success-desc">Your password has been changed successfully. You can now log in with your new password.</p>
            <button type="button" className="panel-btn panel-btn-primary cpwd__success-btn" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="cpwd__body" onSubmit={handleSubmit} noValidate>

            {/* Current password */}
            <div className="cpwd__field">
              <label className="cpwd__label" htmlFor="cpwd-old">Current Password</label>
              <div className="cpwd__input-wrap">
                <input
                  ref={firstInputRef}
                  id="cpwd-old"
                  type={showOld ? 'text' : 'password'}
                  className="panel-input cpwd__input"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="cpwd__eye"
                  onClick={() => setShowOld((v) => !v)}
                  aria-label={showOld ? 'Hide password' : 'Show password'}
                >
                  {showOld ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="cpwd__divider" aria-hidden />

            {/* New password */}
            <div className="cpwd__field">
              <label className="cpwd__label" htmlFor="cpwd-new">New Password</label>
              <div className="cpwd__input-wrap">
                <input
                  id="cpwd-new"
                  type={showNew ? 'text' : 'password'}
                  className="panel-input cpwd__input"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Enter a strong new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="cpwd__eye"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? '🙈' : '👁️'}
                </button>
              </div>
              <PasswordStrength password={newPwd} />
            </div>

            {/* Confirm new password */}
            <div className="cpwd__field">
              <label className="cpwd__label" htmlFor="cpwd-confirm">Confirm New Password</label>
              <div className="cpwd__input-wrap">
                <input
                  id="cpwd-confirm"
                  type={showNew ? 'text' : 'password'}
                  className={`panel-input cpwd__input${confirmPwd && confirmPwd !== newPwd ? ' cpwd__input--error' : ''}`}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  required
                />
                {confirmPwd && confirmPwd === newPwd && (
                  <span className="cpwd__match-check" aria-label="Passwords match">✓</span>
                )}
              </div>
              {confirmPwd && confirmPwd !== newPwd && (
                <p className="cpwd__field-error">Passwords do not match</p>
              )}
            </div>

            {error && <div className="cpwd__error-box">{error}</div>}

            <div className="cpwd__actions">
              <button
                type="button"
                className="panel-btn panel-btn-secondary cpwd__cancel-btn"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="panel-btn panel-btn-primary cpwd__submit-btn"
                disabled={saving || !oldPwd || !newPwd || newPwd !== confirmPwd}
              >
                {saving ? (
                  <span className="cpwd__spinner" aria-hidden />
                ) : null}
                {saving ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
