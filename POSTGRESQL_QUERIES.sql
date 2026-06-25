-- ============================================================
-- POSTGRESQL SQL QUERIES - Common Database Operations
-- ============================================================
-- All queries are formatted for PostgreSQL with numbered placeholders ($1, $2, etc.)
-- Use these queries in your application with parameter binding

-- ============================================================
-- USER QUERIES
-- ============================================================

-- Get all users
SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC;

-- Get user by email
SELECT * FROM users WHERE email = $1;
-- Parameters: [email]

-- Get user by ID
SELECT id, username, email, role, created_at FROM users WHERE id = $1;
-- Parameters: [id]

-- Create user
INSERT INTO users (username, email, password, role) 
VALUES ($1, $2, $3, $4) 
RETURNING id, username, email, role, created_at;
-- Parameters: [username, email, hashedPassword, role]

-- Get all instructors
SELECT id, username, email, created_at FROM users WHERE role = 'Instructor' ORDER BY created_at DESC;

-- Get all students
SELECT id, username, email, created_at FROM users WHERE role = 'Student' ORDER BY created_at DESC;

-- Count users by role
SELECT role, COUNT(*) as count FROM users GROUP BY role;

-- Update user profile
UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, role, created_at;
-- Parameters: [username, id]


-- ============================================================
-- QUIZ QUERIES
-- ============================================================

-- Create quiz
INSERT INTO quizzes (instructor_id, title, description) 
VALUES ($1, $2, $3) 
RETURNING id, instructor_id, title, description, created_at, updated_at;
-- Parameters: [instructorId, title, description]

-- Get all quizzes by instructor
SELECT id, instructor_id, title, description, created_at, updated_at 
FROM quizzes 
WHERE instructor_id = $1 
ORDER BY created_at DESC;
-- Parameters: [instructorId]

-- Get quiz by ID
SELECT id, instructor_id, title, description, created_at, updated_at 
FROM quizzes 
WHERE id = $1;
-- Parameters: [quizId]

-- Get quiz with instructor name
SELECT q.id, q.instructor_id, u.username as instructor_name, q.title, q.description, 
       q.created_at, q.updated_at
FROM quizzes q
JOIN users u ON q.instructor_id = u.id
WHERE q.id = $1;
-- Parameters: [quizId]

-- Update quiz
UPDATE quizzes 
SET title = $1, description = $2, updated_at = CURRENT_TIMESTAMP 
WHERE id = $3 
RETURNING id, instructor_id, title, description, created_at, updated_at;
-- Parameters: [title, description, quizId]

-- Delete quiz (with cascade - questions and options will be deleted automatically)
DELETE FROM quizzes WHERE id = $1;
-- Parameters: [quizId]

-- Count quizzes by instructor
SELECT COUNT(*) as quiz_count FROM quizzes WHERE instructor_id = $1;
-- Parameters: [instructorId]

-- Get recently updated quizzes
SELECT id, instructor_id, title, description, created_at, updated_at 
FROM quizzes 
ORDER BY updated_at DESC 
LIMIT 10;


-- ============================================================
-- QUESTION QUERIES
-- ============================================================

-- Create question
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) 
VALUES ($1, $2, $3, $4, $5) 
RETURNING id, quiz_id, question_text, question_type, correct_answer, question_order, created_at;
-- Parameters: [quizId, questionText, questionType, correctAnswer, questionOrder]

-- Get questions by quiz ID
SELECT id, question_text, question_type, correct_answer, question_order, created_at 
FROM questions 
WHERE quiz_id = $1 
ORDER BY question_order ASC;
-- Parameters: [quizId]

-- Get question by ID
SELECT id, quiz_id, question_text, question_type, correct_answer, question_order, created_at 
FROM questions 
WHERE id = $1;
-- Parameters: [questionId]

-- Update question
UPDATE questions 
SET question_text = $1, question_type = $2, correct_answer = $3, question_order = $4 
WHERE id = $5 
RETURNING id, quiz_id, question_text, question_type, correct_answer, question_order;
-- Parameters: [questionText, questionType, correctAnswer, questionOrder, questionId]

