# Package Diagram — EduAIGames

This document describes the UML package diagram in `07-package-diagram.drawio`, derived from the actual folder structure in `EduAIGames/src/` (frontend) and `server/src/` (backend).

## Overview

EduAIGames follows a **3-layer package architecture**:

| Layer | Package root | Technology |
|---|---|---|
| Presentation | `EduAIGames/` | React 19, TypeScript, Vite, React Router |
| Application | `server/` | Node.js, Express, TypeScript |
| Data | PostgreSQL + file storage | `pg`, multer |
| External | OpenAI API, SMTP | `openai.ts`, `emailService.ts` |

---

## Package structure

### Presentation Layer (`EduAIGames/src/`)

```
EduAIGames/
├── routes/          AppRoutes, paths, ProtectedRoute, GuestRoute
├── pages/           PublicPages, StudentPages, InstructorPages
├── layouts/         StudentLayout, InstructorLayout
├── context/         AuthContext, SidebarContext, PanelUIContext, MobileNavContext
├── api/             client.ts (HTTP helpers + X-User-Id header)
├── hooks/           usePlatformFeatures, useSessionTimeout, useGameViewport, …
├── utils/           quizSessionUtils, chatbotUtils, studentPerformanceUtils, …
├── types/           user.ts (UserRole, User, AccountStatus)
└── components/
    ├── auth/        Login, Registration, LoginRobot, FrontPage
    ├── student/     StudentDashboard, StudentJoinClass, QuizAnswering, StudentGrades, …
    ├── instructor/  InstructorDashboard, QuizCreation, EditQuiz, StudentPerformance, …
    ├── games/       MazeGameQuiz, SnakeGameQuiz, BreakoutGameQuiz, TriviaRaceGameQuiz
    ├── ai/          AIChatbot, SideEduBot, AIQuizGenerator, StudentStudyCoachHub
    ├── admin/       AdminDashboard, AdminExtendedPanels
    └── shared/      NotificationBell, ProfileSettings, PanelBreadcrumbs, ThemeToggle
```

### Application Layer (`server/src/`)

```
server/
├── index.ts                 Express bootstrap, route mounting, CORS, static serve
├── routes/
│   ├── auth.ts              Register OTP, login, password reset
│   ├── classes.ts           Class CRUD, join-by-code, memberships
│   ├── classContent.ts      Topics, file upload, quiz attachment
│   ├── announcements.ts     Class announcements
│   ├── quizzes.ts           Quiz CRUD, attempts, performance
│   ├── games.ts             Game CRUD, publish to class
│   ├── chat.ts              EduBot, Study Coach, AI quiz generate
│   ├── courses.ts           Legacy course management
│   ├── notifications.ts     User notifications
│   ├── profile.ts           Avatar, preferences, change password
│   ├── admin.ts             Admin user/content management
│   ├── adminExtended.ts     Admin extended panels
│   └── superAdmin.ts        Institutions, plans, audit, system health
├── services/
│   ├── adminServices.ts     Admin business logic
│   ├── superAdminServices.ts
│   ├── institutionServices.ts  Plans, institutions, feature resolution
│   ├── platformFeatures.ts     Global feature flags
│   ├── featureGate.ts          Middleware feature gating
│   ├── notificationService.ts  Notification dispatch
│   ├── emailService.ts         SMTP / OTP emails
│   ├── studyCoachService.ts    AI Study Coach logic
│   └── adminAuth.ts            Admin/SuperAdmin auth middleware
├── persistence/  (query modules)
│   ├── queries.ts              User queries
│   ├── userAccountStatus.ts    Account approval status
│   ├── classQueries.ts         Class & membership queries
│   ├── classTopicQueries.ts    Topic & item queries
│   ├── quizQueries.ts          Quiz, question, attempt queries
│   ├── gameQueries.ts          Game & class_game queries
│   ├── courseQueries.ts        Course & enrollment queries
│   ├── notificationQueries.ts  Notification CRUD
│   └── loginEvents.ts          Login analytics
└── infrastructure/
    ├── db.ts                   PostgreSQL connection pool
    ├── setupDatabase.ts        Schema bootstrap (22 tables)
    ├── adminInfrastructure.ts  Audit log, platform settings
    ├── openai.ts               OpenAI API client
    ├── envConfig.ts            Environment & CORS config
    ├── ensureAdmin.ts          Seed default Admin account
    └── ensureSuperAdmin.ts     Seed default SuperAdmin account
```

### Data Layer

| Package | Contents |
|---|---|
| PostgreSQL (`fyp`) | 22 tables: users, plans, institutions, classes, quizzes, games, attempts, notifications, audit, … |
| File Storage | `server/uploads/` — class material files (multer) |
| Browser Storage | `localStorage` — user session, chat session, activity marker |

### External Systems

| System | Used by | Purpose |
|---|---|---|
| OpenAI API | `openai.ts` via `chat.ts` | EduBot, AI quiz generation, Study Coach |
| SMTP (Nodemailer) | `emailService.ts` via `auth.ts` | Registration OTP, password reset OTP |

---

## Key dependencies

| From | To | Relationship |
|---|---|---|
| `api/client.ts` | `server/index.ts` | HTTP REST `/api/*` |
| `routes/*` | `services/*` | Business logic delegation |
| `routes/*` | `persistence/*` | Direct DB queries |
| `services/*` | `persistence/*` | Data access |
| `persistence/*` | `db.ts` | pg pool / SQL |
| `db.ts` | PostgreSQL | JDBC-style connection |
| `routes/classContent.ts` | `server/uploads/` | File upload (multer) |
| `routes/chat.ts` | OpenAI API | AI requests |
| `routes/auth.ts` | SMTP | OTP email delivery |
| `pages/*` | `components/*` | UI composition |
| `routes/AppRoutes` | `pages/*` | Route-to-page mapping |
| `components/*` | `api/client.ts` | API calls |
| `components/*` | `context/*` | Shared state (auth, UI) |

---

## How to open

Same as other thesis diagrams — open `07-package-diagram.drawio` in [app.diagrams.net](https://app.diagrams.net) or VS Code with the Draw.io Integration extension.

Export: **File → Export as → PNG** at 200–300 % zoom for thesis print quality.
