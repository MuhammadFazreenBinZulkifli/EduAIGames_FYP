import pool from './db.ts';

export interface QuestionOption {
  id?: number;
  option_text: string;
  option_order: number;
}

export interface Question {
  id?: number;
  question_text: string;
  question_type: 'multiple-choice' | 'true-false';
  correct_answer: string;
  question_order: number;
  explanation?: string;
  options?: QuestionOption[];
}

export interface Quiz {
  id?: number;
  instructor_id: number;
  course_id?: number | null;
  class_id?: number | null;
  title: string;
  description: string;
  questions: Question[];
  created_at?: string;
  updated_at?: string;
  due_date?: string | null;
  time_limit_minutes?: number | null;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  max_attempts?: number | null;
  show_results_after?: 'immediate' | 'due_date' | 'never';
  allow_late_submit?: boolean;
}

export async function createQuiz(quiz: Quiz): Promise<Quiz> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert quiz
    const quizResult = await client.query(
      `INSERT INTO quizzes (instructor_id, course_id, class_id, title, description, due_date,
        time_limit_minutes, shuffle_questions, shuffle_options, max_attempts, show_results_after, allow_late_submit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        quiz.instructor_id, quiz.course_id || null, quiz.class_id || null,
        quiz.title, quiz.description, quiz.due_date || null,
        quiz.time_limit_minutes ?? null, quiz.shuffle_questions ?? false,
        quiz.shuffle_options ?? false, quiz.max_attempts ?? null,
        quiz.show_results_after ?? 'immediate', quiz.allow_late_submit ?? true,
      ]
    );
    const quizId = quizResult.rows[0].id;

    // Insert questions
    for (const question of quiz.questions) {
      const questionResult = await client.query(
        'INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order, explanation) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [quizId, question.question_text, question.question_type, question.correct_answer, question.question_order, question.explanation || null]
      );
      const questionId = questionResult.rows[0].id;

      if (question.options) {
        for (const option of question.options) {
          await client.query(
            'INSERT INTO question_options (question_id, option_text, option_order) VALUES ($1, $2, $3)',
            [questionId, option.option_text, option.option_order]
          );
        }
      }
    }

    await client.query('COMMIT');

    return {
      id: quizId,
      ...quiz,
      due_date: quiz.due_date || null,
      time_limit_minutes: quiz.time_limit_minutes ?? null,
      shuffle_questions: quiz.shuffle_questions ?? false,
      shuffle_options: quiz.shuffle_options ?? false,
      max_attempts: quiz.max_attempts ?? null,
      show_results_after: quiz.show_results_after ?? 'immediate',
      allow_late_submit: quiz.allow_late_submit ?? true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating quiz:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getQuizzesByInstructor(instructorId: number): Promise<Quiz[]> {
  try {
    const result = await pool.query(
      `SELECT q.id, q.instructor_id, q.course_id, q.class_id, q.title, q.description, q.created_at, q.updated_at, q.due_date,
              q.time_limit_minutes, q.shuffle_questions, q.shuffle_options, q.max_attempts, q.show_results_after, q.allow_late_submit,
              c.title AS class_title
       FROM quizzes q
       LEFT JOIN classes c ON c.id = q.class_id
       WHERE q.instructor_id = $1
       ORDER BY q.created_at DESC`,
      [instructorId]
    );

    const quizzes: Quiz[] = [];

    for (const quizRow of result.rows as any[]) {
      const questions = await getQuestionsByQuizId(quizRow.id);
      quizzes.push({
        id: quizRow.id,
        instructor_id: quizRow.instructor_id,
        course_id: quizRow.course_id,
        class_id: quizRow.class_id,
        title: quizRow.title,
        description: quizRow.description,
        questions,
        created_at: quizRow.created_at,
        updated_at: quizRow.updated_at,
        due_date: quizRow.due_date ?? null,
        time_limit_minutes: quizRow.time_limit_minutes ?? null,
        shuffle_questions: quizRow.shuffle_questions ?? false,
        shuffle_options: quizRow.shuffle_options ?? false,
        max_attempts: quizRow.max_attempts ?? null,
        show_results_after: quizRow.show_results_after ?? 'immediate',
        allow_late_submit: quizRow.allow_late_submit ?? true,
        class_title: quizRow.class_title ?? undefined,
      } as Quiz & { class_title?: string });
    }

    return quizzes;
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    throw error;
  }
}

export async function getQuizById(quizId: number): Promise<Quiz | null> {
  try {
    const result = await pool.query(
      `SELECT id, instructor_id, course_id, class_id, title, description, created_at, updated_at, due_date,
              time_limit_minutes, shuffle_questions, shuffle_options, max_attempts, show_results_after, allow_late_submit
       FROM quizzes WHERE id = $1`,
      [quizId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const quizRow = result.rows[0];
    const questions = await getQuestionsByQuizId(quizId);

    return {
      id: quizRow.id,
      instructor_id: quizRow.instructor_id,
      course_id: quizRow.course_id,
      class_id: quizRow.class_id,
      title: quizRow.title,
      description: quizRow.description,
      questions,
      created_at: quizRow.created_at,
      updated_at: quizRow.updated_at,
      due_date: quizRow.due_date ?? null,
      time_limit_minutes: quizRow.time_limit_minutes ?? null,
      shuffle_questions: quizRow.shuffle_questions ?? false,
      shuffle_options: quizRow.shuffle_options ?? false,
      max_attempts: quizRow.max_attempts ?? null,
      show_results_after: quizRow.show_results_after ?? 'immediate',
      allow_late_submit: quizRow.allow_late_submit ?? true,
    };
  } catch (error) {
    console.error('Error fetching quiz:', error);
    throw error;
  }
}

export async function getQuestionsByQuizId(quizId: number): Promise<Question[]> {
  try {
    const result = await pool.query(
      'SELECT id, question_text, question_type, correct_answer, question_order, explanation FROM questions WHERE quiz_id = $1 ORDER BY question_order ASC',
      [quizId]
    );

    const questions: Question[] = [];

    for (const questionRow of result.rows as any[]) {
      let options: QuestionOption[] | undefined = undefined;

      if (questionRow.question_type === 'multiple-choice') {
        const optionsResult = await pool.query(
          'SELECT id, option_text, option_order FROM question_options WHERE question_id = $1 ORDER BY option_order ASC',
          [questionRow.id]
        );
        options = optionsResult.rows as QuestionOption[];
      }

      questions.push({
        id: questionRow.id,
        question_text: questionRow.question_text,
        question_type: questionRow.question_type,
        correct_answer: questionRow.correct_answer,
        question_order: questionRow.question_order,
        explanation: questionRow.explanation ?? undefined,
        options,
      });
    }

    return questions;
  } catch (error) {
    console.error('Error fetching questions:', error);
    throw error;
  }
}

export async function instructorOwnsQuiz(instructorId: number, quizId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT id FROM quizzes WHERE id = $1 AND instructor_id = $2',
      [quizId, instructorId]
    );
    return (result.rows as any[]).length > 0;
  } catch (error) {
    console.error('Error checking quiz ownership:', error);
    throw error;
  }
}

export async function updateQuiz(quizId: number, quiz: Quiz): Promise<Quiz> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update quiz
    await client.query(
      `UPDATE quizzes SET title = $1, description = $2, due_date = $3,
        time_limit_minutes = $4, shuffle_questions = $5, shuffle_options = $6,
        max_attempts = $7, show_results_after = $8, allow_late_submit = $9,
        updated_at = CURRENT_TIMESTAMP WHERE id = $10`,
      [
        quiz.title, quiz.description, quiz.due_date ?? null,
        quiz.time_limit_minutes ?? null, quiz.shuffle_questions ?? false,
        quiz.shuffle_options ?? false, quiz.max_attempts ?? null,
        quiz.show_results_after ?? 'immediate', quiz.allow_late_submit ?? true,
        quizId,
      ]
    );

    // Delete existing questions and options
    await client.query('DELETE FROM questions WHERE quiz_id = $1', [quizId]);

    // Insert new questions
    for (const question of quiz.questions) {
      const questionResult = await client.query(
        'INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, question_order, explanation) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [quizId, question.question_text, question.question_type, question.correct_answer, question.question_order, question.explanation || null]
      );
      const questionId = questionResult.rows[0].id;

      if (question.options) {
        for (const option of question.options) {
          await client.query(
            'INSERT INTO question_options (question_id, option_text, option_order) VALUES ($1, $2, $3)',
            [questionId, option.option_text, option.option_order]
          );
        }
      }
    }

    await client.query('COMMIT');

    const updatedQuiz = await getQuizById(quizId);
    return updatedQuiz!;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating quiz:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteQuiz(quizId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete question options first
    await client.query(
      'DELETE FROM question_options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = $1)',
      [quizId]
    );

    // Delete questions
    await client.query('DELETE FROM questions WHERE quiz_id = $1', [quizId]);

    // Delete quiz
    await client.query('DELETE FROM quizzes WHERE id = $1', [quizId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting quiz:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudentPerformance(): Promise<any[]> {
  try {
    const result = await pool.query(`
      SELECT 
        sqa.student_id,
        u.username,
        q.title as quiz_title,
        sqa.score,
        sqa.correct_answers,
        sqa.total_questions,
        sqa.completed_at
      FROM student_quiz_attempts sqa
      JOIN users u ON sqa.student_id = u.id
      JOIN quizzes q ON sqa.quiz_id = q.id
      ORDER BY u.username, sqa.completed_at DESC
    `);
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching student performance:', error);
    throw error;
  }
}

export async function getPublishedQuizzesForClass(
  classId: number,
  instructorId: number
): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT DISTINCT q.id, q.title, q.due_date, q.allow_late_submit, q.max_attempts, q.created_at
       FROM quizzes q
       LEFT JOIN class_topic_items cti ON cti.quiz_id = q.id AND cti.class_id = $1
       LEFT JOIN class_topics ct ON ct.id = cti.topic_id AND ct.is_quiz_topic = true
       WHERE q.instructor_id = $2
         AND (
           q.class_id = $1
           OR (cti.id IS NOT NULL AND ct.is_quiz_topic = true)
         )
       ORDER BY q.created_at DESC`,
      [classId, instructorId]
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching published quizzes for class:', error);
    throw error;
  }
}

