import type { ChatbotRole } from '../components/AIChatbot'
import { ROUTES } from '../routes/paths'

export interface ChatSuggestion {
  id: string
  label: string
  prompt: string
}

const SITE_HELP_NOTE =
  ' I can explain how to use EduAIGames or help you study any topic — pick a suggestion below or type your own question.'

export function getChatWelcome(role: ChatbotRole, pathname: string, username?: string): string {
  const hi = username ? `Hi, ${username}!` : 'Hi!'
  if (role === 'Guest') {
    return `${hi} I'm EduBot.${SITE_HELP_NOTE} New here? I can walk you through sign-up and joining a class with a code.`
  }

  if (role === 'Student') {
    if (pathname.startsWith(ROUTES.student.join)) {
      return `${hi} You're on **Join Class**. I can explain join codes, browsing public classes, or how enrolment works.${SITE_HELP_NOTE}`
    }
    if (pathname.startsWith(ROUTES.student.courses)) {
      return `${hi} You're on **Class Content** — pick a class to open topics, files, quizzes, and games.${SITE_HELP_NOTE}`
    }
    if (pathname.startsWith(ROUTES.student.quiz)) {
      return `${hi} You're viewing **Pending Quizzes**. I can help you find and complete quizzes, or explain how scoring works.${SITE_HELP_NOTE}`
    }
    if (pathname.startsWith(ROUTES.student.grades)) {
      return `${hi} You're on **My Grades**. Ask how to read scores, review answers, or filter by class.${SITE_HELP_NOTE}`
    }
    if (pathname.startsWith(ROUTES.student.classes)) {
      return `${hi} You're on **Enrolled Classes** — see your memberships and join codes here.${SITE_HELP_NOTE}`
    }
    if (pathname.startsWith(ROUTES.student.dashboard)) {
      return `${hi} You're on your **Student Dashboard** with quick actions and your getting-started checklist.${SITE_HELP_NOTE}`
    }
    return `${hi} I'm EduBot.${SITE_HELP_NOTE} Ask about joining classes, Class Content, quizzes, games, or grades.`
  }

  if (pathname.startsWith(ROUTES.instructor.classes)) {
    return `${hi} You're in **My Classes** — create classes, share join codes, and manage students.${SITE_HELP_NOTE}`
  }
  if (pathname.startsWith(ROUTES.instructor.library)) {
    return `${hi} You're in the **Library** — all your quizzes and saved games in one place.${SITE_HELP_NOTE}`
  }
  if (pathname.startsWith(ROUTES.instructor.studio)) {
    return `${hi} You're in **Content Maker** — build quizzes and turn them into Maze, Snake, Breakout, or Trivia Race games.${SITE_HELP_NOTE}`
  }
  if (pathname.startsWith(ROUTES.instructor.performance)) {
    return `${hi} You're on **Student Performance** — review scores and attempts across classes.${SITE_HELP_NOTE}`
  }
  if (pathname.startsWith(ROUTES.instructor.dashboard)) {
    return `${hi} You're on your **Instructor Dashboard** with the teaching setup checklist.${SITE_HELP_NOTE}`
  }
  return `${hi} I'm EduBot.${SITE_HELP_NOTE} Ask about classes, quizzes, Content Maker, Library, or student analytics.`
}

export function getChatSuggestions(role: ChatbotRole, pathname: string): ChatSuggestion[] {
  if (role === 'Guest') {
    return [
      {
        id: 'guest-what',
        label: 'What is EduAIGames?',
        prompt: 'What is EduAIGames and who is it for?',
      },
      {
        id: 'guest-join',
        label: 'How do I join a class?',
        prompt: 'How do I sign up and join a class with a join code?',
      },
      {
        id: 'guest-games',
        label: 'What games are available?',
        prompt: 'What learning games does EduAIGames offer?',
      },
      {
        id: 'guest-study',
        label: 'Help me study',
        prompt: 'Explain a study topic to me — ask what subject I am learning.',
      },
    ]
  }

  if (role === 'Student') {
    if (pathname.startsWith(ROUTES.student.join)) {
      return [
        { id: 'sj-code', label: 'Use a join code', prompt: 'Where do I enter a join code on this page?' },
        { id: 'sj-browse', label: 'Browse vs code', prompt: 'What is the difference between browsing classes and joining by code?' },
        { id: 'sj-after', label: 'After joining', prompt: 'What should I do after I join my first class?' },
      ]
    }
    if (pathname.startsWith(ROUTES.student.courses)) {
      return [
        { id: 'sc-quiz', label: 'Start a quiz', prompt: 'How do I find and start a quiz in Class Content?' },
        { id: 'sc-game', label: 'Play a game', prompt: 'How do I launch a learning game for my class?' },
        { id: 'sc-files', label: 'Course materials', prompt: 'Where do I find files and topics for a class?' },
      ]
    }
    if (pathname.startsWith(ROUTES.student.grades)) {
      return [
        { id: 'sg-read', label: 'Read my scores', prompt: 'How do I view quiz results and feedback on this page?' },
        { id: 'sg-class', label: 'Grades by class', prompt: 'How do I filter grades by class?' },
      ]
    }
    return [
      { id: 'st-join', label: 'Join a class', prompt: 'How do I join a class with a join code?' },
      { id: 'st-content', label: 'Class Content', prompt: 'What is Class Content and how is it different from Enrolled Classes?' },
      { id: 'st-quiz', label: 'Take a quiz', prompt: 'How do I take a quiz assigned by my lecturer?' },
      { id: 'st-study', label: 'Study help', prompt: 'Help me revise — ask what topic I am studying.' },
    ]
  }

  if (pathname.startsWith(ROUTES.instructor.studio)) {
    return [
      { id: 'is-game', label: 'Create a game', prompt: 'How do I create a Maze, Snake, Breakout, or Trivia Race game?' },
      { id: 'is-quiz-first', label: 'Need a quiz first?', prompt: 'Do I need a quiz before I can build a game in Content Maker?' },
    ]
  }
  if (pathname.startsWith(ROUTES.instructor.library)) {
    return [
      { id: 'il-quizzes', label: 'Manage quizzes', prompt: 'How does the Library relate to quizzes in My Classes?' },
      { id: 'il-games', label: 'Saved games', prompt: 'Where do games I create in Content Maker appear?' },
    ]
  }
  if (pathname.startsWith(ROUTES.instructor.classes)) {
    return [
      { id: 'ic-create', label: 'Create a class', prompt: 'How do I create a class and share a join code?' },
      { id: 'ic-quiz', label: 'Publish a quiz', prompt: 'How do I add and publish a quiz to a class?' },
      { id: 'ic-members', label: 'Manage students', prompt: 'How do I view or remove students from a class?' },
    ]
  }

  return [
    { id: 'in-class', label: 'Create a class', prompt: 'How do I create my first class and share a join code?' },
    { id: 'in-quiz', label: 'Add a quiz', prompt: 'What is the step-by-step way to publish a quiz to students?' },
    { id: 'in-studio', label: 'Content Maker', prompt: 'What is Content Maker and when should I use it vs My Classes?' },
    { id: 'in-perf', label: 'Student scores', prompt: 'How do I check student performance and quiz attempts?' },
  ]
}
