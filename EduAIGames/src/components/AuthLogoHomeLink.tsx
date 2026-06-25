const LOGO_SRC = '/EduAIGames_logo.png'

interface AuthLogoHomeLinkProps {
  onBack: () => void
}

// Centered logo above auth titles — tap to return to the front page.
export default function AuthLogoHomeLink({ onBack }: AuthLogoHomeLinkProps) {
  return (
    <button
      type="button"
      className="auth-logo-home"
      onClick={onBack}
      aria-label="Back to EduAIGames home"
      title="Back to home"
    >
      <img src={LOGO_SRC} alt="" className="auth-logo-home__img" />
    </button>
  )
}
