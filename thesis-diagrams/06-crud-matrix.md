# 4.6 CRUD Matrix — EduAIGames

The CRUD matrix maps each data entity (PostgreSQL table) to the operations each actor can perform:
**C** = Create, **R** = Read, **U** = Update, **D** = Delete, — = no access.

All operations were verified against the Express route handlers in `server/src/routes/` and the query modules in `server/src/`.
Super Admin inherits every Admin capability; only additional rights are listed in its column.

## Matrix

| # | Entity (table) | Guest | Student | Instructor | Admin | Super Admin (extra) |
|---|---|---|---|---|---|---|
| 1 | `users` (own account) | C (register) | R, U (profile, preferences, password) | R, U | R, U | R, U |
| 2 | `users` (other accounts) | — | — | R (class members) | C (import), R, U (edit, suspend, approve, reject, reset password), D | C/U/D admin accounts, impersonate |
| 3 | `email_otp_codes` | C, U (consume via register / password reset) | C, U (password reset) | C, U (password reset) | — | — |
| 4 | `user_login_events` | — | C (on login) | C (on login) | C (on login), R (login activity) | D (purge) |
| 5 | `plans` | — | — | — | — | R (list; seeded Free / Standard / Premium) |
| 6 | `institutions` | — | R (own institution info at login) | R (own institution info) | — | C, R, U, D; assign users |
| 7 | `classes` | — | R (joined + public listing) | C, R, U (incl. background), D (own only) | R, U, D (any) | same |
| 8 | `class_memberships` | — | C (join by code / browse), R (own), D (leave) | R (roster), D (remove student) | — (indirect via user/class delete) | same |
| 9 | `class_announcements` | — | R (enrolled classes) | C, R, D (own classes) | — | — |
| 10 | `class_topics` | — | R (enrolled classes) | C, R, D (own classes) | R | same |
| 11 | `class_topic_items` (files & quiz links) | — | R (view/download files, open quizzes) | C (upload file, attach quiz), R, D | R, D (content moderation) | same |
| 12 | `courses` (legacy course model) | — | R (enrolled) | C, R, U, D (own) | R | same |
| 13 | `student_enrollments` | — | C, R, D (own) | R, D (per course) | — | — |
| 14 | `quizzes` | — | R (published to joined classes) | C (manual or AI-generated), R, U, D (own); duplicate | R, U, D (any) | same |
| 15 | `questions` | — | R (while taking quiz / review) | C, R, U, D (nested in quiz save) | via quiz | same |
| 16 | `question_options` | — | R | C, R, U, D (nested in quiz save) | via quiz | same |
| 17 | `student_quiz_attempts` | — | C (submit), R (own grades & review) | R (performance analytics per class/quiz/student) | R (platform analytics) | same |
| 18 | `games` | — | R (published to joined classes) | C, R, U, D (own) | R, D (any) | same |
| 19 | `class_games` (publications) | — | R | C (publish), R, D (unpublish, own) | D | same |
| 20 | `notifications` | — | R, U (mark read), D (clear own) | R, U (mark read), D (clear own); C indirectly (reminders) | — | — |
| 21 | `admin_notifications` | C (indirect: pending registration) | — | — | R, U (mark read) | same |
| 22 | `admin_audit_log` | — | — | — | C (implicit on actions), R, D (clear) | R, export CSV |
| 23 | `platform_settings` | R (effective feature flags) | R (feature flags) | R (feature flags) | R, U (toggles) | R, U (extended settings) |
| 24 | Uploaded files (`server/uploads/`) | — | R (view/download, membership-checked) | C (upload, 15 MB limit), R, D (via item delete) | D (via content delete) | same |

## Operation-to-Endpoint Traceability

