-- ============================================================
-- PostgreSQL SQL Setup for pgAdmin4
-- ============================================================
-- Copy and paste this entire script into pgAdmin4 Query Tool
-- Make sure you're connected to the correct database (fyp)
-- ============================================================

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
