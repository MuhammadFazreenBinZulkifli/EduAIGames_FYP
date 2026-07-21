# 4.2 Use Case Descriptions — EduAIGames

This section provides formal descriptions for every use case shown in the Use Case Diagram (Section 4.1).
All flows are derived from the actual implementation (React frontend in `EduAIGames/src`, Express + PostgreSQL backend in `server/src`).

Actors: **Guest**, **Student**, **Instructor**, **Admin**, **Super Admin** (specializes Admin), and external systems **OpenAI API** and **SMTP Email Service**.

---

## UC-01: View Front Page

| Field | Description |
|---|---|
| **ID** | UC-01 |
| **Name** | View Front Page |
| **Actors** | Guest |
| **Description** | A visitor views the public landing page presenting the platform's features, how-it-works section, and calls to action. |
| **Preconditions** | None. |
| **Main Flow** | 1. Guest navigates to `/`. 2. System renders the front page (`FrontPage.tsx`) with feature highlights, theme toggle, and Login/Register buttons. 3. If the chatbot feature is enabled, the EduBot widget is shown. |
| **Alternate Flows** | A1: A logged-in user visiting `/login` or `/register` is redirected to their role dashboard by `GuestRoute`. |
| **Postconditions** | The guest can proceed to register, log in, or chat with EduBot. |

## UC-02: Register Account (Student / Instructor)

| Field | Description |
|---|---|
| **ID** | UC-02 |
| **Name** | Register Account |
| **Actors** | Guest; SMTP Email Service |
| **Description** | A guest creates a new Student or Instructor account with email OTP verification and (by default) admin approval. |
| **Preconditions** | Platform setting `registration_open` is true. Email is not already registered. |
| **Main Flow** | 1. Guest opens `/register` and enters username, email, password (min 6 chars), and role (Student or Instructor). 2. System validates input and calls `POST /api/auth/register/request-otp`. 3. Server checks registration is open, hashes the password (bcrypt), stores an OTP record in `email_otp_codes` (10-minute expiry), and sends a 6-digit OTP via the SMTP service. 4. Guest enters the OTP; system calls `POST /api/auth/register/verify-otp`. 5. Server resolves the institution by email domain and checks the seat limit, consumes the OTP, and creates the user with `account_status = 'pending'` (when `require_admin_approval` is true). 6. Server inserts an admin notification (`pending_registration`). 7. System shows "Registration submitted — wait for admin approval." |
| **Alternate Flows** | A1: Registration closed — server returns 403 and registration stops. A2: Email already registered or pending — error shown. A3: Institution seat limit reached — 403 `Seat limit` error. A4: OTP invalid/expired — error, guest can request a new OTP. A5: SMTP not configured — legacy `POST /api/auth/register` is used without OTP. A6: `require_admin_approval` false — account is created as `approved` and can log in immediately. |
| **Postconditions** | A new row exists in `users` with status `pending` (or `approved`); admins are notified. |

## UC-03: Verify Email OTP

| Field | Description |
|---|---|
| **ID** | UC-03 |
| **Name** | Verify Email OTP |
| **Actors** | Guest; SMTP Email Service |
| **Description** | Included by Register Account and Reset Password: the user proves email ownership by entering a 6-digit one-time code. |
| **Preconditions** | An unconsumed OTP record exists in `email_otp_codes` for the email and purpose (`register` or `password-reset`). |
| **Main Flow** | 1. User enters the OTP received by email. 2. Server fetches the latest unconsumed OTP for the email/purpose. 3. Server verifies expiry (10 minutes) and compares SHA-256 hashes. 4. Server marks the OTP `consumed = TRUE` and returns the stored payload. |
| **Alternate Flows** | A1: No OTP found — "OTP not found, request a new one." A2: OTP expired — error. A3: Hash mismatch — "Invalid OTP code." |
| **Postconditions** | OTP consumed; the including use case continues. |

## UC-04: Log In