| Entity | Operation | Actor | Endpoint / Module |
|---|---|---|---|
| users | C (register + OTP) | Guest | `POST /api/auth/register/request-otp`, `POST /api/auth/register/verify-otp`, legacy `POST /api/auth/register` |
| users | U (profile / preferences / password) | Student, Instructor | `PUT /api/profile/:userId`, `PUT /api/profile/:userId/preferences`, `POST /api/profile/:userId/change-password` |
| users | U (approve / reject / suspend), D | Admin | `POST /api/admin/users/:userId/approve|reject|suspend|unsuspend|reset-password`, `DELETE /api/admin/users/:userId`, `POST /api/admin/users/bulk-delete`, `POST /api/admin/users/approve-all` |
| users | C (bulk import) | Admin | `POST /api/admin/users/import` (xlsx parsed client-side) |
| users (admins) | C/U/D | Super Admin | `POST /api/super-admin/admins`, `POST /api/super-admin/admins/:adminId/promote|demote|suspend|unsuspend`, `DELETE /api/super-admin/admins/:adminId` |
| email_otp_codes | C / consume | Guest | `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/verify` |
| user_login_events | C | any login | `recordUserLogin()` in `server/src/loginEvents.ts` |
| user_login_events | R / D | Admin / Super Admin | `GET /api/admin/login-activity`, `POST /api/super-admin/purge-login-events` |
| institutions, plans | C/R/U/D | Super Admin | `GET /api/super-admin/plans`, `GET/POST/PUT/DELETE /api/super-admin/institutions[...]`, `POST /api/super-admin/institutions/assign-user` |
| classes | C/R/U/D | Instructor | `POST /api/classes`, `GET /api/classes/instructor/:instructorId`, `PUT /api/classes/:classId`, `PUT /api/classes/:classId/background`, `DELETE /api/classes/:classId` |
| classes | R (browse), join | Student | `GET /api/classes/available/all`, `POST /api/classes/student/join-by-code`, `POST /api/classes/student/join/:classId` |
| classes | R/U/D (any) | Admin | `GET/PUT/DELETE /api/admin/classes[...]` |
| class_memberships | R (roster), D | Instructor | `GET /api/classes/:classId/instructor/:instructorId/members`, `DELETE /api/classes/:classId/instructor/:instructorId/students/:studentId` |
| class_memberships | D (leave) | Student | `DELETE /api/classes/student/:classId` |
| class_announcements | C/R/D | Instructor | `POST/GET /api/classes/:classId/announcements`, `DELETE /api/classes/:classId/announcements/:announcementId` |
| class_topics | C/D | Instructor | `POST /api/class-content/class/:classId/topics`, `DELETE /api/class-content/topics/:topicId` |
| class_topic_items | C (file upload) | Instructor | `POST /api/class-content/topics/:topicId/files` (Multer, 15 MB) |
| class_topic_items | C (attach quiz) | Instructor | `POST /api/class-content/topics/:topicId/quizzes` |
| class_topic_items | R (student view) | Student | `GET /api/class-content/class/:classId/student/:studentId`, `GET /api/class-content/files/:itemId/view|download` |
| class_topic_items | D | Instructor / Admin | `DELETE /api/class-content/items/:itemId`, `DELETE /api/admin/content/:itemId` |
| courses | C/R/U/D | Instructor | `POST/GET/PUT/DELETE /api/courses[...]` |
| student_enrollments | C/D | Student | `POST /api/courses/:courseId/enroll`, `DELETE /api/courses/:courseId/enroll/:studentId` |
| quizzes | C/R/U/D, duplicate | Instructor | `POST /api/quizzes`, `GET /api/quizzes/instructor/:instructorId`, `PUT /api/quizzes/:quizId`, `POST /api/quizzes/:quizId/duplicate`, `DELETE /api/quizzes/:quizId` |
| quizzes | C (AI generation) | Instructor | `POST /api/chat/quiz-generate` (moderated, then saved via `POST /api/quizzes`) |
| quizzes | R (available) | Student | `GET /api/quizzes/student/:studentId/available` |
| quizzes | R/U/D (any) | Admin | `GET/PUT/DELETE /api/admin/quizzes[...]`, `GET /api/admin/analytics/quizzes` |
| student_quiz_attempts | C | Student | `POST /api/quizzes/attempts/submit` (membership + max_attempts enforced) |
| student_quiz_attempts | R (grades, review) | Student | `GET /api/quizzes/attempts/student/:studentId`, `GET /api/quizzes/student/:studentId/quiz/:quizId/review` |
| student_quiz_attempts | R (analytics) | Instructor | `GET /api/quizzes/performance/instructor/:instructorId/class/:classId`, reminders via `POST /api/quizzes/performance/remind` |
| games | C/R/U/D | Instructor | `POST /api/games`, `GET /api/games/instructor/:instructorId`, `PUT /api/games/:gameId`, `DELETE /api/games/:gameId` |
| games | R (play) | Student | `GET /api/games/class/:classId/student/:studentId` |
| games | R/D (any) | Admin | `GET /api/admin/games`, `DELETE /api/admin/games/:gameId` |
| class_games | C (publish) / D (unpublish) | Instructor | `POST /api/games/:gameId/publish/:classId`, `DELETE /api/games/class-game/:classGameId` |
| notifications | R/U/D | Student, Instructor | `GET /api/notifications/user/:userId[...]`, `POST /api/notifications/user/:userId/mark-read`, `POST /api/notifications/user/:userId/clear` |
| admin_notifications | R/U | Admin | `GET /api/admin/notifications`, `POST /api/admin/notifications/mark-read` |
| admin_audit_log | R/D/export | Admin / Super Admin | `GET/DELETE /api/admin/audit-log`, `GET /api/super-admin/audit-log/export` |
| platform_settings | R/U | Admin / Super Admin | `GET/PUT /api/admin/settings`, `PUT /api/super-admin/settings`; read-only flags via `GET /api/platform/features` |
| data export | R | Admin | `GET /api/admin/export/:type` |

## Notes

1. All non-auth requests carry the caller's identity in the `X-User-Id` header; admin routes require `X-Admin-Id` validated by `requireAdmin` / `requireSuperAdmin` (`server/src/adminAuth.ts`).
2. Ownership is enforced in SQL (`WHERE instructor_id = $n`, membership checks) — an instructor can only modify their own classes, quizzes, and games.
3. Deleting a user, class, or quiz cascades to dependent rows (`ON DELETE CASCADE` on memberships, topics, items, questions, options, attempts, games).
4. AI endpoints (`/api/chat/*`) do not persist entities; they only read performance data and return generated content, so they do not appear as C/U/D rows except for AI quiz generation, which becomes a normal quiz insert when saved.
