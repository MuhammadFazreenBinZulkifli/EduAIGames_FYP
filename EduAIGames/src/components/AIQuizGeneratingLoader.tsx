import { useEffect, useState } from 'react'
import './App_CSS/AIQuizGeneratingLoader_CSS.css'

const LOGO_SRC = '/EduAIGames_logo.png'

const MESSAGES = [
  'Warming up EduBot…',
  'Reading your topic…',
  'Drafting clever questions…',
  'Shuffling answer choices…',
  'Double-checking correct answers…',
  'Polishing explanations…',
  'Almost ready for review…',
]

const ORBIT_ICONS = ['📝', '✨', '🧠', '💡', '🎯']

interface AIQuizGeneratingLoaderProps {
  topic?: string
}

// Full-screen branded loader while AI generates quiz questions.
export default function AIQuizGeneratingLoader({ topic }: AIQuizGeneratingLoaderProps) {
  const [msgIndex, setMsgIndex] = useState(0)

  // Cycle status copy while the API works so the wait feels active, not frozen.
  useEffect(() => {
    const id = window.setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length)
    }, 2400)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="ai-quiz-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="ai-quiz-loader__backdrop" aria-hidden />
      <div className="ai-quiz-loader__particles" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="ai-quiz-loader__particle" style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>

      <div className="ai-quiz-loader__card">
        <div className="ai-quiz-loader__orbit-wrap" aria-hidden>
          {ORBIT_ICONS.map((icon, i) => (
            <span
              key={icon}
              className="ai-quiz-loader__orbit-icon"
              style={{ '--orbit-i': i } as React.CSSProperties}
            >
              {icon}
            </span>
          ))}
          <div className="ai-quiz-loader__logo-ring">
            <img src={LOGO_SRC} alt="" className="ai-quiz-loader__logo" />
          </div>
        </div>

        <p className="ai-quiz-loader__brand">EduAIGames</p>
        <h2 className="ai-quiz-loader__title">Building your quiz</h2>
        {topic && (
          <p className="ai-quiz-loader__topic">
            Topic: <strong>{topic}</strong>
          </p>
        )}

        <p className="ai-quiz-loader__message" key={msgIndex}>
          {MESSAGES[msgIndex]}
        </p>

        <div className="ai-quiz-loader__track" aria-hidden>
          <div className="ai-quiz-loader__bar" />
        </div>

        <p className="ai-quiz-loader__hint">
          This usually takes a few seconds. Hang tight while EduBot works its magic.
        </p>
      </div>
    </div>
  )
}