| Field | Description |
|---|---|
| **ID** | UC-04 |
| **Name** | Log In |
| **Actors** | Guest (becoming Student / Instructor / Admin / Super Admin) |
| **Description** | A registered user authenticates with email and password and is routed to their role dashboard. |
| **Preconditions** | User account exists with `account_status = 'approved'`. |
| **Main Flow** | 1. User submits email and password on `/login` (`Login.tsx`). 2. System calls `POST /api/auth/login`. 3. Server finds user by email and verifies password with bcrypt. 4. Server checks `account_status`. 5. Server checks the user's institution status (Students/Instructors of suspended institutions are blocked). 6. Server records a row in `user_login_events`. 7. Server returns the user object (id, username, email, role, institution info); client stores it in `localStorage` via `AuthContext`. 8. Client redirects to the saved path or the role dashboard (`/student/dashboard`, `/instructor/dashboard`, `/admin`, `/super-admin`). |
| **Alternate Flows** | A1: Unknown email or wrong password — 401 "Invalid email or password". A2: Status `pending` — 403 `ACCOUNT_PENDING`. A3: Status `rejected` — 403 `ACCOUNT_REJECTED`. A4: Status `suspended` — 403 `ACCOUNT_SUSPENDED`. A5: Institution suspended — 403 `INSTITUTION_SUSPENDED`. |
| **Postconditions** | Session established client-side; login event recorded. Students/Instructors get a 15-minute inactivity timeout (`useRoleSessionTimeout`). |

## UC-05: Reset Password

| Field | Description |
|---|---|
| **ID** | UC-05 |
| **Name** | Reset Password |
| **Actors** | Guest; SMTP Email Service |
| **Description** | A user who forgot their password sets a new one after OTP verification. |
| **Preconditions** | SMTP email service configured. |
| **Main Flow** | 1. User clicks "Forgot password?" in the login page modal. 2. System calls `POST /api/auth/password-reset/request` with the email. 3. If the account exists, server stores an OTP and emails it (response is always success to prevent account enumeration). 4. User enters OTP and new password (min 6 chars); system calls `POST /api/auth/password-reset/verify`. 5. Server consumes the OTP (UC-03), hashes the new password, and updates `users.password`. |
| **Alternate Flows** | A1: OTP invalid/expired — error. A2: Email service not configured — 503 error. |
| **Postconditions** | Password updated; user can log in with the new password. |

## UC-06: Chat with EduBot (AI Assistant)

| Field | Description |
|---|---|
| **ID** | UC-06 |
| **Name** | Chat with EduBot |
| **Actors** | Guest, Student, Instructor; OpenAI API |
| **Description** | User converses with the AI assistant for website help and tutoring. |
| **Preconditions** | Platform features `chatbot_enabled` and `openai_enabled` are on (institution plan and platform settings). |
| **Main Flow** | 1. User opens the EduBot widget (`AIChatbot.tsx` / `SideEduBot.tsx`). 2. User sends a message; system calls `POST /api/chat` with the message, page context, and role. 3. Server (feature-gated) forwards the prompt to the OpenAI Chat Completions API (`gpt-4o-mini`). 4. Response is displayed; chat history is kept in session storage. |
| **Alternate Flows** | A1: Feature disabled — widget hidden or request rejected by `requireFeature`. A2: OpenAI error — friendly error message shown. |
| **Postconditions** | None persisted server-side; chat history in client session storage. |

## UC-07: Join Class

| Field | Description |
|---|---|
| **ID** | UC-07 |
| **Name** | Join Class |
| **Actors** | Student |
| **Description** | A student enrolls in a class either by entering a join code or by browsing public classes. |
| **Preconditions** | Student logged in; class exists. |
| **Main Flow** | 1. Student opens `/student/join` (`StudentJoinClass.tsx`). 2a. Student enters a join code; system calls `POST /api/classes/student/join-by-code`. 2b. Or student browses public classes (`GET /api/classes/available/all`) and clicks Join (`POST /api/classes/student/join/:classId`). 3. Server validates the class and inserts a row into `class_memberships` (unique per student+class). 4. Server notifies the instructor that a student joined. 5. Class appears in "My Classes". |
| **Alternate Flows** | A1: Invalid join code — error. A2: Already a member — error (unique constraint). A3: Private class — not listed in browse; join code required. |
| **Postconditions** | New `class_memberships` row; instructor notified. |

## UC-08: View Class Content

| Field | Description |
|---|---|
| **ID** | UC-08 |
| **Name** | View Class Content |
| **Actors** | Student |
| **Description** | A student views the topics, files, quizzes, games, and announcements of an enrolled class. |
| **Preconditions** | Student is a member of the class. |
| **Main Flow** | 1. Student opens `/student/courses` (`StudentCourses.tsx`) and selects a class. 2. System loads topics and items (`GET /api/class-content/class/:classId/student/:studentId`), published games (`GET /api/games/class/:classId/student/:studentId`), and announcements (`GET /api/classes/:classId/announcements`). 3. Content is displayed grouped by topic. |
| **Alternate Flows** | A1: Not enrolled — server rejects with "You are not enrolled in this class." |
| **Postconditions** | None. |

## UC-09: Download / View Course Materials

