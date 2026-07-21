# System Hierarchy Menu — EduAIGames

This document accompanies `09-system-hierarchy-menu.drawio` and lists the **navigation hierarchy** of the website as implemented in the frontend.

## Hierarchy overview

```
EduAIGames System
├── 1. Public Module (Guest)
│   ├── Front Page (/)
│   ├── Login (/login)
│   ├── Register (/register) — Email OTP
│   └── EduBot (Guest chat)
│
├── 2. Student Panel (/student/*)
│   ├── Home
│   │   └── Dashboard
│   ├── Enrolment
│   │   ├── Enrolled Classes
│   │   └── Join Class
│   ├── Learning
│   │   ├── Class Content
│   │   │   ├── Topics & Materials
│   │   │   ├── Take Quiz
│   │   │   └── Play Games (Maze / Snake / Breakout / Race)
│   │   ├── My Grades
│   │   └── AI Study Coach *
│   ├── Settings
│   ├── Logout
│   └── EduBot (Student) *
│
├── 3. Instructor Panel (/instructor/*)
│   ├── Home — Dashboard
│   ├── Teaching
│   │   ├── My Classes
│   │   │   ├── Manage Class /:classId
│   │   │   ├── Members /:classId/members
│   │   │   └── Class Quizzes /:classId/quizzes
│   │   ├── Library
│   │   │   ├── Quizzes tab
│   │   │   ├── Games tab
│   │   │   └── Edit Quiz /library/quiz/:id/edit
│   │   └── Content Maker *
│   │       ├── Create Quiz
│   │       └── Maze | Snake | Breakout | Race
│   ├── Insights — Student Performance
│   ├── Settings
│   ├── Logout
│   └── EduBot (Instructor) *
│
├── 4. Admin Panel (/admin)
│   ├── Overview
│   ├── Users
│   ├── Approvals
│   ├── Analytics
│   ├── Content
│   ├── Courses
│   ├── Classes
│   ├── Quizzes
│   ├── Import
│   ├── Audit Log
│   ├── Settings
│   └── Logout
│
└── 5. Super Admin Panel (/super-admin)
    ├── Institutions & Plans
    ├── Admins
    ├── Settings
    ├── Audit Log
    ├── System Health
    └── Logout
```

`*` = shown only when the institution plan enables that feature.

---

## Route reference

| Menu item | Route | Source file |
|---|---|---|
| Front Page | `/` | `PublicPages.tsx` → `FrontPage.tsx` |
| Login | `/login` | `Login.tsx` |
| Register | `/register` | `Registration.tsx` |
| Student Dashboard | `/student/dashboard` | `StudentLayout.tsx` |
| Enrolled Classes | `/student/classes` | `StudentLayout.tsx` |
| Join Class | `/student/join` | `StudentLayout.tsx` |
| Class Content | `/student/courses` | `StudentLayout.tsx` |
| Take Quiz | `/student/quiz/:classId/:quizId` | `AppRoutes.tsx` |
| Play Games | `/student/games/maze\|snake\|breakout\|race` | `AppRoutes.tsx` |
| My Grades | `/student/grades` | `StudentLayout.tsx` |
| AI Study Coach | `/student/study-coach` | `StudentLayout.tsx` |
| Instructor Dashboard | `/instructor/dashboard` | `InstructorLayout.tsx` |
| My Classes | `/instructor/classes` | `InstructorLayout.tsx` |
| Manage Class | `/instructor/classes/:classId` | `AppRoutes.tsx` |
| Content Maker | `/instructor/studio/*` | `InstructorLayout.tsx` |
| Library | `/instructor/library` | `InstructorLayout.tsx` |
| Student Performance | `/instructor/performance` | `InstructorLayout.tsx` |
| Admin tabs | `/admin` (internal tabs) | `AdminDashboard.tsx` |
| Super Admin tabs | `/super-admin` (internal tabs) | `AdminDashboard.tsx` |

---

## Navigation types

| Panel | UI pattern | Component |
|---|---|---|
| Public | Top nav + CTA buttons | `FrontPage.tsx` |
| Student | Left sidebar (grouped sections) | `StudentLayout.tsx` |
| Instructor | Left sidebar (grouped sections) | `InstructorLayout.tsx` |
| Admin | Horizontal tab bar | `AdminDashboard.tsx` |
| Super Admin | Horizontal tab bar | `AdminDashboard.tsx` |

---

## Post-login redirect

| Role | Default route |
|---|---|
| Student | `/student/dashboard` |
| Instructor | `/instructor/dashboard` |
| Admin | `/admin` |
| Super Admin | `/super-admin` |

Defined in `PublicPages.tsx` → `redirectPathForUser()`.

---

## How to open

Open `09-system-hierarchy-menu.drawio` in [app.diagrams.net](https://app.diagrams.net) or VS Code with the Draw.io Integration extension. Export at 200–300 % zoom for thesis print quality.
