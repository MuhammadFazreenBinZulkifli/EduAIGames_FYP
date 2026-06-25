-- Sample Test Data for FYP Database
-- Insert these to test the system

-- ============================================
-- SAMPLE USERS
-- ============================================

-- Test Instructor (password: password123)
INSERT INTO users (username, email, password, role) VALUES
('instructor_john', 'john.instructor@example.com', '$2a$10$SomeHashedPassword1', 'Instructor');

-- Test Students (password: password123)
INSERT INTO users (username, email, password, role) VALUES
('student_alice', 'alice.student@example.com', '$2a$10$SomeHashedPassword2', 'Student'),
('student_bob', 'bob.student@example.com', '$2a$10$SomeHashedPassword3', 'Student'),
('student_charlie', 'charlie.student@example.com', '$2a$10$SomeHashedPassword4', 'Student');

-- ============================================
-- SAMPLE QUIZZES
-- ============================================

-- Quiz 1: Mathematics
INSERT INTO quizzes (instructor_id, title, description) VALUES
(1, 'Basic Mathematics', 'Quiz covering basic math operations');

-- Quiz 2: Science
INSERT INTO quizzes (instructor_id, title, description) VALUES
(1, 'General Science', 'Basic science concepts');

-- ============================================
-- SAMPLE QUESTIONS & OPTIONS (Quiz 1)
-- ============================================

-- Question 1: Multiple Choice
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(1, 'What is 15 + 27?', 'multiple-choice', '42', 1);

INSERT INTO question_options (question_id, option_text, option_order) VALUES
(1, '38', 1),
(1, '40', 2),
(1, '42', 3),
(1, '45', 4);

-- Question 2: True/False
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(1, 'The square root of 144 is 12', 'true-false', 'true', 2);

-- Question 3: Multiple Choice
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(1, 'What is 25 × 4?', 'multiple-choice', '100', 3);

INSERT INTO question_options (question_id, option_text, option_order) VALUES
(3, '75', 1),
(3, '90', 2),
(3, '100', 3),
(3, '110', 4);

-- Question 4: True/False
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(1, '7 is a prime number', 'true-false', 'true', 4);

-- ============================================
-- SAMPLE QUESTIONS & OPTIONS (Quiz 2)
-- ============================================

-- Question 1: Multiple Choice
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(2, 'What is the chemical symbol for Gold?', 'multiple-choice', 'Au', 1);

INSERT INTO question_options (question_id, option_text, option_order) VALUES
(5, 'Gd', 1),
(5, 'Au', 2),
(5, 'Ag', 3),
(5, 'Go', 4);

-- Question 2: True/False
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(2, 'Water boils at 100 degrees Celsius at sea level', 'true-false', 'true', 2);

-- Question 3: Multiple Choice
INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order) VALUES
(2, 'Which planet is closest to the Sun?', 'multiple-choice', 'Mercury', 3);

INSERT INTO question_options (question_id, option_text, option_order) VALUES
(7, 'Venus', 1),
(7, 'Mercury', 2),
(7, 'Earth', 3),
(7, 'Mars', 4);

-- ============================================
-- SAMPLE QUIZ ATTEMPTS
-- ============================================

-- Student Alice attempts Quiz 1
INSERT INTO quiz_attempts (quiz_id, student_id, total_questions, status, score, completed_at) VALUES
(1, 2, 4, 'completed', 75.00, CURRENT_TIMESTAMP);

-- Student Bob attempts Quiz 1
INSERT INTO quiz_attempts (quiz_id, student_id, total_questions, status, score, completed_at) VALUES
(1, 3, 4, 'completed', 100.00, CURRENT_TIMESTAMP);

-- Student Charlie attempts Quiz 2
INSERT INTO quiz_attempts (quiz_id, student_id, total_questions, status, score, completed_at) VALUES
(2, 4, 3, 'completed', 66.67, CURRENT_TIMESTAMP);

-- Student Alice attempts Quiz 2 (in progress)
INSERT INTO quiz_attempts (quiz_id, student_id, total_questions, status) VALUES
(2, 2, 3, 'in_progress');

-- ============================================
-- SAMPLE STUDENT ANSWERS (Alice's Quiz 1 attempt)
-- ============================================

-- Question 1: Correct (15 + 27 = 42)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(1, 1, '42', true);

-- Question 2: Correct (sqrt(144) = 12, answer is true)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(1, 2, 'true', true);

-- Question 3: Incorrect (25 × 4 = 100, but answered 90)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(1, 3, '90', false);

-- Question 4: Correct (7 is prime, answer is true)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(1, 4, 'true', true);

-- ============================================
-- SAMPLE STUDENT ANSWERS (Bob's Quiz 1 attempt)
-- ============================================

-- Question 1: Correct
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(2, 1, '42', true);

-- Question 2: Correct
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(2, 2, 'true', true);

-- Question 3: Correct
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(2, 3, '100', true);

-- Question 4: Correct
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(2, 4, 'true', true);

-- ============================================
-- SAMPLE STUDENT ANSWERS (Charlie's Quiz 2 attempt)
-- ============================================

-- Question 1: Correct (Au)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(3, 5, 'Au', true);

-- Question 2: Correct (true)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(3, 6, 'true', true);

-- Question 3: Incorrect (answered Earth instead of Mercury)
INSERT INTO student_answers (quiz_attempt_id, question_id, student_answer, is_correct) VALUES
(3, 7, 'Earth', false);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- View all users
-- SELECT * FROM users;

-- View all quizzes
-- SELECT q.*, u.username FROM quizzes q JOIN users u ON q.instructor_id = u.id;

-- View all questions for Quiz 1
-- SELECT q.* FROM questions q WHERE q.quiz_id = 1;

-- View question options for Question 1
-- SELECT * FROM question_options WHERE question_id = 1;

-- View quiz statistics
-- SELECT 
--   q.title,
--   COUNT(qa.id) as attempts,
--   AVG(qa.score) as avg_score,
--   MAX(qa.score) as max_score,
--   MIN(qa.score) as min_score
-- FROM quizzes q
-- LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id
-- GROUP BY q.id, q.title;

-- View student performance
-- SELECT 
--   u.username,
--   q.title,
--   qa.score,
--   qa.status,
--   qa.completed_at
-- FROM quiz_attempts qa
-- JOIN users u ON qa.student_id = u.id
-- JOIN quizzes q ON qa.quiz_id = q.id
-- ORDER BY u.username, q.title;

-- ============================================
-- NOTES
-- ============================================

-- NOTE: Passwords above are hashed values. In real use, passwords are hashed by bcryptjs.
-- For testing, use the registration endpoint to create users with real passwords.

-- Sample test credentials:
-- Instructor: john.instructor@example.com / password123
-- Student: alice.student@example.com / password123
