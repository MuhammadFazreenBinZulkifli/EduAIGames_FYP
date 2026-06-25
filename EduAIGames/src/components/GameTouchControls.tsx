import './App_CSS/GameTouchControls_CSS.css'

export type TouchDirection = 'up' | 'down' | 'left' | 'right'

interface GameTouchControlsProps {
  onDirection: (dir: TouchDirection) => void
  onPause?: () => void
  showPause?: boolean
  className?: string
}

function fireDirection(
  e: React.PointerEvent<HTMLButtonElement>,
  dir: TouchDirection,
  onDirection: (dir: TouchDirection) => void
) {
  e.preventDefault()
  onDirection(dir)
}

export default function GameTouchControls({
  onDirection,
  onPause,
  showPause = true,
  className = '',
}: GameTouchControlsProps) {
  return (
    <div className={`game-touch-controls${className ? ` ${className}` : ''}`} aria-label="Touch controls">
      <div className="game-touch-controls__pad">
        <button
          type="button"
          className="game-touch-controls__btn game-touch-controls__btn--up"
          aria-label="Move up"
          onPointerDown={(e) => fireDirection(e, 'up', onDirection)}
        >
          ▲
        </button>
        <button
          type="button"
          className="game-touch-controls__btn game-touch-controls__btn--left"
          aria-label="Move left"
          onPointerDown={(e) => fireDirection(e, 'left', onDirection)}
        >
          ◀
        </button>
        {showPause && onPause ? (
          <button
            type="button"
            className="game-touch-controls__btn game-touch-controls__btn--center"
            aria-label="Pause"
            onPointerDown={(e) => {
              e.preventDefault()
              onPause()
            }}
          >
            ⏸
          </button>
        ) : (
          <span className="game-touch-controls__btn game-touch-controls__btn--center game-touch-controls__btn--spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className="game-touch-controls__btn game-touch-controls__btn--right"
          aria-label="Move right"
          onPointerDown={(e) => fireDirection(e, 'right', onDirection)}
        >
          ▶
        </button>
        <button
          type="button"
          className="game-touch-controls__btn game-touch-controls__btn--down"
          aria-label="Move down"
          onPointerDown={(e) => fireDirection(e, 'down', onDirection)}
        >
          ▼
        </button>
      </div>
    </div>
  )
}
