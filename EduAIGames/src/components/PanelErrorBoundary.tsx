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
      <div className="panel-page panel-error-boundary">
        <div className="panel-hero panel-hero--page panel-error-boundary__hero">
          <p className="panel-kicker">Something went wrong</p>
          <h1>We hit a snag loading this page</h1>
          <p className="panel-hero-greeting">
            Try again or go back to a safe area. Your account and saved work are still intact.
          </p>
        </div>
        <div className="panel-error-boundary__actions">
          <button type="button" className="panel-btn panel-btn-primary" onClick={this.handleRetry}>
            Try again
          </button>
          <Link to={fallbackPath} className="panel-btn panel-btn-secondary">
            {fallbackLabel}
          </Link>
        </div>
      </div>
    )
  }
}