export async function isQuizPublishedToClass(
  classId: number,
  quizId: number,
  instructorId: number
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
     FROM quizzes q
     LEFT JOIN class_topic_items cti ON cti.quiz_id = q.id AND cti.class_id = $1
     LEFT JOIN class_topics ct ON ct.id = cti.topic_id AND ct.is_quiz_topic = true
     WHERE q.id = $2
       AND q.instructor_id = $3
       AND (
         q.class_id = $1
         OR (cti.id IS NOT NULL AND ct.is_quiz_topic = true)
       )
     LIMIT 1`,
    [classId, quizId, instructorId]
  );
  return (result.rows as any[]).length > 0;
}

export async function getClassStudentPerformance(
  instructorId: number,
  classId: number
): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT
        sqa.id AS attempt_id,
        sqa.student_id,
        u.username,
        sqa.quiz_id,
        q.title AS quiz_title,
        sqa.score,
        sqa.correct_answers,
        sqa.total_questions,
        sqa.completed_at,
        sqa.responses,
        q.due_date,
        q.allow_late_submit
      FROM student_quiz_attempts sqa
      JOIN quizzes q ON sqa.quiz_id = q.id
      JOIN users u ON sqa.student_id = u.id
      JOIN class_memberships cm ON cm.student_id = sqa.student_id AND cm.class_id = $2
      WHERE q.instructor_id = $1
        AND (
          q.class_id = $2
          OR EXISTS (
            SELECT 1
            FROM class_topic_items cti
            INNER JOIN class_topics ct ON ct.id = cti.topic_id AND ct.is_quiz_topic = true
            WHERE cti.quiz_id = q.id AND cti.class_id = $2
          )
        )
      ORDER BY u.username ASC, sqa.completed_at DESC`,
      [instructorId, classId]
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching class student performance:', error);
    throw error;
  }
}

