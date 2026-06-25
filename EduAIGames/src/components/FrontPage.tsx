import { useCallback, useEffect, useMemo, useState, useRef, type MouseEvent } from 'react'

// Floating background glyphs — kept very subtle so they never distract.
const PARTICLES = [
  { char: '{ }', left: '4%',  delay: '0s',    duration: '16s', size: '0.62rem' },
  { char: '01',  left: '11%', delay: '2.8s',  duration: '12s', size: '0.58rem' },
  { char: 'A+',  left: '19%', delay: '7.2s',  duration: '15s', size: '0.7rem'  },
  { char: '✓',   left: '28%', delay: '1.4s',  duration: '13s', size: '0.76rem' },
  { char: '◆',   left: '37%', delay: '5.5s',  duration: '11s', size: '0.48rem' },
  { char: '?',   left: '46%', delay: '9.3s',  duration: '14s', size: '0.82rem' },
  { char: '01',  left: '55%', delay: '3.6s',  duration: '12s', size: '0.58rem' },
  { char: '{ }', left: '63%', delay: '6.8s',  duration: '15s', size: '0.62rem' },
  { char: '✓',   left: '71%', delay: '0.8s',  duration: '13s', size: '0.74rem' },
  { char: 'A+',  left: '80%', delay: '4.2s',  duration: '14s', size: '0.68rem' },
  { char: '◆',   left: '88%', delay: '8.1s',  duration: '11s', size: '0.48rem' },
  { char: '?',   left: '95%', delay: '2.2s',  duration: '16s', size: '0.78rem' },
] as const
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import FrontPageIcon from './FrontPageIcons'
import ThemeToggle from './ThemeToggle'
import './App_CSS/FrontPage_CSS.css'

interface FrontPageProps {
  onStartLogin: () => void
  onStartRegister: () => void
}

const LOGO_SRC = '/EduAIGames_logo.png'
const heroImageSrc = '/images/frontpage-hero.png'

const FEATURE_CATALOG = [
  {
    id: 'quizzes',
    flag: 'quizzes_enabled' as const,
    icon: 'quiz' as const,
    title: 'Course Quizzes',
    description:
      'Your lecturer posts quizzes for your class. Do them online, submit when you are ready, and see your score straight away. No paper handouts.',
  },
  {
    id: 'games',
    flag: 'games_enabled' as const,
    icon: 'games' as const,
    title: 'Study Through Games',
    description:
      'Revise the same topics through Snake, Maze, Breakout, and Trivia Race. It feels more like playing than cramming from notes.',
  },
  {
    id: 'chatbot',
    flag: 'chatbot_enabled' as const,
    icon: 'chatbot' as const,
    title: 'EduBot Study Help',
    description:
      'Stuck on something? Ask EduBot. It explains topics in plain language and can point you in the right direction.',
  },
  {
    id: 'grades',
    flag: null,
    icon: 'grades' as const,
    title: 'Your Grades in One Place',
    description:
      'Check quiz scores and see how you are doing across your classes without digging through emails or spreadsheets.',
  },
  {
    id: 'classes',
    flag: null,
    icon: 'classes' as const,
    title: 'Join With a Class Code',
    description:
      'Your lecturer gives you a short code. Enter it once and your quizzes, games, and course content show up in your dashboard.',
  },
  {
    id: 'ai_quiz',
    flag: 'ai_quiz_enabled' as const,
    icon: 'ai' as const,
    title: 'AI-Enhanced Learning',
    description:
      'Some modules use AI to help lecturers build quizzes faster, so you get more practice material to work with.',
  },
]

