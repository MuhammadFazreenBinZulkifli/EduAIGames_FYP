-- PostgreSQL Database Setup for EduAIGames (fyp database)
-- Created from MySQL to PostgreSQL migration
-- Run this script to set up your PostgreSQL database

-- ============================================================
-- 1. CREATE DATABASE (if not exists)
-- ============================================================
-- Note: You may need to run this as a superuser
-- psql -U postgres -d postgres -c "CREATE DATABASE fyp;"

CREATE DATABASE fyp;


-- ============================================================
-- 2. CONNECT TO THE DATABASE
-- ============================================================
-- \c fyp


-- ============================================================
-- 3. CREATE CUSTOM ENUM TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM ('Instructor', 'Student');
CREATE TYPE question_type AS ENUM ('multiple-choice', 'true-false');


-- ============================================================
-- 4. CREATE USERS TABLE
-- ============================================================
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


-- ============================================================
-- 5. CREATE QUIZZES TABLE
-- ============================================================
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


-- ============================================================
-- 6. CREATE QUESTIONS TABLE
-- ============================================================
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


-- ============================================================
-- 7. CREATE QUESTION_OPTIONS TABLE
-- ============================================================
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


-- ============================================================
-- 8. CREATE STUDENT_QUIZ_ATTEMPTS TABLE
-- ============================================================
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


-- ============================================================
-- 9. INSERT SAMPLE DATA
-- ============================================================
-- Password hashes are for "password123" using bcrypt
INSERT INTO users (username, email, password, role) 
VALUES 
  ('John Instructor', 'instructor@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/TVi2', 'Instructor'),
  ('Jane Student', 'student@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/TVi2', 'Student')
ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- 10. COMMON QUERIES
-- ============================================================

-- Get all users
-- SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC;

-- Get user by email
-- SELECT * FROM users WHERE email = 'instructor@example.com';

-- Get all quizzes by instructor
-- SELECT id, instructor_id, title, description, created_at, updated_at FROM quizzes WHERE instructor_id = 1 ORDER BY created_at DESC;

-- Get quiz with questions and options
-- SELECT q.id, q.title, q.description, 
--        qu.id as question_id, qu.question_text, qu.question_type,
--        qo.id as option_id, qo.option_text
-- FROM quizzes q
-- LEFT JOIN questions qu ON q.id = qu.quiz_id
-- LEFT JOIN question_options qo ON qu.id = qo.question_id
-- WHERE q.id = 1
-- ORDER BY qu.question_order, qo.option_order;

-- Get student quiz grades
-- SELECT sqa.id, sqa.student_id, u.username, sqa.quiz_id, q.title,
--        sqa.score, sqa.correct_answers, sqa.total_questions, sqa.completed_at
-- FROM student_quiz_attempts sqa
-- JOIN users u ON sqa.student_id = u.id
-- JOIN quizzes q ON sqa.quiz_id = q.id
-- ORDER BY sqa.completed_at DESC;