export async function saveQuizAttempt(
  studentId: number,
  quizId: number,
  score: number,
  correctAnswers: number,
  totalQuestions: number,
  responses?: Record<string, string> | null
): Promise<any> {
  try {
    const result = await pool.query(
      `INSERT INTO student_quiz_attempts (student_id, quiz_id, score, correct_answers, total_questions, responses)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, student_id, quiz_id, score, correct_answers, total_questions, completed_at, responses`,
      [studentId, quizId, score, correctAnswers, totalQuestions, responses ? JSON.stringify(responses) : null]
    );
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error saving quiz attempt:', error);
    throw error;
  }
}

export async function getStudentQuizAttempts(studentId: number, classId?: number | null): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT 
        sqa.id,
        sqa.student_id,
        sqa.quiz_id,
        sqa.score,
        sqa.correct_answers,
        sqa.total_questions,
        sqa.completed_at,
        sqa.responses,
        q.title as quiz_title,
        q.description as quiz_description,
        q.class_id as quiz_class_id
      FROM student_quiz_attempts sqa
      JOIN quizzes q ON sqa.quiz_id = q.id
      WHERE sqa.student_id = $1
        AND ($2::int IS NULL OR q.class_id = $2)
      ORDER BY sqa.completed_at DESC`,
      [studentId, classId ?? null]
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching student quiz attempts:', error);
    throw error;
  }
}

export async function getQuizzesByClassId(classId: number): Promise<Quiz[]> {
  try {
    const result = await pool.query(
      `SELECT id, instructor_id, course_id, class_id, title, description, created_at, updated_at, due_date,
              time_limit_minutes, shuffle_questions, shuffle_options, max_attempts, show_results_after, allow_late_submit
       FROM quizzes WHERE class_id = $1 ORDER BY created_at DESC`,
      [classId]
    );

    const quizzes: Quiz[] = [];

    for (const quizRow of result.rows as any[]) {
      const questions = await getQuestionsByQuizId(quizRow.id);
      quizzes.push({
        id: quizRow.id,
        instructor_id: quizRow.instructor_id,
        course_id: quizRow.course_id,
        class_id: quizRow.class_id,
        title: quizRow.title,
        description: quizRow.description,
        questions,
        created_at: quizRow.created_at,
        updated_at: quizRow.updated_at,
        due_date: quizRow.due_date ?? null,
        time_limit_minutes: quizRow.time_limit_minutes ?? null,
        shuffle_questions: quizRow.shuffle_questions ?? false,
        shuffle_options: quizRow.shuffle_options ?? false,
        max_attempts: quizRow.max_attempts ?? null,
        show_results_after: quizRow.show_results_after ?? 'immediate',
        allow_late_submit: quizRow.allow_late_submit ?? true,
      });
    }

    return quizzes;
  } catch (error) {
    console.error('Error fetching quizzes by class:', error);
    throw error;
  }
}

export async function getStudentAvailableQuizzes(studentId: number): Promise<Quiz[]> {
  try {
    const result = await pool.query(
      `SELECT DISTINCT q.id, q.instructor_id, q.course_id, cti.class_id, q.title, q.description, q.created_at, q.updated_at, q.due_date,
              q.time_limit_minutes, q.shuffle_questions, q.shuffle_options, q.max_attempts, q.show_results_after, q.allow_late_submit
       FROM quizzes q
       INNER JOIN class_topic_items cti ON cti.quiz_id = q.id
       INNER JOIN class_topics ct ON ct.id = cti.topic_id AND ct.is_quiz_topic = true
       JOIN class_memberships cm ON cti.class_id = cm.class_id AND cm.student_id = $1
       WHERE cm.student_id = $1
       ORDER BY q.created_at DESC`,
      [studentId]
    );

    const quizzes: Quiz[] = [];

    for (const quizRow of result.rows as any[]) {
      const questions = await getQuestionsByQuizId(quizRow.id);
      quizzes.push({
        id: quizRow.id,
        instructor_id: quizRow.instructor_id,
        course_id: quizRow.course_id,
        class_id: quizRow.class_id,
        title: quizRow.title,
        description: quizRow.description,
        questions,
        created_at: quizRow.created_at,
        updated_at: quizRow.updated_at,
        due_date: quizRow.due_date ?? null,
        time_limit_minutes: quizRow.time_limit_minutes ?? null,
        shuffle_questions: quizRow.shuffle_questions ?? false,
        shuffle_options: quizRow.shuffle_options ?? false,
        max_attempts: quizRow.max_attempts ?? null,
        show_results_after: quizRow.show_results_after ?? 'immediate',
        allow_late_submit: quizRow.allow_late_submit ?? true,
      });
    }

    return quizzes;
  } catch (error) {
    console.error('Error fetching student available quizzes:', error);
    throw error;
  }
}

/** Student may take or submit a quiz only if it is published in the class Quiz topic. */
export async function canStudentAccessQuiz(studentId: number, quizId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT q.id
       FROM quizzes q
       INNER JOIN class_topic_items cti ON cti.quiz_id = q.id
       INNER JOIN class_topics ct ON ct.id = cti.topic_id AND ct.is_quiz_topic = true
       JOIN class_memberships cm ON cti.class_id = cm.class_id AND cm.student_id = $2
       WHERE q.id = $1 AND cm.student_id = $2`,
      [quizId, studentId]
    );
    return (result.rows as any[]).length > 0;
  } catch (error) {
    console.error('Error checking student access to quiz:', error);
    throw error;
  }
}

