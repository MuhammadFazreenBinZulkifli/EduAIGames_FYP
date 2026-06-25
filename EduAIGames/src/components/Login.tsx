import { useState } from 'react'
import { API_BASE_URL } from '../config'
import AuthLogoHomeLink from './AuthLogoHomeLink'
import LoginRobot from './LoginRobot'

interface User {
  id?: number
  username: string
  email: string
  password?: string
  role: 'Instructor' | 'Student' | 'Admin' | 'SuperAdmin'
}

interface LoginProps {
  onLogin: (user: User) => void
  onSwitchToRegister: () => void
  onBackToFrontPage: () => void
}

// Login form with password reset via email OTP.
function Login({ onLogin, onSwitchToRegister, onBackToFrontPage }: LoginProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    setFieldErrors(prev => ({ ...prev, [name]: '' }))
  }

  // Validates credentials and signs the user in via the API.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    const email = formData.email.trim()
    const password = formData.password
    const nextFieldErrors: { email?: string; password?: string } = {}

    if (!email) {
      nextFieldErrors.email = 'Email is required'
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextFieldErrors.email = 'Please enter a valid email address'
    }

    if (!password) {
      nextFieldErrors.password = 'Password is required'
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setError('Please fix the highlighted fields.')
      return
    }

    try {
      // Login via API (connects to PostgreSQL database)
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (response.ok) {
        if (!data?.user) {
          setError('Login succeeded but user data is missing from server response.')
          return
        }
        localStorage.setItem('user', JSON.stringify(data.user))
        onLogin(data.user)
        return
      } else {
        const msg = data?.error || data?.message || 'Invalid email or password'
        if (data?.code === 'ACCOUNT_PENDING') {
          setError(
            'Your account is waiting for admin approval. Please try again once an administrator has approved your registration.'
          )
        } else if (data?.code === 'ACCOUNT_REJECTED') {
          setError(
            'Your registration was not approved. Please contact your administrator if you need help.'
          )
        } else if (data?.code === 'ACCOUNT_SUSPENDED') {
          setError('Your account has been suspended. Please contact your administrator.')
        } else {
          setError(msg)
        }
        return
      }
    } catch (err) {
      console.error('Login error:', err)
      setError(
        API_BASE_URL
          ? `Unable to connect to server. Make sure the backend is running at ${API_BASE_URL}`
          : 'Unable to connect to server. Make sure the backend is running and reachable.'
      )
    } finally {
      setLoading(false)
    }
  }

  // Sends a one-time password reset code to the user's email.
  const handleRequestResetOtp = async () => {
    const emailToUse = (resetEmail || formData.email).trim().toLowerCase()
    if (!emailToUse) {
      setResetMessage('Please enter your email first.')
      return
    }
    try {
      setResetLoading(true)
      setResetMessage('')
      const response = await fetch(`${API_BASE_URL}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setResetMessage(data?.error || 'Failed to request OTP')
        return
      }
      setResetEmail(emailToUse)
      setResetMessage(data?.message || 'OTP sent. Please check your email.')
    } catch (err) {
      console.error('Request reset OTP error:', err)
      setResetMessage('Unable to request OTP right now.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleEmailServiceTest = async () => {
    const emailToUse = (resetEmail || formData.email).trim().toLowerCase()
    if (!emailToUse) {
      setResetMessage('Please enter an email for testing.')
      return
    }
    try {
      setResetLoading(true)
      setResetMessage('')
      const response = await fetch(`${API_BASE_URL}/api/auth/email-service-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setResetMessage(data?.error || 'Email service test failed')
        return
      }
      setResetMessage(data?.message || 'Test email sent successfully.')
    } catch (err) {
      console.error('Email service test error:', err)
      setResetMessage('Unable to test email service right now.')
    } finally {
      setResetLoading(false)
    }
  }

  // Verifies the OTP and sets a new password.
  const handleResetPassword = async () => {
    if (!resetEmail || !resetOtp || !newPassword || !confirmNewPassword) {
      setResetMessage('Please complete all fields.')
      return
    }
    if (newPassword.length < 6) {
      setResetMessage('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setResetMessage('Passwords do not match.')
      return
    }
    try {
      setResetLoading(true)
      setResetMessage('')
      const response = await fetch(`${API_BASE_URL}/api/auth/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          otp: resetOtp.trim(),
          newPassword,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setResetMessage(data?.error || 'Failed to reset password')
        return
      }
      setResetMessage(data?.message || 'Password reset successful.')
      setTimeout(() => {
        setShowResetModal(false)
        setResetOtp('')
        setNewPassword('')
        setConfirmNewPassword('')
      }, 900)
    } catch (err) {
      console.error('Reset password error:', err)
      setResetMessage('Unable to reset password right now.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">
        <aside className="auth-panel auth-panel--robot">
          <LoginRobot shy={showPassword} />
        </aside>

        <div className="auth-card">
          <AuthLogoHomeLink onBack={onBackToFrontPage} />
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to continue building AI quizzes and games.</p>

          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="form-input"
                required
                autoComplete="email"
              />
              {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="form-input"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
            </div>

            <div className="auth-inline-actions">
              <button
                type="button"
                className="link-btn forgot-link"
                onClick={() => {
                  setShowResetModal(true)
                  setResetEmail(formData.email.trim())
                  setResetMessage('')
                }}
              >
                Forgot password?
              </button>
            </div>

            {info && <div className="alert alert-success">{info}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary auth-submit"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="auth-switch-text">
            Don't have an account?{' '}
            <button onClick={onSwitchToRegister} className="link-btn" type="button">
              Register here
            </button>
          </p>
        </div>
      </div>

      {showResetModal && (
        <div className="auth-modal-overlay">
          <div className="auth-modal">
            <h3>Forgot Password</h3>
            <p>Request an OTP and set a new password.</p>
            <input
              type="email"
              className="form-input"
              placeholder="Email address"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleRequestResetOtp}
              disabled={resetLoading}
            >
              {resetLoading ? 'Sending...' : 'Send OTP'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleEmailServiceTest}
              disabled={resetLoading}
            >
              {resetLoading ? 'Testing...' : 'Test Email Service'}
            </button>
            <input
              type="text"
              className="form-input"
              maxLength={6}
              placeholder="OTP code"
              value={resetOtp}
              onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
            />
            <input
              type="password"
              className="form-input"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              className="form-input"
              placeholder="Confirm new password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
            {resetMessage && <p className="field-error">{resetMessage}</p>}
            <div className="auth-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? 'Processing...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