| Field | Description |
|---|---|
| **ID** | UC-09 |
| **Name** | Download / View Course Materials |
| **Actors** | Student |
| **Description** | A student opens or downloads a file uploaded by the instructor. |
| **Preconditions** | Student enrolled in the class; item of type `file` exists. |
| **Main Flow** | 1. Student clicks a file item. 2. System calls `GET /api/class-content/files/:itemId/view` (inline) or `/download` with the student id. 3. Server verifies membership and streams the file from `server/uploads/`. |
| **Alternate Flows** | A1: Access denied if not a class member. A2: File missing on disk — 404. |
| **Postconditions** | None. |

## UC-10: Take Quiz

| Field | Description |
|---|---|
| **ID** | UC-10 |
| **Name** | Take Quiz |
| **Actors** | Student |
| **Description** | A student answers a published quiz (multiple-choice / true-false), possibly with a time limit and shuffled questions. Includes UC-11 Submit Quiz Attempt. |
| **Preconditions** | Student enrolled in a class where the quiz is published; attempts remaining (`max_attempts`). |
| **Main Flow** | 1. Student opens `/student/quiz` or a deep link `/student/quiz/:classId/:quizId` (`QuizAnswering.tsx`). 2. System loads the quiz with questions and options (`GET /api/quizzes/:quizId`), applying shuffle settings. 3. System checks the attempt count (`GET /api/quizzes/student/:studentId/quiz/:quizId/attempt-count`). 4. Student answers questions; progress is autosaved in local storage (`quizProgress.ts`). 5. Timer counts down if `time_limit_minutes` is set. 6. Student submits (UC-11). |
| **Alternate Flows** | A1: Max attempts reached — quiz not startable. A2: Student leaves mid-quiz — progress restored on return. A3: Timer expires — auto-submit. |
| **Postconditions** | Attempt recorded (see UC-11). |

## UC-11: Submit Quiz Attempt

| Field | Description |
|---|---|
| **ID** | UC-11 |
| **Name** | Submit Quiz Attempt |
| **Actors** | Student |
| **Description** | The system grades the student's answers and stores the attempt. Included by Take Quiz and Play Learning Game. |
| **Preconditions** | Active quiz session with answers. |
| **Main Flow** | 1. Client computes score, correct answers, and total questions, and calls `POST /api/quizzes/attempts/submit` with responses. 2. Server verifies the student can access the quiz (class membership via `canStudentAccessQuiz`). 3. Server enforces `max_attempts`. 4. Server inserts a row into `student_quiz_attempts` (score, correct_answers, total_questions, responses JSONB). 5. Server notifies the instructor of the attempt. 6. Result screen shown (subject to `show_results_after`). |
| **Alternate Flows** | A1: Not enrolled — 403. A2: Max attempts reached — 403 with message. |
| **Postconditions** | New `student_quiz_attempts` row; instructor notification created. |

## UC-12: View Grades & Quiz Review

| Field | Description |
|---|---|
| **ID** | UC-12 |
| **Name** | View Grades & Quiz Review |
| **Actors** | Student |
| **Description** | A student reviews their quiz scores, letter grades, and per-question feedback. |
| **Preconditions** | Student has at least one quiz attempt. |
| **Main Flow** | 1. Student opens `/student/grades` (`StudentGrades.tsx`). 2. System loads attempts (`GET /api/quizzes/attempts/student/:studentId`, optionally filtered by class). 3. Student opens a review (`GET /api/quizzes/student/:studentId/quiz/:quizId/review`) showing each question, the student's answer, the correct answer, and explanations. |
| **Alternate Flows** | A1: Review hidden when quiz `show_results_after` policy does not allow it. |
| **Postconditions** | None. |

## UC-13: Play Learning Game

| Field | Description |
|---|---|
| **ID** | UC-13 |
| **Name** | Play Learning Game (Maze / Snake / Breakout / Trivia Race) |
| **Actors** | Student |
| **Description** | A student plays a quiz-driven arcade game published to their class; answering questions is part of gameplay. Includes UC-11. |
| **Preconditions** | Game published to an enrolled class (`class_games`). |
| **Main Flow** | 1. Student opens the game from class content (`/student/games/maze|snake|breakout|race`). 2. System loads the game and its linked quiz (`GET /api/games/class/:classId/student/:studentId`). 3. Student plays; quiz questions appear per the game's mechanics (`settings` JSON controls game options such as ghost mode). 4. On completion, the score is submitted as a quiz attempt (UC-11). |
| **Alternate Flows** | A1: Games feature disabled by plan/settings — not accessible. A2: How-to-play modal shown on first play (user preference). |
| **Postconditions** | Quiz attempt stored; instructor notified. |

