import { useState } from 'react'
import { API_BASE_URL } from '../config'
import AuthLogoHomeLink from './AuthLogoHomeLink'

interface RegistrationProps {
  onSwitchToLogin: () => void
  onBackToFrontPage: () => void
}

// Registration form with email OTP verification (falls back if email is unavailable).
function Registration({ onSwitchToLogin, onBackToFrontPage }: RegistrationProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Student' as 'Instructor' | 'Student',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string
    email?: string
    password?: string
    confirmPassword?: string
  }>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpMessage, setOtpMessage] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    setFieldErrors(prev => ({ ...prev, [name]: '' }))
  }

  // Validates the form and kicks off OTP verification or direct registration.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const username = formData.username.trim()
    const email = formData.email.trim()
    const password = formData.password
    const confirmPassword = formData.confirmPassword
    const nextFieldErrors: {
      username?: string
      email?: string
      password?: string
      confirmPassword?: string
    } = {}

    // Client-side validation
    if (!username) nextFieldErrors.username = 'Full name is required'
    if (!email) {
      nextFieldErrors.email = 'Email is required'
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextFieldErrors.email = 'Please enter a valid email address'
    }
    if (!password) nextFieldErrors.password = 'Password is required'
    else if (password.length < 6) nextFieldErrors.password = 'Password must be at least 6 characters'
    if (!confirmPassword) nextFieldErrors.confirmPassword = 'Please confirm your password'
    else if (password !== confirmPassword) nextFieldErrors.confirmPassword = 'Passwords do not match'
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setError('Please fix the highlighted fields.')
      return
    }

    const registerDirectly = async () => {
      const directResponse = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password,
          role: formData.role,
        }),
      })
      let directData: any = null
      try {
        directData = await directResponse.json()
      } catch {
        directData = null
      }
      if (!directResponse.ok) {
        setError(directData?.message || directData?.error || 'Registration failed')
        return
      }
      setFormData({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'Student',
      })
      setSubmitted(true)
    }

    try {
      // Request OTP before completing registration
      const response = await fetch(`${API_BASE_URL}/api/auth/register/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password,
          role: formData.role,
        }),
      })

      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (response.ok) {
        setPendingEmail(email.toLowerCase())
        setShowOtpModal(true)
        setOtpMessage('OTP sent. Please check your email.')
        return
      } else {
        const message = data?.message || data?.error || 'Registration failed'
        const shouldFallbackToDirect =
          response.status === 404 ||
          /email service is not configured/i.test(message) ||
          /smtp/i.test(message) ||
          /email_otp_codes/i.test(message) ||
          /relation .*email_otp_codes.* does not exist/i.test(message)

        if (shouldFallbackToDirect) {
          await registerDirectly()
          return
        }

        setError(message)
      }
    } catch (err) {
      console.error('Registration API error:', err)
      setError('Unable to save your account to the server. Please make sure backend is running.')
    } finally {
      setLoading(false)
    }
  }

  // Confirms the email OTP and completes account creation.
  const handleVerifyOtp = async () => {
    if (!pendingEmail || !otpCode.trim()) {
      setOtpMessage('Please enter the OTP code sent to your email.')
      return
    }
    try {
      setOtpLoading(true)
      setOtpMessage('')
      const response = await fetch(`${API_BASE_URL}/api/auth/register/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingEmail,
          otp: otpCode.trim(),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setOtpMessage(data?.error || 'Failed to verify OTP')
        return
      }
      setShowOtpModal(false)
      setOtpCode('')
      setFormData({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'Student',
      })
      setSubmitted(true)
    } catch (err) {
      console.error('Verify OTP error:', err)
      setOtpMessage('Unable to verify OTP right now. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-layout auth-layout-centered">
          <div className="auth-card auth-success-card">
            <div className="success-icon">✅</div>
            <h1 className="auth-title">Registration Submitted!</h1>
            <p className="auth-subtitle">
              Your account request has been sent to the administrator. You will be able to log in
              after your registration is approved.
            </p>
            <button
              onClick={() => {
                setSubmitted(false)
                onSwitchToLogin()
              }}
              className="btn btn-primary auth-submit"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">
        <aside className="auth-panel">
          <p className="auth-panel-tag">Join the Platform</p>
          <h2>Create your learning profile</h2>
          <p>Set up your account in seconds and start using AI quiz and game features.</p>
          <ul className="auth-panel-points">
            <li>Choose Student or Instructor role</li>
            <li>Secure sign up flow</li>
            <li>Modern dashboard experience</li>
          </ul>
        </aside>

        <div className="auth-card">
          <AuthLogoHomeLink onBack={onBackToFrontPage} />
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join and start learning with AI-powered quizzes and games.</p>

          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Your full name"
                className="form-input"
                required
                autoComplete="username"
              />
              {fieldErrors.username && <p className="field-error">{fieldErrors.username}</p>}
            </div>

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
              <label>Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="form-input"
              >
                <option value="Student">Student</option>
                <option value="Instructor">Instructor</option>
              </select>
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
                  minLength={6}
                  autoComplete="new-password"
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

            <div className="form-group">
              <label>Confirm Password</label>
              <div className="password-input-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="form-input"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary auth-submit"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="auth-switch-text">
            Already have an account?{' '}
            <button onClick={onSwitchToLogin} className="link-btn" type="button">
              Login here
            </button>
          </p>
        </div>
      </div>

      {showOtpModal && (
        <div className="auth-modal-overlay">
          <div className="auth-modal">
            <h3>Email Verification</h3>
            <p>Enter the 6-digit OTP sent to <strong>{pendingEmail}</strong>.</p>
            <input
              type="text"
              className="form-input"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter OTP"
            />
            {otpMessage && <p className="field-error">{otpMessage}</p>}
            <div className="auth-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowOtpModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleVerifyOtp} disabled={otpLoading}>
                {otpLoading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Registration


