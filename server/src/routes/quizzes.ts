import express from 'express';
import type { Request, Response } from 'express';
import {
  createQuiz,
  getQuizzesByInstructor,
  getQuizzesByClassId,
  getStudentAvailableQuizzes,
  getQuizById,
  updateQuiz,
  deleteQuiz,
  duplicateQuiz,
  countStudentAttempts,
  getStudentPerformance,
  getClassStudentPerformance,
  getPublishedQuizzesForClass,
  isQuizPublishedToClass,
  saveQuizAttempt,
  getStudentQuizAttempts,
  canStudentAccessQuiz,
  canStudentReviewQuiz,
  instructorOwnsQuiz,
} from '../quizQueries.ts';
import { getClassById } from '../classQueries.ts';
import { notifyInstructorQuizAttempt, notifyStudentsQuizReminder } from '../notificationService.ts';
import { requireFeature } from '../featureGate.ts';
import { moderateEducationalContent } from '../openai.ts';
import { logModerationBlock } from '../adminServices.ts';

const router = express.Router();
router.use(requireFeature('quizzes_enabled'));

// Flattens a quiz's instructor-authored text (title, description, questions,
// answers, options) into one string for content moderation.
function buildQuizModerationText(
  title: unknown,
  description: unknown,
  questions: unknown
): string {
  // Collect every piece of text we want to moderate into this array.
  const parts: string[] = [];
  // Add the quiz title if present.
  if (typeof title === 'string') parts.push(title);
  // Add the quiz description if present.
  if (typeof description === 'string') parts.push(description);
  // Walk through each question (only if questions is actually an array).
  if (Array.isArray(questions)) {
    for (const q of questions as Array<Record<string, unknown>>) {
      // Add the question wording.
      if (typeof q?.question_text === 'string') parts.push(q.question_text);
      // Add the correct answer text.
      if (typeof q?.correct_answer === 'string') parts.push(q.correct_answer);
      // Add the explanation if the instructor wrote one.
      if (typeof q?.explanation === 'string') parts.push(q.explanation);
      // Each question can have multiple answer options.
      const options = q?.options;
      if (Array.isArray(options)) {
        for (const opt of options) {
          // Options may be plain strings...
          if (typeof opt === 'string') parts.push(opt);
          // ...or objects with an option_text field.
          else if (opt && typeof (opt as Record<string, unknown>).option_text === 'string') {
            parts.push((opt as Record<string, unknown>).option_text as string);
          }
        }
      }
    }
  }
  // Join everything into one newline-separated block for the moderation call.
  return parts.filter(Boolean).join('\n');
}

// Create a new quiz
router.post('/', async (req: Request, res: Response) => {
  try {
    const { instructor_id, class_id, course_id, title, description, questions,
            time_limit_minutes, shuffle_questions, shuffle_options, max_attempts,
            show_results_after, allow_late_submit } = req.body;

    // Validation
    if (!instructor_id || !title || !questions) {
      res.status(400).json({ error: 'instructor_id, title, and questions are required' });
      return;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'At least one question is required' });
      return;
    }

    // Validate questions
    for (const question of questions) {
      if (!question.question_text || !question.question_type || !question.correct_answer) {
        res.status(400).json({ error: 'Each question must have text, type, and correct answer' });
        return;
      }
    }

    // Content moderation (education-aware; allows human-biology topics).
    // Flatten all the quiz text and run it through the moderation check.
    const moderation = await moderateEducationalContent(
      buildQuizModerationText(title, description, questions)
    );
    // If the content is not allowed, block the save.
    if (!moderation.allowed) {
      // Record the blocked attempt in the audit log (attributed to the instructor).
      await logModerationBlock({
        userId: Number(instructor_id) || null,
        category: moderation.category,
        reason: moderation.reason,
        context: 'manual_quiz',
      });
      // Return 422 with the reason so the instructor can fix and retry.
      res.status(422).json({
        error: `This quiz was blocked by content moderation: ${moderation.reason}`,
        category: moderation.category,
      });
      return;
    }

    const parsedClassId =
      class_id !== undefined && class_id !== null && class_id !== ''
        ? parseInt(String(class_id))
        : null;

    if (parsedClassId != null) {
      const classData = await getClassById(parsedClassId);
      if (!classData) {
        res.status(404).json({ error: 'Class not found' });
        return;
      }

      if (classData.instructor_id !== parseInt(instructor_id)) {
        res.status(403).json({ error: 'You can only create quizzes for your own class' });
        return;
      }
    }

    const newQuiz = await createQuiz({
      instructor_id,
      class_id: parsedClassId,
      course_id: course_id || null,
      title,
      description: description || '',
      questions,
      time_limit_minutes: time_limit_minutes ?? null,
      shuffle_questions: shuffle_questions ?? false,
      shuffle_options: shuffle_options ?? false,
      max_attempts: max_attempts ?? null,
      show_results_after: show_results_after ?? 'immediate',
      allow_late_submit: allow_late_submit ?? true,
    });

    res.status(201).json({
      message: 'Quiz created successfully',
      quiz: newQuiz,
    });
  } catch (error: any) {
    console.error('Error creating quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to create quiz' });
  }
});