## UC-14: Use AI Study Coach

| Field | Description |
|---|---|
| **ID** | UC-14 |
| **Name** | Use AI Study Coach |
| **Actors** | Student; OpenAI API |
| **Description** | A student gets personalized AI study support in five modes: Insights, Review, Practice, Create, and Ask Coach. |
| **Preconditions** | `openai_enabled` feature active; student logged in. |
| **Main Flow** | 1. Student opens `/student/study-coach` (`StudentStudyCoachHub.tsx`). 2. Insights: `POST /api/chat/study-coach` returns summary, strengths, focus areas, recommendations. 3. Review: `POST /api/chat/study-coach/explain` explains a mistake with a memory tip. 4. Practice: `POST /api/chat/study-coach/practice` generates practice questions from weak areas. 5. Create: `POST /api/chat/study-coach/create` generates custom study questions. 6. Ask Coach: `POST /api/chat/study-coach/ask` free-form chat grounded in the student's performance data. A related feature, class AI Analyse, uses `POST /api/chat/study-coach/class-overview`. |
| **Alternate Flows** | A1: No attempt data — coach responds with generic guidance. A2: Feature gated off — tab unavailable. |
| **Postconditions** | None persisted server-side; tab state cached in session storage. |

## UC-15: View Notifications

| Field | Description |
|---|---|
| **ID** | UC-15 |
| **Name** | View Notifications |
| **Actors** | Student, Instructor |
| **Description** | A user views and manages in-app notifications (new quiz/game/content, announcements, reminders, student joins, quiz completions). |
| **Preconditions** | User logged in. |
| **Main Flow** | 1. User opens the notification bell (`NotificationBell.tsx`). 2. System loads `GET /api/notifications/user/:userId` and the unread count. 3. User marks notifications read (`POST /api/notifications/user/:userId/mark-read`) or clears them (`POST /api/notifications/user/:userId/clear`). |
| **Alternate Flows** | — |
| **Postconditions** | `read_at` set or rows deleted in `notifications`. |

## UC-16: Manage Profile & Preferences

| Field | Description |
|---|---|
| **ID** | UC-16 |
| **Name** | Manage Profile & Preferences |
| **Actors** | Student, Instructor |
| **Description** | A user updates their username, avatar, preferences, and password. |
| **Preconditions** | User logged in. |
| **Main Flow** | 1. User opens Settings (`ProfileSettings.tsx`). 2. Profile update via `PUT /api/profile/:userId` (username, avatar_url). 3. Preferences via `PUT /api/profile/:userId/preferences` (JSONB, e.g. game how-to prompts). 4. Password change via `POST /api/profile/:userId/change-password` (current password verified with bcrypt). |
| **Alternate Flows** | A1: Wrong current password — error. |
| **Postconditions** | `users` row updated. |

## UC-17: Leave Class

| Field | Description |
|---|---|
| **ID** | UC-17 |
| **Name** | Leave Class |
| **Actors** | Student |
| **Description** | A student un-enrolls from a class. |
| **Preconditions** | Student is a member of the class. |
| **Main Flow** | 1. Student chooses Leave Class in My Classes. 2. System calls `DELETE /api/classes/student/:classId`. 3. Server deletes the `class_memberships` row. |
| **Alternate Flows** | — |
| **Postconditions** | Membership removed; class content no longer accessible. |

## UC-18: Manage Classes

| Field | Description |
|---|---|
| **ID** | UC-18 |
| **Name** | Manage Classes |
| **Actors** | Instructor |
| **Description** | An instructor creates, edits, and deletes classes, each with an auto-generated join code and public/private visibility. |
| **Preconditions** | Instructor logged in. |
| **Main Flow** | 1. Instructor opens `/instructor/classes` (`InstructorClassManagement.tsx`). 2. Create: `POST /api/classes` (title, description, visibility) — server generates a unique join code. 3. Edit: `PUT /api/classes/:classId`; background image via `PUT /api/classes/:classId/background`. 4. Delete: `DELETE /api/classes/:classId` (cascades memberships, topics, items, announcements). |
| **Alternate Flows** | A1: Class limit constraints (`constants/classLimits.ts`). |
| **Postconditions** | `classes` table updated. |

## UC-19: Manage Class Topics & Content

