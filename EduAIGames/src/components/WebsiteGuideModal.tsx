import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './App_CSS/WebsiteGuideModal_CSS.css'

interface GuideStep {
  title: string
  detail: ReactNode
}

const STUDENT_STEPS: GuideStep[] = [
  {
    title: 'Join your class',
    detail: 'On your Dashboard, tap "Join Class" and enter the join code your instructor gave you to enrol in your module.',
  },
  {
    title: 'Open class content',
    detail: 'Go to My Classes to find lecture materials, quizzes, and learning games organised by topic for each class.',
  },
  {
    title: 'Play & learn',
    detail: 'Launch a learning game like Snake Quest, Maze Quest, Brick Breaker, or Trivia Race, or answer a quiz to test what you know.',
  },
  {
    title: 'Track your grades',
    detail: 'Visit My Grades to review your scores, see feedback, and follow your progress over time.',
  },
  {
    title: 'Ask EduBot anytime',
    detail: 'Tap the chat bubble in the corner for instant study help or questions about how to use the site.',
  },
]

const INSTRUCTOR_STEPS: GuideStep[] = [
  {
    title: 'Create a class',
    detail: 'From My Classes, create a class and share its join code so your students can enrol.',
  },
  {
    title: 'Add learning content',
    detail: 'Open Manage Class to upload materials and organise them into topics for your students.',
  },
  {
    title: 'Build a quiz',
    detail: 'Use the Quiz Library to create multiple-choice or true/false questions, or let the AI Quiz Generator draft them for you.',
  },
  {
    title: 'Turn quizzes into games',
    detail: 'Open a game studio (Snake, Maze, Brick Breaker, Trivia Race), pick a quiz, test play it, and save the game to your library.',
  },
  {
    title: 'Publish to students',
    detail: 'In Manage Class, publish a quiz or game and choose its settings, such as the time limit, attempts, and answer shuffling.',
  },
  {
    title: 'Track performance',
    detail: 'Open Student Performance to monitor scores, completion, and engagement across your class.',
  },
]

interface WebsiteGuideModalProps {
  open: boolean
  role: 'Student' | 'Instructor'
  onClose: () => void
}

/** Step-by-step "How it works" guide for new students and instructors. */
export default function WebsiteGuideModal({ open, role, onClose }: WebsiteGuideModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isInstructor = role === 'Instructor'
  const steps = isInstructor ? INSTRUCTOR_STEPS : STUDENT_STEPS

  return createPortal(
    <div
      className="site-guide__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-guide-title"
      onClick={onClose}
    >
      <div className="site-guide__modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="site-guide__close" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <div className="site-guide__header">
          <span className="site-guide__badge" aria-hidden="true">{isInstructor ? '🎓' : '🚀'}</span>
          <div>
            <p className="site-guide__kicker">How it works</p>
            <h2 id="site-guide-title" className="site-guide__title">
              {isInstructor ? 'Getting started as an Instructor' : 'Getting started as a Student'}
            </h2>
            <p className="site-guide__subtitle">
              {isInstructor
                ? 'Follow these steps to set up your class and turn quizzes into learning games.'
                : 'Follow these steps to go from a fresh account to playing and learning.'}
            </p>
          </div>
        </div>

        <ol className="site-guide__steps">
          {steps.map((step, i) => (
            <li key={i} className="site-guide__step">
              <span className="site-guide__step-num" aria-hidden="true">{i + 1}</span>
              <div className="site-guide__step-body">
                <p className="site-guide__step-title">{step.title}</p>
                <p className="site-guide__step-detail">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="site-guide__actions">
          <button type="button" className="panel-btn panel-btn-primary site-guide__primary" onClick={onClose}>
            Got it, let&apos;s go
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