// Get all quizzes for an instructor
router.get('/instructor/:instructorId', async (req: Request, res: Response) => {
  try {
    const { instructorId } = req.params;
    const quizzes = await getQuizzesByInstructor(parseInt(instructorId));
    res.json({ quizzes });
  } catch (error: any) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quizzes' });
  }
});

// Get all quizzes for a class
router.get('/class/:classId', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const quizzes = await getQuizzesByClassId(parseInt(classId));
    res.json({ quizzes });
  } catch (error: any) {
    console.error('Error fetching class quizzes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch class quizzes' });
  }
});

// Get quizzes available to a student (classes they joined)
router.get('/student/:studentId/available', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const quizzes = await getStudentAvailableQuizzes(parseInt(studentId));
    res.json({ quizzes });
  } catch (error: any) {
    console.error('Error fetching student quizzes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch student quizzes' });
  }
});

/** Full quiz for a student who is enrolled in the quiz's class (for post-attempt review in My Grades). */
router.get('/student/:studentId(\\d+)/quiz/:quizId(\\d+)/review', async (req: Request, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const quizId = parseInt(req.params.quizId);
    const allowed = await canStudentReviewQuiz(studentId, quizId);
    if (!allowed) {
      res.status(403).json({ error: 'You can only view quizzes from classes you joined' });
      return;
    }
    const quiz = await getQuizById(quizId);
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }
    res.json({ quiz });
  } catch (error: any) {
    console.error('Error fetching quiz for student review:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quiz' });
  }
});

// Get a specific quiz (numeric id only). Pass instructor_id to restrict to owner.
router.get('/:quizId(\\d+)', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const instructorIdRaw = req.query.instructor_id;
    const quiz = await getQuizById(parseInt(quizId));

    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    if (instructorIdRaw !== undefined && instructorIdRaw !== '') {
      const instructorId = parseInt(String(instructorIdRaw));
      if (!Number.isFinite(instructorId) || quiz.instructor_id !== instructorId) {
        res.status(403).json({ error: 'You can only view your own quizzes' });
        return;
      }
    }

    res.json({ quiz });
  } catch (error: any) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quiz' });
  }
});