| Field | Description |
|---|---|
| **ID** | UC-19 |
| **Name** | Manage Class Topics & Content |
| **Actors** | Instructor |
| **Description** | An instructor structures a class into topics and attaches files and quizzes as topic items. Includes UC-20 Upload Course Files. |
| **Preconditions** | Instructor owns the class. |
| **Main Flow** | 1. Instructor opens `/instructor/classes/:classId` (`InstructorManageClass.tsx`). 2. Create topic: `POST /api/class-content/class/:classId/topics`. 3. Attach quiz: `POST /api/class-content/topics/:topicId/quizzes` (creates a `class_topic_items` row of type `quiz`). 4. Upload file (UC-20). 5. Delete item: `DELETE /api/class-content/items/:itemId`; delete topic: `DELETE /api/class-content/topics/:topicId`. 6. Students in the class are notified of new content. |
| **Alternate Flows** | A1: Ownership check fails — 403. |
| **Postconditions** | `class_topics` / `class_topic_items` updated; student notifications created. |

## UC-20: Upload Course Files

| Field | Description |
|---|---|
| **ID** | UC-20 |
| **Name** | Upload Course Files |
| **Actors** | Instructor |
| **Description** | An instructor uploads a document (PDF etc., max 15 MB) into a class topic. |
| **Preconditions** | Topic exists; file type allowed. |
| **Main Flow** | 1. Instructor drops a file in the upload zone. 2. System sends multipart `POST /api/class-content/topics/:topicId/files` (Multer). 3. Server validates extension/MIME and size, stores the file in `server/uploads/`, and creates a `class_topic_items` row of type `file`. |
| **Alternate Flows** | A1: Disallowed type or over 15 MB — 400 error. |
| **Postconditions** | File stored; item visible to enrolled students. |

## UC-21: Manage Class Members

| Field | Description |
|---|---|
| **ID** | UC-21 |
| **Name** | Manage Class Members |
| **Actors** | Instructor |
| **Description** | An instructor views the roster of a class and can remove students. |
| **Preconditions** | Instructor owns the class. |
| **Main Flow** | 1. Instructor opens `/instructor/classes/:classId/members`. 2. System loads `GET /api/classes/:classId/instructor/:instructorId/members`. 3. Remove: `DELETE /api/classes/:classId/instructor/:instructorId/students/:studentId`. |
| **Alternate Flows** | — |
| **Postconditions** | `class_memberships` row deleted for removed students. |

## UC-22: Post Announcements

| Field | Description |
|---|---|
| **ID** | UC-22 |
| **Name** | Post Announcements |
| **Actors** | Instructor |
| **Description** | An instructor posts short announcements (max 500 characters) to a class; students are notified. |
| **Preconditions** | Instructor owns the class. |
| **Main Flow** | 1. Instructor writes an announcement in Manage Class. 2. System calls `POST /api/classes/:classId/announcements`. 3. Server inserts into `class_announcements` and notifies enrolled students. 4. Delete: `DELETE /api/classes/:classId/announcements/:announcementId`. |
| **Alternate Flows** | A1: Over 500 characters — rejected by DB check constraint / validation. |
| **Postconditions** | Announcement stored and visible to students. |

## UC-23: Create / Edit Quiz

| Field | Description |
|---|---|
| **ID** | UC-23 |
| **Name** | Create / Edit Quiz |
| **Actors** | Instructor |
| **Description** | An instructor builds a quiz with multiple-choice and true/false questions and configures delivery settings. Extended by UC-24 Generate Quiz with AI. |
| **Preconditions** | Instructor logged in; `quizzes_enabled` feature on. |
| **Main Flow** | 1. Instructor opens `/instructor/studio/quiz` (`QuizCreation.tsx`). 2. Instructor enters title, description, and settings: time limit, shuffle questions/options, max attempts, show-results policy, allow late submit. 3. Instructor adds questions (text, type, options, correct answer, explanation). 4. System calls `POST /api/quizzes` — server inserts into `quizzes`, `questions`, `question_options` in order. 5. Edit uses `PUT /api/quizzes/:quizId`; duplicate uses `POST /api/quizzes/:quizId/duplicate`; delete uses `DELETE /api/quizzes/:quizId`. |
| **Alternate Flows** | A1: Validation error (no questions, missing correct answer) — save blocked. A2: AI generation (UC-24) prefills the question list. |
| **Postconditions** | Quiz persisted and available in the instructor's library. |

## UC-24: Generate Quiz with AI