-- Delete question (with cascade - options will be deleted automatically)
DELETE FROM questions WHERE id = $1;
-- Parameters: [questionId]

-- Count questions in quiz
SELECT COUNT(*) as question_count FROM questions WHERE quiz_id = $1;
-- Parameters: [quizId]

-- Delete all questions in quiz
DELETE FROM questions WHERE quiz_id = $1;
-- Parameters: [quizId]


-- ============================================================
-- QUESTION OPTIONS QUERIES
-- ============================================================

-- Create question option
INSERT INTO question_options (question_id, option_text, option_order) 
VALUES ($1, $2, $3) 
RETURNING id, question_id, option_text, option_order, created_at;
-- Parameters: [questionId, optionText, optionOrder]

-- Get options for a question
SELECT id, option_text, option_order, created_at 
FROM question_options 
WHERE question_id = $1 
ORDER BY option_order ASC;
-- Parameters: [questionId]

-- Get options with question details
SELECT qo.id, qo.option_text, qo.option_order, q.question_text, q.question_type
FROM question_options qo
JOIN questions q ON qo.question_id = q.id
WHERE qo.question_id = $1
ORDER BY qo.option_order ASC;
-- Parameters: [questionId]

-- Update option
UPDATE question_options 
SET option_text = $1, option_order = $2 
WHERE id = $3 
RETURNING id, question_id, option_text, option_order;
-- Parameters: [optionText, optionOrder, optionId]

-- Delete option
DELETE FROM question_options WHERE id = $1;
-- Parameters: [optionId]

-- Delete all options for a question
DELETE FROM question_options WHERE question_id = $1;
-- Parameters: [questionId]

-- Count options for a question
SELECT COUNT(*) as option_count FROM question_options WHERE question_id = $1;
-- Parameters: [questionId]


-- ============================================================
-- STUDENT QUIZ ATTEMPTS / GRADES QUERIES
-- ============================================================

-- Create quiz attempt
INSERT INTO student_quiz_attempts (student_id, quiz_id, score, correct_answers, total_questions) 
VALUES ($1, $2, $3, $4, $5) 
RETURNING id, student_id, quiz_id, score, correct_answers, total_questions, completed_at;
-- Parameters: [studentId, quizId, score, correctAnswers, totalQuestions]

-- Get attempts for a student
SELECT id, student_id, quiz_id, score, correct_answers, total_questions, completed_at 
FROM student_quiz_attempts 
WHERE student_id = $1 
ORDER BY completed_at DESC;
-- Parameters: [studentId]

-- Get attempts for a quiz
SELECT id, student_id, quiz_id, score, correct_answers, total_questions, completed_at 
FROM student_quiz_attempts 
WHERE quiz_id = $1 
ORDER BY completed_at DESC;
-- Parameters: [quizId]

-- Get student's attempt for specific quiz
SELECT id, student_id, quiz_id, score, correct_answers, total_questions, completed_at 
FROM student_quiz_attempts 
WHERE student_id = $1 AND quiz_id = $2
ORDER BY completed_at DESC;
-- Parameters: [studentId, quizId]

-- Get attempt with student and quiz details
SELECT sqa.id, sqa.student_id, u.username as student_name, sqa.quiz_id, q.title as quiz_title,
       sqa.score, sqa.correct_answers, sqa.total_questions, sqa.completed_at
FROM student_quiz_attempts sqa
JOIN users u ON sqa.student_id = u.id
JOIN quizzes q ON sqa.quiz_id = q.id
WHERE sqa.id = $1;
-- Parameters: [attemptId]

-- Get student's grades for all quizzes
SELECT sqa.id, sqa.quiz_id, q.title, sqa.score, sqa.correct_answers, sqa.total_questions, sqa.completed_at
FROM student_quiz_attempts sqa
JOIN quizzes q ON sqa.quiz_id = q.id
WHERE sqa.student_id = $1
ORDER BY sqa.completed_at DESC;
-- Parameters: [studentId]

-- Get average score for a quiz
SELECT AVG(score) as average_score, COUNT(*) as attempt_count, 
       MAX(score) as highest_score, MIN(score) as lowest_score
