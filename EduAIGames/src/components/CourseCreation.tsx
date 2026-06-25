import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelIcon from './PanelIcon'
import { INSTRUCTOR_NAV, instructorDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/CourseCreation_CSS.css'

interface CourseCreationProps {
  onCreateQuiz?: () => void
  onCreateGame?: () => void
  onCreateSnakeGame?: () => void
  onCreateBreakoutGame?: () => void
  onCreateRaceGame?: () => void
}

// Hub for instructors — create quizzes and build games from the library.
function CourseCreation({ onCreateQuiz, onCreateGame, onCreateSnakeGame, onCreateBreakoutGame, onCreateRaceGame }: CourseCreationProps) {
  return (
    <div className="panel-page">
      <PanelBreadcrumbs items={[instructorDashboardCrumb(), { label: INSTRUCTOR_NAV.contentMaker }]} />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Instructor · Content Maker</p>
        <h1>Content Maker</h1>
        <p className="panel-hero-greeting">Create quizzes for your library and turn them into interactive games for any class.</p>
      </div>

      <p className="panel-section-kicker">Create content</p>
      <div className="panel-card-grid--page">
        <button
          type="button"
          className="panel-action-card--page course-creation__card"
          onClick={() => onCreateQuiz?.()}
        >
          <div className="panel-action-card__icon-wrap--page panel-action-card__icon-wrap--orange">
            <PanelIcon name="quiz" variant="action" color="orange" />
          </div>
          <h3>Create Quiz</h3>
          <p>Build a quiz and save it to your library. Publish it to any class when you are ready.</p>
        </button>

        <button
          type="button"
          className="panel-action-card--page course-creation__card course-creation__card--maze"
          onClick={() => onCreateGame?.()}
        >
          <div className="panel-action-card__icon-wrap--page panel-action-card__icon-wrap--purple">🎮</div>
          <h3>Maze Quest</h3>
          <p>
            Pick any quiz from your library and turn it into a procedurally generated maze
            game. Students navigate the maze, find gates, and answer questions to advance.
          </p>
        </button>

        <button
          type="button"
          className="panel-action-card--page course-creation__card course-creation__card--snake"
          onClick={() => onCreateSnakeGame?.()}
        >
          <div className="panel-action-card__icon-wrap--page panel-action-card__icon-wrap--green">🐍</div>
          <h3>Snake Quest</h3>
          <p>
            Transform any quiz into a Knowledge Snake game. Students navigate a grid eating the
            correct answer fruits wrong choices grow the tail, obstacles reset the run!
          </p>
        </button>

        <button
          type="button"
          className="panel-action-card--page course-creation__card course-creation__card--breakout"
          onClick={() => onCreateBreakoutGame?.()}
        >
          <div className="panel-action-card__icon-wrap--page panel-action-card__icon-wrap--blue">🧱</div>
          <h3>Brick Breaker</h3>
          <p>
            Turn any quiz into a neon arcade brick breaker. Students bounce the ball off their
            paddle to smash the correct answer brick and advance through every question.
          </p>
        </button>

        <button
          type="button"
          className="panel-action-card--page course-creation__card course-creation__card--race"
          onClick={() => onCreateRaceGame?.()}
        >
          <div className="panel-action-card__icon-wrap--page panel-action-card__icon-wrap--pink">🏃</div>
          <h3>Trivia Race</h3>
          <p>
            Transform any quiz into a high-speed lane race. Steer into the correct answer
            lane before time runs out and beat the chaser to the finish line.
          </p>
        </button>
      </div>
    </div>
  )
}

export default CourseCreation