| Field | Description |
|---|---|
| **ID** | UC-24 |
| **Name** | Generate Quiz with AI |
| **Actors** | Instructor; OpenAI API |
| **Description** | The system generates quiz questions from a topic prompt using OpenAI, with content moderation. |
| **Preconditions** | Features `ai_quiz_enabled` and `openai_enabled` on. |
| **Main Flow** | 1. Instructor opens the AI generator (`AIQuizGenerator.tsx`) and enters topic, difficulty, question count, and type. 2. System calls `POST /api/chat/quiz-generate`. 3. Server moderates the prompt (OpenAI Moderation + education classifier). 4. Server requests question generation from OpenAI (`gpt-4o-mini`) and parses the JSON result. 5. Generated questions (with options, correct answers, explanations) are inserted into the quiz editor for review. 6. Instructor edits/accepts and saves (UC-23). |
| **Alternate Flows** | A1: Prompt flagged by moderation — request blocked and logged. A2: OpenAI failure — error, instructor can retry. |
| **Postconditions** | Nothing stored until the instructor saves the quiz. |

## UC-25: Create / Edit Game

| Field | Description |
|---|---|
| **ID** | UC-25 |
| **Name** | Create / Edit Game (Maze / Snake / Breakout / Trivia Race) |
| **Actors** | Instructor |
| **Description** | An instructor creates an arcade game bound to one of their quizzes, choosing the game type and settings. |
| **Preconditions** | Instructor has at least one quiz; `games_enabled` feature on. |
| **Main Flow** | 1. Instructor opens a builder (`/instructor/studio/maze|snake|breakout|race`). 2. Instructor selects a quiz, sets title, description, ghost mode, and game-specific settings. 3. System calls `POST /api/games` — server inserts into `games` (game_type, settings JSON). 4. Edit uses `PUT /api/games/:gameId`; delete uses `DELETE /api/games/:gameId` (ownership enforced). |
| **Alternate Flows** | A1: Editing a game not owned — server error "Game not found or you do not own it." |
| **Postconditions** | Game stored in the library, ready for publishing. |

## UC-26: Publish Quiz / Game to Class

| Field | Description |
|---|---|
| **ID** | UC-26 |
| **Name** | Publish Quiz / Game to Class |
| **Actors** | Instructor |
| **Description** | An instructor makes a quiz or game available to a class; enrolled students are notified. |
| **Preconditions** | Instructor owns both the class and the quiz/game. |
| **Main Flow** | 1. Quiz: attached to a class topic via `POST /api/class-content/topics/:topicId/quizzes`. 2. Game: `POST /api/games/:gameId/publish/:classId` — server upserts a `class_games` row. 3. Server notifies enrolled students of the new quiz/game. 4. Unpublish game: `DELETE /api/games/class-game/:classGameId`. |
| **Alternate Flows** | A1: Already published — publish timestamp refreshed (upsert). |
| **Postconditions** | Content visible to students; notifications created. |

## UC-27: View Student Performance Analytics

| Field | Description |
|---|---|
| **ID** | UC-27 |
| **Name** | View Student Performance Analytics |
| **Actors** | Instructor |
| **Description** | An instructor analyzes quiz results per class, per quiz, and per student, and can export CSV. |
| **Preconditions** | Instructor has classes with quiz attempts. |
| **Main Flow** | 1. Instructor opens `/instructor/performance` (`StudentPerformance.tsx`). 2. System loads `GET /api/quizzes/performance/instructor/:instructorId/class/:classId`. 3. Instructor filters by quiz/student, views averages and distributions, and exports CSV client-side. |
| **Alternate Flows** | A1: No attempts yet — empty state. |
| **Postconditions** | None. |

## UC-28: Send Quiz Reminders

| Field | Description |
|---|---|
| **ID** | UC-28 |
| **Name** | Send Quiz Reminders |
| **Actors** | Instructor |
| **Description** | An instructor reminds students who have not attempted a quiz. |
| **Preconditions** | Quiz published to the class. |
| **Main Flow** | 1. From the performance view, instructor clicks Remind. 2. System calls `POST /api/quizzes/performance/remind` with class_id, quiz_id, and target student ids. 3. Server inserts `quiz_reminder` notifications for the target students and returns the sent count. |
| **Alternate Flows** | — |
| **Postconditions** | Notification rows created for students. |

## UC-29: Manage Content Library

| Field | Description |
|---|---|
| **ID** | UC-29 |
| **Name** | Manage Content Library |
| **Actors** | Instructor |
| **Description** | An instructor browses all of their quizzes and games in one place and edits, duplicates, deletes, or publishes them. |
| **Preconditions** | Instructor logged in. |
| **Main Flow** | 1. Instructor opens `/instructor/library` (`InstructorQuizLibrary.tsx`). 2. System loads `GET /api/quizzes/instructor/:instructorId` and `GET /api/games/instructor/:instructorId`. 3. Instructor performs edit (UC-23/UC-25), duplicate, delete, or publish (UC-26) actions. |
| **Alternate Flows** | — |
| **Postconditions** | Depends on the action performed. |