// Update a quiz (owner only)
router.put('/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const { instructor_id, title, description, questions,
            time_limit_minutes, shuffle_questions, shuffle_options, max_attempts,
            show_results_after, allow_late_submit } = req.body;

    if (!instructor_id || !title || !questions) {
      res.status(400).json({ error: 'instructor_id, title, and questions are required' });
      return;
    }

    const existingQuiz = await getQuizById(parseInt(quizId));
    if (!existingQuiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    if (existingQuiz.instructor_id !== parseInt(String(instructor_id))) {
      res.status(403).json({ error: 'You can only edit your own quizzes' });
      return;
    }

    // Content moderation (education-aware; allows human-biology topics).
    // Flatten all the quiz text and run it through the moderation check.
    const moderation = await moderateEducationalContent(
      buildQuizModerationText(title, description, questions)
    );
    // If the content is not allowed, block the save.
    if (!moderation.allowed) {
      // Record the blocked attempt in the audit log (attributed to the instructor).
      await logModerationBlock({
        userId: Number(instructor_id) || null,
        category: moderation.category,
        reason: moderation.reason,
        context: 'manual_quiz',
      });
      // Return 422 with the reason so the instructor can fix and retry.
      res.status(422).json({
        error: `This quiz was blocked by content moderation: ${moderation.reason}`,
        category: moderation.category,
      });
      return;
    }

    const updatedQuiz = await updateQuiz(parseInt(quizId), {
      instructor_id: existingQuiz.instructor_id,
      title,
      description: description || '',
      questions,
      time_limit_minutes: time_limit_minutes !== undefined ? time_limit_minutes ?? null : existingQuiz.time_limit_minutes,
      shuffle_questions: shuffle_questions !== undefined ? shuffle_questions : existingQuiz.shuffle_questions,
      shuffle_options: shuffle_options !== undefined ? shuffle_options : existingQuiz.shuffle_options,
      max_attempts: max_attempts !== undefined ? max_attempts ?? null : existingQuiz.max_attempts,
      show_results_after: show_results_after !== undefined ? show_results_after : existingQuiz.show_results_after,
      allow_late_submit: allow_late_submit !== undefined ? allow_late_submit : existingQuiz.allow_late_submit,
    });

    res.json({
      message: 'Quiz updated successfully',
      quiz: updatedQuiz,
    });
  } catch (error: any) {
    console.error('Error updating quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to update quiz' });
  }
});

// Duplicate a quiz (owner only)
router.post('/:quizId(\\d+)/duplicate', async (req: Request, res: Response) => {
  try {
    const quizId = parseInt(req.params.quizId);
    const instructorId = parseInt(String(req.body.instructor_id ?? ''));
    if (!instructorId) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }
    const newQuiz = await duplicateQuiz(quizId, instructorId);
    res.status(201).json({ message: 'Quiz duplicated', quiz: newQuiz });
  } catch (error: any) {
    console.error('Error duplicating quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to duplicate quiz' });
  }
});

// Get attempt count for a student on a quiz
router.get('/student/:studentId(\\d+)/quiz/:quizId(\\d+)/attempt-count', async (req: Request, res: Response) => {
  try {
    const count = await countStudentAttempts(parseInt(req.params.studentId), parseInt(req.params.quizId));
    res.json({ count });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get attempt count' });
  }
});

// Delete a quiz (owner only)
router.delete('/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const instructorIdRaw = req.query.instructor_id ?? req.body?.instructor_id;

    if (!instructorIdRaw) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }

    const instructorId = parseInt(String(instructorIdRaw));
    const owns = await instructorOwnsQuiz(instructorId, parseInt(quizId));
    if (!owns) {
      res.status(403).json({ error: 'You can only delete your own quizzes' });
      return;
    }

    await deleteQuiz(parseInt(quizId));

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ error: error.message || 'Failed to delete quiz' });
  }
});

// Get student performance
router.get('/performance/all', async (_req: Request, res: Response) => {
  try {
    const grades = await getStudentPerformance();
    res.json({ grades });
  } catch (error: any) {
    console.error('Error fetching student performance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch student performance' });
  }
});

// Get student performance for a specific instructor class
router.get('/performance/instructor/:instructorId/class/:classId', async (req: Request, res: Response) => {
  try {
    const instructorId = parseInt(req.params.instructorId, 10);
    const classId = parseInt(req.params.classId, 10);
    const classInfo = await getClassById(classId);
    if (!classInfo || Number(classInfo.instructor_id) !== instructorId) {
      res.status(403).json({ error: 'You can only view performance for your own classes' });
      return;
    }

    const [grades, publishedQuizzes] = await Promise.all([
      getClassStudentPerformance(instructorId, classId),
      getPublishedQuizzesForClass(classId, instructorId),
    ]);
    res.json({ grades, publishedQuizzes });
  } catch (error: any) {
    console.error('Error fetching class student performance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch class student performance' });
  }
});

