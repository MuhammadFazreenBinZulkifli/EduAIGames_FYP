# Database Diagram — EduAIGames PostgreSQL Schema

This document accompanies `08-database-diagram.drawio` and describes the **22-table** PostgreSQL schema used by EduAIGames (database name: `fyp`).

## Table inventory (22 tables)

| # | Table | Domain | FK parent(s) |
|---|---|---|---|
| 1 | `plans` | Tenancy | — |
| 2 | `institutions` | Tenancy | `plans` |
| 3 | `users` | Auth / users | `institutions` |
| 4 | `email_otp_codes` | Auth | *(none — pre-registration)* |
| 5 | `user_login_events` | Analytics | `users` |
| 6 | `classes` | Classes | `users` (instructor) |
| 7 | `class_memberships` | Classes | `users`, `classes` |
| 8 | `class_topics` | Class content | `classes` |
| 9 | `class_topic_items` | Class content | `class_topics`, `classes`, `quizzes` |
| 10 | `class_announcements` | Class content | `classes`, `users` |
| 11 | `quizzes` | Assessment | `users`, `classes`, `courses` |
| 12 | `questions` | Assessment | `quizzes` |
| 13 | `question_options` | Assessment | `questions` |
| 14 | `student_quiz_attempts` | Assessment | `users`, `quizzes` |
| 15 | `games` | Gamification | `users`, `quizzes` |
| 16 | `class_games` | Gamification | `classes`, `games` |
| 17 | `courses` | Legacy courses | `users` |
| 18 | `student_enrollments` | Legacy courses | `users`, `courses` |
| 19 | `notifications` | Messaging | `users` |
| 20 | `admin_audit_log` | Admin | `users` (nullable, SET NULL) |
| 21 | `platform_settings` | Admin | *(standalone key-value)* |
| 22 | `admin_notifications` | Admin | *(standalone broadcast)* |

---

## Conceptual Entity Relationship Diagram