## UC-30: Approve / Reject Registrations

| Field | Description |
|---|---|
| **ID** | UC-30 |
| **Name** | Approve / Reject Registrations |
| **Actors** | Admin, Super Admin |
| **Description** | An admin reviews pending account registrations and approves or rejects them. |
| **Preconditions** | Admin logged in (`X-Admin-Id` verified by `requireAdmin`); pending users exist. |
| **Main Flow** | 1. Admin opens the Approvals tab in the Admin Dashboard. 2. System loads `GET /api/admin/users/pending`. 3. Approve: `POST /api/admin/users/:userId/approve` sets `account_status = 'approved'`. 4. Reject: `POST /api/admin/users/:userId/reject` sets `rejected`. 5. Approve all: `POST /api/admin/users/approve-all`. 6. Action recorded in `admin_audit_log`. |
| **Alternate Flows** | A1: User already processed — no-op/error. |
| **Postconditions** | User status changed; user can (or cannot) log in; audit entry created. |

## UC-31: Manage Users

| Field | Description |
|---|---|
| **ID** | UC-31 |
| **Name** | Manage Users |
| **Actors** | Admin, Super Admin |
| **Description** | An admin searches, inspects, edits, suspends/unsuspends, resets passwords for, and deletes user accounts. |
| **Preconditions** | Admin logged in. |
| **Main Flow** | 1. Admin opens the Users tab (`GET /api/admin/users`). 2. Detail: `GET /api/admin/users/:userId/detail`. 3. Edit: `PUT /api/admin/users/:userId`. 4. Suspend/unsuspend: `POST /api/admin/users/:userId/suspend|unsuspend`. 5. Reset password: `POST /api/admin/users/:userId/reset-password`. 6. Delete: `DELETE /api/admin/users/:userId`; bulk delete: `POST /api/admin/users/bulk-delete`. 7. All actions logged to `admin_audit_log`. |
| **Alternate Flows** | A1: Admins cannot manage SuperAdmin accounts. |
| **Postconditions** | `users` table updated; audit entries created. |

## UC-32: Bulk Import Users

| Field | Description |
|---|---|
| **ID** | UC-32 |
| **Name** | Bulk Import Users |
| **Actors** | Admin, Super Admin |
| **Description** | An admin imports many accounts at once from a spreadsheet (xlsx). |
| **Preconditions** | Valid spreadsheet with username, email, password, role columns. |
| **Main Flow** | 1. Admin uploads the file in the Import tab; client parses it with the `xlsx` library. 2. System sends rows to `POST /api/admin/users/import`. 3. Server validates each row, hashes passwords, creates users, and reports per-row success/failure. |
| **Alternate Flows** | A1: Duplicate emails or invalid rows — reported as failures without aborting the batch. |
| **Postconditions** | Valid users created; import summary shown. |

## UC-33: Manage Platform Settings

| Field | Description |
|---|---|
| **ID** | UC-33 |
| **Name** | Manage Platform Settings |
| **Actors** | Admin, Super Admin |
| **Description** | An admin toggles platform-wide flags: registration_open, require_admin_approval, maintenance_mode, openai_enabled, games_enabled, quizzes_enabled, chatbot_enabled, ai_quiz_enabled. |
| **Preconditions** | Admin logged in. |
| **Main Flow** | 1. Admin opens the Settings tab (`GET /api/admin/settings`). 2. Admin toggles flags; system calls `PUT /api/admin/settings` (SuperAdmin extended settings via `PUT /api/super-admin/settings`). 3. Values stored in `platform_settings` (key/JSONB value); clients read effective flags from `GET /api/platform/features`. |
| **Alternate Flows** | — |
| **Postconditions** | Feature gates take effect for all users (combined with institution plan overrides). |

## UC-34: View Analytics & Audit Log

| Field | Description |
|---|---|
| **ID** | UC-34 |
| **Name** | View Analytics & Audit Log |
| **Actors** | Admin, Super Admin |
| **Description** | An admin monitors platform activity: overview stats, login activity, quiz analytics, and the admin action audit trail. |
| **Preconditions** | Admin logged in. |
| **Main Flow** | 1. Overview: `GET /api/admin/overview`; login chart: `GET /api/admin/login-activity` (from `user_login_events`). 2. Quiz analytics: `GET /api/admin/analytics/quizzes`. 3. Audit log: `GET /api/admin/audit-log`; clear: `DELETE /api/admin/audit-log`; SuperAdmin export: `GET /api/super-admin/audit-log/export`. |
| **Alternate Flows** | — |
| **Postconditions** | None (read-only, except audit clear). |