/** Duplicates a quiz (same class) and returns the new quiz. */
export async function duplicateQuiz(quizId: number, instructorId: number): Promise<Quiz> {
  const original = await getQuizById(quizId);
  if (!original) throw new Error('Quiz not found');
  if (original.instructor_id !== instructorId) throw new Error('Not your quiz');

  return createQuiz({
    instructor_id: original.instructor_id,
    class_id: null,
    course_id: original.course_id,
    title: `Copy of ${original.title}`,
    description: original.description,
    questions: original.questions,
    due_date: null,
    time_limit_minutes: original.time_limit_minutes,
    shuffle_questions: original.shuffle_questions,
    shuffle_options: original.shuffle_options,
    max_attempts: original.max_attempts,
    show_results_after: original.show_results_after,
    allow_late_submit: original.allow_late_submit,
  });
}

/** Returns the number of attempts a student has made on a quiz. */
export async function countStudentAttempts(studentId: number, quizId: number): Promise<number> {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM student_quiz_attempts WHERE student_id = $1 AND quiz_id = $2',
    [studentId, quizId]
  );
  return (result.rows[0] as { cnt: number }).cnt;
}

/** Student may review a quiz they attempted (class membership only). */
export async function canStudentReviewQuiz(studentId: number, quizId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT q.id
       FROM quizzes q
       JOIN class_memberships cm ON q.class_id = cm.class_id AND cm.student_id = $2
       WHERE q.id = $1`,
      [quizId, studentId]
    );
    return (result.rows as any[]).length > 0;
  } catch (error) {
    console.error('Error checking student quiz review access:', error);
    throw error;
  }
}
