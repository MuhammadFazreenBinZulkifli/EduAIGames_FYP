import { useEffect, useRef, useState } from 'react'
import './App_CSS/LoginRobot_CSS.css'

interface EyeOffset { x: number; y: number }

interface LoginRobotProps {
  /** When true, the robot covers its eyes & looks away (e.g. password is revealed). */
  shy?: boolean
}

const MAX_EYE_TRAVEL = 5   // px the pupil moves inside the eye socket
const LERP_SPEED      = 0.12

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Animated robot mascot whose eyes follow the cursor on the login page.
// When `shy` is true (the password is revealed) it bashfully covers its eyes
// and looks away so it can't peek at your credentials.
export default function LoginRobot({ shy = false }: LoginRobotProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number | null>(null)

  const targetRef = useRef<EyeOffset>({ x: 0, y: 0 })
  const [current, setCurrent] = useState<EyeOffset>({ x: 0, y: 0 })
  const currentRef = useRef<EyeOffset>({ x: 0, y: 0 })

  // detect reduced-motion
  const noMotion = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    // When shy, stop following the cursor — the robot is looking away on purpose.
    if (noMotion || shy) {
      targetRef.current = { x: 0, y: 0 }
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      const el = panelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width  / 2
      const cy = rect.top  + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const range = Math.min(rect.width, rect.height) * 0.5
      const factor = Math.min(dist / range, 1) * MAX_EYE_TRAVEL
      targetRef.current = {
        x: (dx / dist) * factor,
        y: (dy / dist) * factor,
      }
    }

    const handleMouseLeave = () => {
      targetRef.current = { x: 0, y: 0 }
    }

    window.addEventListener('mousemove', handleMouseMove)
    panelRef.current?.addEventListener('mouseleave', handleMouseLeave)

    const animate = () => {
      const t  = targetRef.current
      const c  = currentRef.current
      const nx = lerp(c.x, t.x, LERP_SPEED)
      const ny = lerp(c.y, t.y, LERP_SPEED)
      currentRef.current = { x: nx, y: ny }
      setCurrent({ x: nx, y: ny })
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [noMotion, shy])

  const ex = noMotion || shy ? 0 : current.x
  const ey = noMotion || shy ? 0 : current.y

  return (
    <div ref={panelRef} className={`login-robot${shy ? ' is-shy' : ''}`}>
      {/* ── SVG Robot ── */}
      <svg
        viewBox="0 0 160 200"
        width="210"
        height="262"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Friendly robot mascot"
        className="login-robot__svg"
      >
        {/* ── Antenna ── */}
        <line x1="80" y1="22" x2="80" y2="40" stroke="#ffab45" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="18" r="6" fill="#ffca6e" />
        <circle cx="80" cy="18" r="3" fill="#fff8ee">
          <animate attributeName="opacity" values="1;0.4;1" dur="2.4s" repeatCount="indefinite" />
        </circle>

        {/* ── Head ── */}
        <rect x="32" y="42" width="96" height="72" rx="18" fill="#2e3352" />
        {/* head highlight */}
        <rect x="36" y="46" width="88" height="4" rx="2" fill="rgba(255,255,255,0.07)" />

        {/* ── Ear knobs ── */}
        <rect x="18" y="62" width="14" height="24" rx="6" fill="#ffab45" />
        <rect x="128" y="62" width="14" height="24" rx="6" fill="#ffab45" />

        {/* ── Visor (face screen) ── */}
        <rect x="42" y="54" width="76" height="52" rx="10" fill="#1a1e30" />
        <rect x="42" y="54" width="76" height="52" rx="10" fill="url(#visorGlare)" />

        {/* ── Eye sockets ── */}
        <circle cx="63" cy="75" r="14" fill="#111520" />
        <circle cx="97" cy="75" r="14" fill="#111520" />

        {shy ? (
          <>
            {/* ── Shy closed/squinting eyes (looking away) ── */}
            <path d="M 55 76 Q 63 70 71 76" stroke="#ffab45" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M 89 76 Q 97 70 105 76" stroke="#ffab45" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* ── Bashful blush ── */}
            <ellipse cx="52" cy="86" rx="6" ry="3.5" fill="#ff7a1a" opacity="0.45" />
            <ellipse cx="108" cy="86" rx="6" ry="3.5" fill="#ff7a1a" opacity="0.45" />
          </>
        ) : (
          <>
            {/* ── Iris (orange glow) ── */}
            <circle cx="63" cy="75" r="10" fill="#e86e00" opacity="0.9" />
            <circle cx="97" cy="75" r="10" fill="#e86e00" opacity="0.9" />

            {/* ── Pupils — follow cursor ── */}
            <circle cx={63 + ex} cy={75 + ey} r="5.5" fill="#1a1e30" />
            <circle cx={97 + ex} cy={75 + ey} r="5.5" fill="#1a1e30" />

            {/* ── Eye shine ── */}
            <circle cx={63 + ex + 2} cy={75 + ey - 2} r="1.8" fill="rgba(255,255,255,0.85)" />
            <circle cx={97 + ex + 2} cy={75 + ey - 2} r="1.8" fill="rgba(255,255,255,0.85)" />
          </>
        )}

        {/* ── Smile (slight shy ":3" mouth when peeking is blocked) ── */}
        <path
          d={shy ? 'M 64 98 Q 80 92 96 98' : 'M 60 96 Q 80 106 100 96'}
          stroke="#ffab45"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* ── Neck ── */}
        <rect x="70" y="114" width="20" height="10" rx="4" fill="#3a4060" />

        {/* ── Body ── */}
        <rect x="30" y="124" width="100" height="60" rx="16" fill="#2e3352" />
        {/* body highlight */}
        <rect x="36" y="128" width="88" height="4" rx="2" fill="rgba(255,255,255,0.06)" />

        {/* ── Chest plate ── */}
        <rect x="50" y="136" width="60" height="32" rx="8" fill="#1a1e30" />

        {/* ── Chest indicator lights ── */}
        <circle cx="68" cy="149" r="4" fill="#ff7a1a">
          <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="80" cy="149" r="4" fill="#ffca6e">
          <animate attributeName="opacity" values="0.45;1;0.45" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="92" cy="149" r="4" fill="#4ade80">
          <animate attributeName="opacity" values="1;0.45;1" dur="2.2s" repeatCount="indefinite" />
        </circle>

        {/* ── Chest zig-zag line ── */}
        <polyline
          points="56,162 63,156 70,162 77,156 84,162 91,156 98,162 104,156"
          stroke="#ff7a1a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.6"
        />

        {/* ── Arms (resting at the body sides) ── */}
        <g className="login-robot__arms">
          {/* left arm */}
          <rect x="10" y="128" width="20" height="46" rx="10" fill="#2e3352" />
          <circle cx="20" cy="178" r="10" fill="#3a4060" />
          {/* right arm */}
          <rect x="130" y="128" width="20" height="46" rx="10" fill="#2e3352" />
          <circle cx="140" cy="178" r="10" fill="#3a4060" />
        </g>

        {/* ── Covering paws — slide up over the eyes when shy (🙈) ── */}
        <g className="login-robot__cover" aria-hidden="true">
          {/* left forearm + paw */}
          <g className="login-robot__paw login-robot__paw--l">
            <rect x="34" y="80" width="18" height="60" rx="9" fill="#343a5c" />
            <circle cx="62" cy="75" r="17" fill="#3a4060" />
            <line x1="55" y1="64" x2="55" y2="86" stroke="#2a2f4d" strokeWidth="2" strokeLinecap="round" />
            <line x1="62" y1="62" x2="62" y2="88" stroke="#2a2f4d" strokeWidth="2" strokeLinecap="round" />
            <line x1="69" y1="64" x2="69" y2="86" stroke="#2a2f4d" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* right forearm + paw */}
          <g className="login-robot__paw login-robot__paw--r">
            <rect x="108" y="80" width="18" height="60" rx="9" fill="#343a5c" />
            <circle cx="98" cy="75" r="17" fill="#3a4060" />
            <line x1="91" y1="64" x2="91" y2="86" stroke="#2a2f4d" strokeWidth="2" strokeLinecap="round" />
            <line x1="98" y1="62" x2="98" y2="88" stroke="#2a2f4d" strokeWidth="2" strokeLinecap="round" />
            <line x1="105" y1="64" x2="105" y2="86" stroke="#2a2f4d" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>

        {/* ── Legs ── */}
        <rect x="50" y="184" width="22" height="12" rx="6" fill="#3a4060" />
        <rect x="88" y="184" width="22" height="12" rx="6" fill="#3a4060" />

        {/* ── Visor glare gradient ── */}
        <defs>
          <linearGradient id="visorGlare" x1="42" y1="54" x2="42" y2="106" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="white" stopOpacity="0.07" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* ── Caption (changes while peeking is blocked) ── */}
      <p className="login-robot__caption">
        {shy ? "Not looking! your password's safe with me!" : 'Your AI study companion'}
      </p>
    </div>
  )
}
