import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface PanelErrorBoundaryProps {
  children: ReactNode
  fallbackPath?: string
  fallbackLabel?: string
}

interface PanelErrorBoundaryState {
  hasError: boolean
}

// Catches render errors in panel routes so one broken page does not white-screen the app.
export default class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { hasError: false }

  // Flip to fallback UI on the next render after a child throws.
  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Panel route error:', error, info.componentStack)
  }

  // Re-mount children by clearing the error flag (does not reload the page).
  private handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { fallbackPath = '/', fallbackLabel = 'Return home' } = this.props

    return (
      <div
        className="panel-error-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="panel-error-modal-title"
        aria-describedby="panel-error-modal-message"
      >
        <div className="panel-error-modal__backdrop" />
        <div className="panel-error-modal__card">
          <div className="panel-error-modal__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="panel-error-modal__kicker">Something went wrong</p>
          <h2 id="panel-error-modal-title" className="panel-error-modal__title">
            We hit a snag loading this page
          </h2>
          <p id="panel-error-modal-message" className="panel-error-modal__message">
            Try again or head back to a safe area. Your account and saved work are still intact.
          </p>
          <div className="panel-error-modal__actions">
            <button type="button" className="panel-btn panel-btn-primary" onClick={this.handleRetry}>
              Try again
            </button>
            <Link to={fallbackPath} className="panel-btn panel-btn-secondary">
              {fallbackLabel}
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
