# pgAdmin4 Setup Instructions

## Step 1: Create Database (Optional - if not already created)

If the `fyp` database doesn't exist yet, follow these steps:

1. In pgAdmin4, right-click on **Databases** 
2. Click **Create** → **Database**
3. Enter `fyp` as the database name
4. Click **Save**

Alternatively, paste this in the Query Tool while connected to the server:
```sql
CREATE DATABASE fyp;
```

## Step 2: Connect to the Database

1. In pgAdmin4, expand **Databases** and click on **fyp**
2. Click on **Tools** → **Query Tool** (or right-click and select Query Tool)

## Step 3: Run the SQL Setup Script

Copy the entire SQL code below and paste it into the pgAdmin4 Query Tool:

### Complete SQL Setup Script for pgAdmin4:

```sql
-- Create ENUM types
CREATE TYPE user_role AS ENUM ('Instructor', 'Student');
CREATE TYPE question_type AS ENUM ('multiple-choice', 'true-false');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Create quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  instructor_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for quizzes table
CREATE INDEX IF NOT EXISTS idx_quizzes_instructor ON quizzes(instructor_id);

-- Create questions table
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  quiz_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type question_type NOT NULL,
  correct_answer VARCHAR(255) NOT NULL,
  question_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Create index for questions table
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);

-- Create question_options table
CREATE TABLE IF NOT EXISTS question_options (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL,
  option_text VARCHAR(255) NOT NULL,
  option_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Create index for question_options table
CREATE INDEX IF NOT EXISTS idx_options_question ON question_options(question_id);

-- Create student_quiz_attempts table
CREATE TABLE IF NOT EXISTS student_quiz_attempts (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  quiz_id INT NOT NULL,
  score DECIMAL(5, 2) NOT NULL,
  correct_answers INT NOT NULL,
  total_questions INT NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Create indexes for student_quiz_attempts table
CREATE INDEX IF NOT EXISTS idx_attempts_student ON student_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON student_quiz_attempts(quiz_id);

-- Insert sample data
INSERT INTO users (username, email, password, role) 
VALUES 
  ('John Instructor', 'instructor@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/TVi2', 'Instructor'),
  ('Jane Student', 'student@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/TVi2', 'Student')
ON CONFLICT (email) DO NOTHING;
```

## Step 4: Execute the Script

1. Click the **Execute/Play** button (▶) or press `F5`
2. Wait for completion - you should see success messages
3. Check the **Messages** tab at the bottom for confirmation

## Step 5: Verify Setup

Run these queries to verify everything was created:

### Check Tables:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### Check Sample Data:
```sql
SELECT id, username, email, role, created_at FROM users;
```

### Check Indexes:
```sql
SELECT indexname FROM pg_indexes WHERE schemaname = 'public';
```

## Sample Data

Default login credentials:
- **Instructor**: instructor@example.com / password123
- **Student**: student@example.com / password123

## File Provided

- **PGADMIN4_SETUP.sql** - Clean SQL file ready to copy-paste into pgAdmin4

---

That's it! Your PostgreSQL database is now ready to use with your Node.js application.