const HOW_IT_WORKS = [
  {
    title: 'Get your class code',
    description:
      'Your lecturer or tutor shares a join code in class, on the LMS, or by email. That code connects you to the right module on EduAIGames.',
  },
  {
    title: 'Sign up and join',
    description:
      'Create a free student account, enter the code, and you will see the quizzes, games, and content for that class.',
  },
  {
    title: 'Learn, play, and check results',
    description:
      'Complete quizzes, play the learning games to revise, and check your grades whenever you want.',
  },
]

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Public marketing landing page with login and sign-up entry points.
function FrontPage({ onStartLogin, onStartRegister }: FrontPageProps) {
  const { features } = usePlatformFeatures()
  const [heroImageFailed, setHeroImageFailed] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  // Detect reduced-motion once (stable for the session).
  const [noMotion] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Count-up for "4 game modes" in the trust row.
  const [count4, setCount4] = useState(() => (noMotion ? 4 : 0))

  const visibleFeatures = useMemo(
    () =>
      FEATURE_CATALOG.filter((item) => {
        if (!item.flag) return true
        return features[item.flag]
      }),
    [features],
  )

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('.frontpage-section--reveal')
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('frontpage-section--visible')
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  // Scroll-spy: keeps the active nav link in sync as the user scrolls.
  useEffect(() => {
    const spyIds = ['what-is-eduaigames', 'how-it-works', 'features', 'for-campus']
    const els = spyIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -55% 0px', threshold: 0 },
    )
    els.forEach((el) => spy.observe(el))
    return () => spy.disconnect()
  }, [])

  // Count-up: "4 game modes" — plays once on mount.
  useEffect(() => {
    if (noMotion) return
    let rafId: number
    let start: number | null = null
    const target = 4
    const duration = 1200
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setCount4(Math.floor(p * target))
      if (p < 1) { rafId = requestAnimationFrame(step) } else { setCount4(target) }
    }
    const timer = setTimeout(() => { rafId = requestAnimationFrame(step) }, 500)
    return () => { clearTimeout(timer); cancelAnimationFrame(rafId) }
  }, [noMotion])

  const handleNavClick = useCallback((e: MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault()
    setActiveSection(sectionId)
    setMobileMenuOpen(false)
    scrollToSection(sectionId)
  }, [])

  // Close mobile menu on outside click or Escape
  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false) }
    const onOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside as unknown as EventListener)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside as unknown as EventListener)
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  return (
    <div className="frontpage">
      <div className="frontpage-bg-orbs" aria-hidden="true" />

      {/* Floating data-glyph particles — ambient only, hidden on mobile */}
      <div className="frontpage-particles" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="frontpage-particle"
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              fontSize: p.size,
            }}
          >
            {p.char}
          </span>
        ))}
      </div>

      {/* Mobile menu backdrop */}
      {mobileMenuOpen && (
        <div
          className="frontpage-mobile-backdrop"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="frontpage-nav-bar" ref={mobileMenuRef}>
      <header className="frontpage-nav">
        <div className="frontpage-brand">
          <img src={LOGO_SRC} alt="" className="frontpage-logo-img" />
          <div className="frontpage-brand-text">
            <p className="frontpage-brand-title">EduAIGames</p>
            <p className="frontpage-brand-subtitle">For College &amp; University Students</p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="frontpage-nav-links" aria-label="Primary">
          <a
            href="#what-is-eduaigames"
            className={`frontpage-link${activeSection === 'what-is-eduaigames' ? ' frontpage-link--active' : ''}`}
            onClick={(e) => handleNavClick(e, 'what-is-eduaigames')}
            aria-current={activeSection === 'what-is-eduaigames' ? true : undefined}
          >
            What Is This?
          </a>
          <a
            href="#how-it-works"
            className={`frontpage-link${activeSection === 'how-it-works' ? ' frontpage-link--active' : ''}`}
            onClick={(e) => handleNavClick(e, 'how-it-works')}
            aria-current={activeSection === 'how-it-works' ? true : undefined}
          >
            How It Works
          </a>
          <a
            href="#features"
            className={`frontpage-link${activeSection === 'features' ? ' frontpage-link--active' : ''}`}
            onClick={(e) => handleNavClick(e, 'features')}
            aria-current={activeSection === 'features' ? true : undefined}
          >
            Features
          </a>
          <button type="button" onClick={onStartLogin} className="frontpage-btn frontpage-btn-ghost">
            Login
          </button>
          <button type="button" onClick={onStartRegister} className="frontpage-btn frontpage-btn-primary">
            Sign Up
          </button>
          <ThemeToggle className="frontpage-nav-theme--desktop" />
        </nav>

        {/* Mobile: theme toggle + hamburger */}
        <div className="frontpage-nav-end">
          <ThemeToggle className="frontpage-nav-theme--mobile" />
          <button
            type="button"
            className="frontpage-btn frontpage-btn-primary frontpage-nav-signup-mobile"
            onClick={onStartRegister}
          >
            Sign Up
          </button>
          <button
            type="button"
            className="frontpage-hamburger"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            <span className={`frontpage-hamburger-lines ${mobileMenuOpen ? 'is-open' : ''}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <nav className="frontpage-mobile-menu" aria-label="Mobile navigation">
            <a
              href="#what-is-eduaigames"
              className="frontpage-mobile-link"
              onClick={(e) => handleNavClick(e, 'what-is-eduaigames')}
            >
              What Is This?
            </a>
            <a
              href="#how-it-works"
              className="frontpage-mobile-link"
              onClick={(e) => handleNavClick(e, 'how-it-works')}
            >
              How It Works
            </a>
            <a
              href="#features"
              className="frontpage-mobile-link"
              onClick={(e) => handleNavClick(e, 'features')}
            >
              Features
            </a>
            <hr className="frontpage-mobile-divider" />
            <button
              type="button"
              className="frontpage-mobile-link frontpage-mobile-link--btn"
              onClick={() => { setMobileMenuOpen(false); onStartLogin() }}
            >
              Login
            </button>
            <button
              type="button"
              className="frontpage-mobile-link frontpage-mobile-link--primary"
              onClick={() => { setMobileMenuOpen(false); onStartRegister() }}
            >
              Create Account
            </button>
          </nav>
        )}
      </header>
      </div>

      <main>
        <section id="top" className="frontpage-hero">
          <div className="frontpage-copy">
            <p className="frontpage-pill frontpage-pill--shimmer">New to EduAIGames? Start here.</p>
            <h1>
              <span className="frontpage-headline-line">Your course.</span>{' '}
              <span className="frontpage-headline-line frontpage-headline-line--accent">Quizzes &amp; games.</span>{' '}
              <span className="frontpage-headline-line">One place.</span>
            </h1>
            <p className="frontpage-description">
              <strong>EduAIGames</strong> is where your college or university may run class activities. Join with
              a code from your lecturer, take quizzes, play revision games, and check your grades. Everything
              stays in one desktop app.
            </p>
            <div className="frontpage-actions">
              <button type="button" onClick={onStartRegister} className="frontpage-btn frontpage-btn-primary frontpage-btn-large">
                Create Student Account
              </button>
              <button type="button" onClick={onStartLogin} className="frontpage-btn frontpage-btn-ghost frontpage-btn-large">
                I Already Have an Account
              </button>
            </div>
            <div className="frontpage-trust-row">
              <div className="frontpage-trust-item">
                <strong>Free</strong>
                <span>For students</span>
              </div>
              <div className="frontpage-trust-item">
                <strong>Code</strong>
                <span>Join your class</span>
              </div>
              <div className="frontpage-trust-item">
                <strong>{count4}</strong>
                <span>Game modes</span>
              </div>
            </div>
          </div>

          <div className="frontpage-visual">
            <div className="frontpage-visual-placeholder">
              {!heroImageFailed ? (
                <img
                  src={heroImageSrc}
                  alt="University students using interactive quizzes and learning games"
                  className="frontpage-hero-image"
                  loading="eager"
                  fetchPriority="high"
                  onError={() => setHeroImageFailed(true)}
                />
              ) : (
                <div className="frontpage-hero-fallback">
                  <img src={LOGO_SRC} alt="EduAIGames logo" className="frontpage-logo-clean" />
                  <span>Quizzes, games, and grades for college study.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          id="what-is-eduaigames"
          className="frontpage-section frontpage-section--reveal"
          aria-labelledby="intro-heading"
        >
          <div className="frontpage-intro-panel">
            <div className="frontpage-intro-copy">
              <p className="frontpage-section-eyebrow">What Is EduAIGames?</p>
              <h2 id="intro-heading">Your class hub, not a social app</h2>
              <p>
                Never heard of EduAIGames? That is fine. You do not download it just for fun on your own. Your{' '}
                <strong>lecturer or tutor</strong> creates a class and invites you with a join code, a bit like
                joining a private group for your module.
              </p>
              <p>
                Once you are in, you will find quizzes to test what you have learned, optional mini-games that
                help you revise, and a grades page so you always know where you stand. Some classes also include
                EduBot, an AI assistant you can ask when you need help understanding a topic.
              </p>
            </div>
            <ul className="frontpage-intro-points">
              <li>
                <span className="frontpage-intro-point-icon" aria-hidden="true">1</span>
                <div>
                  <strong>You need a class code</strong>
                  <p>Not sure? Ask your lecturer. They create the class and share the code with your cohort.</p>
                </div>
              </li>
              <li>
                <span className="frontpage-intro-point-icon" aria-hidden="true">2</span>
                <div>
                  <strong>It works alongside your course</strong>
                  <p>Quizzes and games are tied to what you are studying, not random entertainment.</p>
                </div>
              </li>
              <li>
                <span className="frontpage-intro-point-icon" aria-hidden="true">3</span>
                <div>
                  <strong>Your progress is saved</strong>
                  <p>Scores and attempts are recorded so you and your lecturer can track learning over the semester.</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section
          id="features"
          className="frontpage-section frontpage-section--reveal"
          aria-labelledby="features-heading"
        >
          <div className="frontpage-section-header">
            <p className="frontpage-section-eyebrow">What You Can Do</p>
            <h2 id="features-heading">Built for the way students study</h2>
            <p>
              Once you join a class, you get access to the tools below. Your lecturer chooses which ones are
              turned on for your module.
            </p>
          </div>
          <div className="frontpage-features-grid">
            {visibleFeatures.map((feature) => (
              <article key={feature.id} className="frontpage-feature-card">
                <div className="frontpage-feature-icon" aria-hidden="true">
                  <FrontPageIcon name={feature.icon} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="frontpage-section frontpage-section--reveal"
          aria-labelledby="how-heading"
        >
          <div className="frontpage-section-header">
            <p className="frontpage-section-eyebrow">How It Works</p>
            <h2 id="how-heading">From class code to your first quiz in minutes</h2>
            <p>Sign up, paste your code, and you are good to go. No extra setup needed.</p>
          </div>
          <div className="frontpage-steps">
            {HOW_IT_WORKS.map((step, index) => (
              <article key={step.title} className="frontpage-step">
                <span className="frontpage-step-num">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {index < HOW_IT_WORKS.length - 1 && (
                  <span className="frontpage-step-connector" aria-hidden="true" />
                )}
              </article>
            ))}
          </div>
        </section>

        <section
          id="for-campus"
          className="frontpage-section frontpage-section--reveal"
          aria-labelledby="campus-heading"
        >
          <div className="frontpage-schools-panel">
            <div className="frontpage-schools-copy">
              <p className="frontpage-section-eyebrow">For Your University</p>
              <h2 id="campus-heading">Used by colleges and universities that want engaging learning</h2>
              <p>
                EduAIGames is built for colleges and universities. Your institution can run it across multiple
                modules. Lecturers manage their own classes while admins keep the platform running, so you
                always have one secure place to learn.
              </p>
              <ul className="frontpage-schools-list">
                <li>Secure student registration and class enrollment</li>
                <li>Quizzes and games aligned to your module content</li>
                <li>Grade tracking across the semester</li>
                <li>Optional AI tools for study help and quiz creation</li>
              </ul>
              <button type="button" onClick={onStartRegister} className="frontpage-btn frontpage-btn-primary frontpage-btn-large">
                Sign Up as a Student
              </button>
            </div>
            <div className="frontpage-schools-stats">
              <div className="frontpage-stat-card">
                <strong>Quiz</strong>
                <span>Assignments</span>
              </div>
              <div className="frontpage-stat-card">
                <strong>Game</strong>
                <span>Revision</span>
              </div>
              <div className="frontpage-stat-card">
                <strong>Grade</strong>
                <span>Tracking</span>
              </div>
              <div className="frontpage-stat-card">
                <strong>EduBot</strong>
                <span>Study help</span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="frontpage-section frontpage-section--reveal"
          aria-labelledby="roles-heading"
        >
          <div className="frontpage-section-header">
            <p className="frontpage-section-eyebrow">Who Is It For?</p>
            <h2 id="roles-heading">Students sign up here. Lecturers have their own area too.</h2>
            <p>
              Sign up as a <strong>Student</strong> if your class uses EduAIGames. Lecturers and tutors register
              separately to create content and manage classes.
            </p>
          </div>
          <div className="frontpage-roles-grid">
            <article className="frontpage-role-card frontpage-role-card--student">
              <span className="frontpage-role-badge">Student</span>
              <h3>Join your class and start learning</h3>
              <p>
                This is the path for you if a lecturer gave you a join code. Sign up, enter the code, and access
                quizzes, games, and your grades from your student dashboard.
              </p>
              <button type="button" onClick={onStartRegister} className="frontpage-btn frontpage-btn-primary">
                Sign Up as Student
              </button>
            </article>
            <article className="frontpage-role-card">
              <span className="frontpage-role-badge">Lecturer / Tutor</span>
              <h3>Create classes and assign work</h3>
              <p>
                If you teach at a college or university, register as an Instructor to create classes, publish
                quizzes and games, and monitor student performance.
              </p>
              <button type="button" onClick={onStartRegister} className="frontpage-btn frontpage-btn-ghost">
                Sign Up as Instructor
              </button>
            </article>
          </div>
        </section>
      </main>

      <footer className="frontpage-footer">
        <div className="frontpage-footer-brand">
          <img src={LOGO_SRC} alt="" className="frontpage-logo-clean" />
          <span>EduAIGames</span>
        </div>
        <p className="frontpage-footer-copy">
          © {new Date().getFullYear()} EduAIGames. Learning through quizzes and games for college students.
        </p>
        <div className="frontpage-footer-links">
          <button type="button" onClick={() => scrollToSection('what-is-eduaigames')}>What Is This?</button>
          <button type="button" onClick={onStartLogin}>Login</button>
          <button type="button" onClick={onStartRegister}>Sign Up</button>
        </div>
      </footer>
    </div>
  )
}

export default FrontPage