Render at [mermaid.live](https://mermaid.live):

```mermaid
erDiagram
    PLAN ||--o{ INSTITUTION : "plan_id"
    INSTITUTION ||--o{ USER : "institution_id"

    USER ||--o{ CLASS : "instructor_id"
    USER ||--o{ CLASS_MEMBERSHIP : "student_id"
    CLASS ||--o{ CLASS_MEMBERSHIP : "class_id"

    CLASS ||--o{ CLASS_TOPIC : "class_id"
    CLASS_TOPIC ||--o{ CLASS_TOPIC_ITEM : "topic_id"
    CLASS_TOPIC_ITEM }o--o| QUIZ : "quiz_id"

    USER ||--o{ QUIZ : "instructor_id"
    CLASS |o--o{ QUIZ : "class_id"
    QUIZ ||--o{ QUESTION : "quiz_id"
    QUESTION ||--o{ QUESTION_OPTION : "question_id"

    USER ||--o{ QUIZ_ATTEMPT : "student_id"
    QUIZ ||--o{ QUIZ_ATTEMPT : "quiz_id"

    USER ||--o{ GAME : "instructor_id"
    QUIZ ||--o{ GAME : "quiz_id"
    CLASS ||--o{ CLASS_GAME : "class_id"
    GAME ||--o{ CLASS_GAME : "game_id"

    CLASS ||--o{ ANNOUNCEMENT : "class_id"
    USER ||--o{ ANNOUNCEMENT : "instructor_id"

    USER ||--o{ COURSE : "instructor_id"
    COURSE ||--o{ ENROLLMENT : "course_id"
    USER ||--o{ ENROLLMENT : "student_id"

    USER ||--o{ NOTIFICATION : "recipient_id"
    USER ||--o{ LOGIN_EVENT : "user_id"
    USER ||--o{ AUDIT_LOG : "admin_id"
```

---

## Physical Database Diagram (all columns)

```mermaid
erDiagram
    plans {
        int id PK
        varchar_80 name UK
        numeric_10_2 price
        jsonb features
        boolean is_default
        timestamptz created_at
    }

    institutions {
        int id PK
        varchar_160 name
        varchar_120 slug UK
        varchar_20 status
        int plan_id FK
        int seats_limit
        text_array email_domains
        jsonb feature_overrides
        varchar_20 primary_color
        text logo_url
        boolean is_default
        timestamptz created_at
        timestamptz updated_at
    }

    users {
        int id PK
        varchar_255 username
        varchar_255 email UK
        varchar_255 password
        user_role role
        varchar_20 account_status
        int institution_id FK
        text avatar_url
        jsonb preferences
        timestamp created_at
    }

    email_otp_codes {
        int id PK
        varchar_255 email
        varchar_50 purpose
        varchar_255 otp_hash
        jsonb payload
        timestamp expires_at
        boolean consumed
        timestamp created_at
    }

    classes {
        int id PK
        int instructor_id FK
        varchar_255 title
        text description
        varchar_10 join_code UK
        varchar_10 visibility
        text background_image
        timestamp created_at
        timestamp updated_at
    }

    class_memberships {
        int id PK
        int student_id FK
        int class_id FK
        timestamp joined_at
    }

    class_topics {
        int id PK
        int class_id FK
        varchar_255 name
        boolean is_quiz_topic
        int display_order
        timestamp created_at
    }

    class_topic_items {
        int id PK
        int topic_id FK
        int class_id FK
        varchar_20 item_type
        varchar_255 title
        varchar_512 file_name
        varchar_512 stored_name
        varchar_128 mime_type
        int quiz_id FK
        int display_order
        timestamp created_at
    }

    class_announcements {
        int id PK
        int class_id FK
        int instructor_id FK
        text content
        timestamptz created_at
    }

    quizzes {
        int id PK
        int instructor_id FK
        int course_id FK
        int class_id FK
        varchar_255 title
        text description
        int time_limit_minutes
        boolean shuffle_questions
        boolean shuffle_options
        int max_attempts
        text show_results_after
        boolean allow_late_submit
        timestamp created_at
        timestamp updated_at
    }

    questions {
        int id PK
        int quiz_id FK
        text question_text
        question_type question_type
        varchar_255 correct_answer
        text explanation
        int question_order
        timestamp created_at
    }

    question_options {
        int id PK
        int question_id FK
        varchar_255 option_text
        int option_order
        timestamp created_at
    }

    student_quiz_attempts {
        int id PK
        int student_id FK
        int quiz_id FK
        decimal_5_2 score
        int correct_answers
        int total_questions
        jsonb responses
        timestamp completed_at
    }

    games {
        int id PK
        int instructor_id FK
        int quiz_id FK
        varchar_255 title
        text description
        boolean ghost_enabled
        varchar_20 game_type
        text settings
        timestamptz created_at
        timestamptz updated_at
    }

    class_games {
        int id PK
        int class_id FK
        int game_id FK
        timestamptz published_at
    }

    courses {
        int id PK
        int instructor_id FK
        varchar_255 title
        text description
        timestamp created_at
        timestamp updated_at
    }

    student_enrollments {
        int id PK
        int student_id FK
        int course_id FK
        timestamp enrolled_at
    }

    notifications {
        int id PK
        int recipient_id FK
        varchar_20 recipient_role
        varchar_50 type
        varchar_255 title
        text body
        jsonb metadata
        timestamptz read_at
        timestamptz created_at
    }

    user_login_events {
        int id PK
        int user_id FK
        varchar_20 role
        timestamptz logged_in_at
    }

    admin_audit_log {
        int id PK
        int admin_id FK
        varchar_80 action
        varchar_50 target_type
        int target_id
        jsonb details
        timestamptz created_at
    }

    platform_settings {
        varchar_80 key PK
        jsonb value
        timestamptz updated_at
    }

    admin_notifications {
        int id PK
        varchar_50 type
        varchar_255 title
        text body
        jsonb metadata
        timestamptz read_at
        timestamptz created_at
    }

    plans ||--o{ institutions : "plan_id"
    institutions ||--o{ users : "institution_id"
    users ||--o{ classes : "instructor_id"
    users ||--o{ class_memberships : "student_id"
    classes ||--o{ class_memberships : "class_id"
    classes ||--o{ class_topics : "class_id"
    class_topics ||--o{ class_topic_items : "topic_id"
    quizzes |o--o{ class_topic_items : "quiz_id"
    classes ||--o{ class_announcements : "class_id"
    users ||--o{ class_announcements : "instructor_id"
    users ||--o{ quizzes : "instructor_id"
    classes |o--o{ quizzes : "class_id"
    courses |o--o{ quizzes : "course_id"
    quizzes ||--o{ questions : "quiz_id"
    questions ||--o{ question_options : "question_id"
    users ||--o{ student_quiz_attempts : "student_id"
    quizzes ||--o{ student_quiz_attempts : "quiz_id"
    users ||--o{ games : "instructor_id"
    quizzes ||--o{ games : "quiz_id"
    classes ||--o{ class_games : "class_id"
    games ||--o{ class_games : "game_id"
    users ||--o{ courses : "instructor_id"
    users ||--o{ student_enrollments : "student_id"
    courses ||--o{ student_enrollments : "course_id"
    users ||--o{ notifications : "recipient_id"
    users ||--o{ user_login_events : "user_id"
    users ||--o{ admin_audit_log : "admin_id"
```

---

## Key constraints

| Constraint | Tables |
|---|---|
| `UNIQUE(email)` | `users` |
| `UNIQUE(join_code)` | `classes` |
| `UNIQUE(student_id, class_id)` | `class_memberships` |
| `UNIQUE(student_id, course_id)` | `student_enrollments` |
| `UNIQUE(class_id, game_id)` | `class_games` |
| `CHECK(visibility IN ('public','private'))` | `classes` |
| `CHECK(item_type IN ('file','quiz'))` | `class_topic_items` |
| `CHECK(char_length(content) <= 500)` | `class_announcements` |

## Delete rules

| Relationship | ON DELETE |
|---|---|
| Most child → parent FKs | `CASCADE` |
| `quizzes.class_id` → `classes` | `SET NULL` |
| `quizzes.course_id` → `courses` | `SET NULL` |
| `admin_audit_log.admin_id` → `users` | `SET NULL` |

## Schema sources

- `server/src/setupDatabase.ts` — core tables
- `server/src/gameQueries.ts` — `games`, `class_games`
- `server/src/institutionServices.ts` — `plans`, `institutions`
- `server/src/notificationQueries.ts` — `notifications`
- `server/src/loginEvents.ts` — `user_login_events`
- `server/src/adminInfrastructure.ts` — `admin_audit_log`, `platform_settings`, `admin_notifications`
- `server/src/index.ts` — profile columns, quiz settings, `class_announcements`

## How to open the draw.io diagram

Open `08-database-diagram.drawio` in [app.diagrams.net](https://app.diagrams.net) or VS Code with the Draw.io Integration extension. Export at 200–300 % zoom for thesis print quality.
