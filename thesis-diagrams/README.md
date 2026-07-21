# Thesis Diagrams — Chapter 4 Requirement Analysis (EduAIGames)

This folder contains every artifact for Chapter 4 of the thesis, generated from the actual EduAIGames codebase
(React 19 + Vite frontend in `EduAIGames/`, Express + PostgreSQL backend in `server/`, OpenAI `gpt-4o-mini` integration).

## Contents

| Section | File(s) | Format |
|---|---|---|
| 4.1 Use Case Diagram | `01-use-case-diagram.drawio` | draw.io |
| 4.2 Use Case Description | `02-use-case-descriptions.md` (UC-01 … UC-39) | Markdown tables |
| 4.3 Activity Diagrams | `03-activity-1-register.drawio` … `03-activity-7-admin-approval.drawio`, `03-activity-8-view-student-performance.drawio` | draw.io (swimlanes) |
| 4.4 Class Diagram | `04-class-diagram.drawio` (24 entities + 7 enumerations) | draw.io |
| 4.5 Sequence Diagrams | `05-sequence-1-register.drawio` … `05-sequence-7-admin-approval.drawio`, `05-sequence-8-view-student-performance.drawio` | draw.io |
| 4.6 CRUD Matrix | `06-crud-matrix.md` | Markdown tables |
| 4.7 Package Diagram | `07-package-diagram.drawio`, `07-package-diagram.md` | draw.io + Markdown |
| 4.8 Database Diagram | `08-database-diagram.drawio`, `08-database-diagram.md` (22 PostgreSQL tables) | draw.io + Markdown (Mermaid ERD) |
| 4.9 System Hierarchy Menu | `09-system-hierarchy-menu.drawio`, `09-system-hierarchy-menu.md` | draw.io + Markdown tree |

The seven modeled key flows (activity + sequence pairs):

1. Account registration with email OTP and admin approval
2. User login with account-status checks and role-based redirect
3. Student joins a class (join code or browse public classes)
4. Student takes and submits a quiz (attempt limits, timer, grading)
5. Instructor creates a quiz with AI generation and content moderation
6. Instructor creates a learning game and publishes it to a class
7. Admin approves or rejects a pending registration
8. Instructor views student performance analytics (class quiz overview, drill-down, reminders, CSV export)

## How to open the .drawio files

- **Online:** go to [app.diagrams.net](https://app.diagrams.net), choose *Open Existing Diagram*, and select the file.
- **Desktop:** install the [draw.io Desktop app](https://github.com/jgraph/drawio-desktop/releases) and double-click the file.
- **VS Code / Cursor:** install the *Draw.io Integration* extension (`hediet.vscode-drawio`); the files then open directly in the editor.

## Exporting images for the thesis document

In draw.io: **File > Export as > PNG** (or PDF/SVG).
Recommended settings for print quality: zoom 200–300 %, border width 10, transparent background off.
For Word/LibreOffice, PNG at 300 % works well; for LaTeX, export PDF and include with `\includegraphics`.

## Data sources (traceability)

- Database schema: `server/src/setupDatabase.ts`, `server/src/gameQueries.ts`, `server/src/institutionServices.ts`, `server/src/notificationQueries.ts`, `server/src/loginEvents.ts`, `server/src/adminInfrastructure.ts`, and column migrations in `server/src/index.ts`
- API endpoints: `server/src/routes/` (auth, classes, quizzes, games, class-content, announcements, notifications, chat, admin, super-admin, profile, courses)
- Roles and routing: `EduAIGames/src/types/user.ts`, `EduAIGames/src/routes/AppRoutes.tsx`, `EduAIGames/src/routes/ProtectedRoute.tsx`
- Student performance: `EduAIGames/src/components/StudentPerformance.tsx`, `server/src/routes/quizzes.ts` (`/performance/instructor/...`, `/performance/remind`), `server/src/quizQueries.ts` (`getClassStudentPerformance`, `getPublishedQuizzesForClass`)
