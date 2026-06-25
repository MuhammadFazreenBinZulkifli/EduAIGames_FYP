const LOGO_SRC = '/EduAIGames_logo.png'

interface MobileShellHeaderProps {
  panelLabel: string
  pageTitle?: string
  menuOpen: boolean
  onToggleMenu: () => void
}

export default function MobileShellHeader({
  panelLabel,
  pageTitle,
  menuOpen,
  onToggleMenu,
}: MobileShellHeaderProps) {
  return (
    <header className="mobile-shell-header" role="banner">
      <button
        type="button"
        className="mobile-shell-header__menu"
        onClick={onToggleMenu}
        aria-expanded={menuOpen}
        aria-controls="mobile-sidebar"
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
      >
        <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
      </button>

      <div className="mobile-shell-header__brand">
        <img src={LOGO_SRC} alt="EduAIGames logo" className="mobile-shell-header__logo" />
        <div className="mobile-shell-header__text">
          <p className="mobile-shell-header__title">
            {pageTitle ?? 'EduAIGames'}
          </p>
          <p className="mobile-shell-header__subtitle">{panelLabel}</p>
        </div>
      </div>
    </header>
  )
}