## UC-35: Manage Platform Content

| Field | Description |
|---|---|
| **ID** | UC-35 |
| **Name** | Manage Platform Content |
| **Actors** | Admin, Super Admin |
| **Description** | An admin oversees all classes, quizzes, games, and class content items across the platform, with edit/delete rights. |
| **Preconditions** | Admin logged in. |
| **Main Flow** | 1. Classes: `GET/PUT/DELETE /api/admin/classes[...]`. 2. Quizzes: `GET/PUT/DELETE /api/admin/quizzes[...]`. 3. Games: `GET /api/admin/games`, `DELETE /api/admin/games/:gameId`. 4. Content items: `GET /api/admin/content`, `DELETE /api/admin/content/:itemId`. 5. Data export: `GET /api/admin/export/:type`. 6. Actions audited. |
| **Alternate Flows** | — |
| **Postconditions** | Content updated/removed platform-wide; audit entries created. |

## UC-36: Manage Institutions & Subscription Plans

| Field | Description |
|---|---|
| **ID** | UC-36 |
| **Name** | Manage Institutions & Subscription Plans |
| **Actors** | Super Admin |
| **Description** | The super admin manages multi-tenant institutions: plan assignment (Free/Standard/Premium), seat limits, email domains, feature overrides, branding, and member assignment. |
| **Preconditions** | Super Admin logged in (`requireSuperAdmin`). |
| **Main Flow** | 1. Plans list: `GET /api/super-admin/plans`. 2. Institutions: `GET/POST /api/super-admin/institutions`, `PUT/DELETE /api/super-admin/institutions/:id`. 3. Members: `GET /api/super-admin/institutions/:id/members`; assign user: `POST /api/super-admin/institutions/assign-user`. 4. New registrations are routed to institutions by email domain and constrained by `seats_limit`. |
| **Alternate Flows** | A1: Suspending an institution blocks logins of its Students/Instructors. |
| **Postconditions** | `institutions`/`plans` updated; effective features change for members. |

## UC-37: Manage Admin Accounts

| Field | Description |
|---|---|
| **ID** | UC-37 |
| **Name** | Manage Admin Accounts |
| **Actors** | Super Admin |
| **Description** | The super admin creates, promotes, demotes, suspends, and deletes Admin accounts. |
| **Preconditions** | Super Admin logged in. |
| **Main Flow** | 1. List: `GET /api/super-admin/admins`. 2. Create: `POST /api/super-admin/admins`. 3. Promote/demote: `POST /api/super-admin/admins/:adminId/promote|demote`. 4. Suspend/unsuspend: `POST /api/super-admin/admins/:adminId/suspend|unsuspend`. 5. Delete: `DELETE /api/super-admin/admins/:adminId`. |
| **Alternate Flows** | A1: The seeded default super admin account cannot be removed. |
| **Postconditions** | Admin roster updated; audit entries created. |

## UC-38: Impersonate Users

| Field | Description |
|---|---|
| **ID** | UC-38 |
| **Name** | Impersonate Users |
| **Actors** | Super Admin |
| **Description** | The super admin temporarily signs in as a Student or Instructor for support/debugging; a banner indicates impersonation. |
| **Preconditions** | Super Admin logged in; target user exists. |
| **Main Flow** | 1. Super admin opens the Impersonate tab; targets from `GET /api/super-admin/impersonate/targets`. 2. `POST /api/super-admin/impersonate` returns the target user session object. 3. Client stores it and renders the target's dashboard with `ImpersonationBanner.tsx`. 4. Ending impersonation restores the super admin session. |
| **Alternate Flows** | A1: Cannot impersonate Admin/SuperAdmin accounts. |
| **Postconditions** | Impersonation recorded in the audit log. |

## UC-39: View System Health

| Field | Description |
|---|---|
| **ID** | UC-39 |
| **Name** | View System Health |
| **Actors** | Super Admin |
| **Description** | The super admin checks system status (database, email service, uptime) and can purge old login events. |
| **Preconditions** | Super Admin logged in. |
| **Main Flow** | 1. Open System tab: `GET /api/super-admin/system-health`. 2. Optionally purge login events: `POST /api/super-admin/purge-login-events`. |
| **Alternate Flows** | — |
| **Postconditions** | Optional deletion of `user_login_events` rows. |