FROM student_quiz_attempts 
WHERE quiz_id = $1;
-- Parameters: [quizId]

-- Get average score for a student
SELECT AVG(score) as average_score, COUNT(*) as quizzes_attempted
FROM student_quiz_attempts 
WHERE student_id = $1;
-- Parameters: [studentId]

-- Get student performance across all quizzes
SELECT u.id, u.username, COUNT(sqa.id) as quizzes_attempted, 
       ROUND(AVG(sqa.score)::numeric, 2) as average_score,
       MAX(sqa.score) as highest_score, MIN(sqa.score) as lowest_score
FROM users u
LEFT JOIN student_quiz_attempts sqa ON u.id = sqa.student_id
WHERE u.role = 'Student'
GROUP BY u.id, u.username
ORDER BY average_score DESC NULLS LAST;

-- Delete attempt
DELETE FROM student_quiz_attempts WHERE id = $1;
-- Parameters: [attemptId]

-- Count attempts for quiz
SELECT COUNT(*) as attempt_count FROM student_quiz_attempts WHERE quiz_id = $1;
-- Parameters: [quizId]


-- ============================================================
-- COMPLEX QUERIES / REPORTS
-- ============================================================

-- Get full quiz with all questions and options
SELECT q.id as quiz_id, q.title, q.description, 
       qu.id as question_id, qu.question_text, qu.question_type, qu.question_order, qu.correct_answer,
       qo.id as option_id, qo.option_text, qo.option_order
FROM quizzes q
LEFT JOIN questions qu ON q.id = qu.quiz_id
LEFT JOIN question_options qo ON qu.id = qo.question_id
WHERE q.id = $1
ORDER BY qu.question_order ASC, qo.option_order ASC;
-- Parameters: [quizId]

-- Get class performance (all students' grades for a quiz)
SELECT sqa.student_id, u.username, sqa.quiz_id, q.title,
       sqa.score, sqa.correct_answers, sqa.total_questions,
       ROUND((sqa.correct_answers::numeric / sqa.total_questions * 100), 2) as percentage,
       sqa.completed_at
FROM student_quiz_attempts sqa
JOIN users u ON sqa.student_id = u.id
JOIN quizzes q ON sqa.quiz_id = q.id
WHERE sqa.quiz_id = $1
ORDER BY sqa.score DESC;
-- Parameters: [quizId]

-- Get quiz statistics
SELECT 
  q.id, q.title,
  COUNT(DISTINCT sqa.id) as total_attempts,
  COUNT(DISTINCT sqa.student_id) as unique_students,
  ROUND(AVG(sqa.score)::numeric, 2) as average_score,
  ROUND(MAX(sqa.score)::numeric, 2) as highest_score,
  ROUND(MIN(sqa.score)::numeric, 2) as lowest_score,
  q.created_at
FROM quizzes q
LEFT JOIN student_quiz_attempts sqa ON q.id = sqa.quiz_id
WHERE q.id = $1
GROUP BY q.id, q.title, q.created_at;
-- Parameters: [quizId]

-- Get instructor dashboard summary
SELECT 
  COUNT(DISTINCT q.id) as total_quizzes,
  COUNT(DISTINCT qu.id) as total_questions,
  COUNT(DISTINCT sqa.id) as total_attempts,
  COUNT(DISTINCT sqa.student_id) as unique_students
FROM quizzes q
LEFT JOIN questions qu ON q.id = qu.quiz_id
LEFT JOIN student_quiz_attempts sqa ON q.id = sqa.quiz_id
WHERE q.instructor_id = $1;
-- Parameters: [instructorId]

-- Get student dashboard - enrolled quizzes (quizzes they attempted)
SELECT DISTINCT q.id, q.title, q.description, u.username as instructor_name,
       q.created_at
FROM quizzes q
JOIN users u ON q.instructor_id = u.id
WHERE q.id IN (
  SELECT quiz_id FROM student_quiz_attempts WHERE student_id = $1
)
ORDER BY q.created_at DESC;
-- Parameters: [studentId]