// Send in-app quiz reminders to students who have not submitted
router.post('/performance/remind', async (req: Request, res: Response) => {
  try {
    const { instructor_id, class_id, quiz_id, student_ids, quiz_title } = req.body as {
      instructor_id?: number;
      class_id?: number;
      quiz_id?: number;
      student_ids?: number[];
      quiz_title?: string;
    };

    if (!instructor_id || !class_id || !quiz_id) {
      res.status(400).json({ error: 'instructor_id, class_id, and quiz_id are required' });
      return;
    }

    const classInfo = await getClassById(class_id);
    if (!classInfo || Number(classInfo.instructor_id) !== instructor_id) {
      res.status(403).json({ error: 'You can only send reminders for your own classes' });
      return;
    }

    const published = await isQuizPublishedToClass(class_id, quiz_id, instructor_id);
    if (!published) {
      res.status(404).json({ error: 'Quiz is not published to this class' });
      return;
    }

    const targetIds = Array.isArray(student_ids)
      ? student_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];

    if (targetIds.length === 0) {
      res.status(400).json({ error: 'At least one student_id is required' });
      return;
    }

    const sentCount = await notifyStudentsQuizReminder(
      class_id,
      quiz_id,
      targetIds,
      typeof quiz_title === 'string' ? quiz_title : undefined
    );
    res.json({ ok: true, sentCount });
  } catch (error: any) {
    console.error('Error sending quiz reminders:', error);
    res.status(500).json({ error: error.message || 'Failed to send quiz reminders' });
  }
});

// Save quiz attempt
router.post('/attempts/submit', async (req: Request, res: Response) => {
  try {
    const { student_id, quiz_id, score, correct_answers, total_questions, responses } = req.body;

    // Validation
    if (!student_id || !quiz_id || score === undefined || correct_answers === undefined || total_questions === undefined) {
      res.status(400).json({ error: 'student_id, quiz_id, score, correct_answers, and total_questions are required' });
      return;
    }

    const canAccess = await canStudentAccessQuiz(parseInt(student_id), parseInt(quiz_id));
    if (!canAccess) {
      res.status(403).json({ error: 'You can only submit quizzes from classes you joined' });
      return;
    }

    const quiz = await getQuizById(parseInt(quiz_id));
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }

    if (quiz.max_attempts && quiz.max_attempts > 0) {
      const attemptCount = await countStudentAttempts(parseInt(student_id), parseInt(quiz_id));
      if (attemptCount >= quiz.max_attempts) {
        res.status(403).json({ error: `Maximum attempts (${quiz.max_attempts}) reached for this quiz` });
        return;
      }
    }

    const responseMap =
      responses && typeof responses === 'object' && !Array.isArray(responses)
        ? (responses as Record<string, string>)
        : null;

    const attempt = await saveQuizAttempt(
      student_id,
      quiz_id,
      score,
      correct_answers,
      total_questions,
      responseMap
    );

    try {
      await notifyInstructorQuizAttempt(student_id, quiz_id, score);
    } catch (notifyErr) {
      console.error('Notification (quiz submit):', notifyErr);
    }

    res.status(201).json({
      message: 'Quiz attempt saved successfully',
      attempt,
    });
  } catch (error: any) {
    console.error('Error saving quiz attempt:', error);
    res.status(500).json({ error: error.message || 'Failed to save quiz attempt' });
  }
});

// Get student quiz attempts (grades)
router.get('/attempts/student/:studentId', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const classIdRaw = req.query.class_id;
    const classId =
      classIdRaw === undefined || classIdRaw === '' || classIdRaw === null
        ? null
        : parseInt(String(classIdRaw), 10);
    const attempts = await getStudentQuizAttempts(
      parseInt(studentId),
      Number.isFinite(classId) ? classId : null
    );
    res.json({ attempts });
  } catch (error: any) {
    console.error('Error fetching student quiz attempts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch student quiz attempts' });
  }
});

export default router;
