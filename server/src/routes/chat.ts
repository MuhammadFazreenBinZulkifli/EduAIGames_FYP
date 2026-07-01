import express from 'express';
import type { Request, Response } from 'express';
import {
  createChatCompletion,
  moderateEducationalContent,
  generateStudyInsights,
  explainQuizMistake,
  generateStudyQuestions,
  generatePracticeFromMistakes,
  generateClassOverview,
  STUDY_COACH_CHAT_PROMPT,
  EDUBOT_SYSTEM_PROMPT,
  type ChatMessage,
  type StudyQuestionFormat,
} from '../openai.ts';
import { requireFeature } from '../featureGate.ts';
import { logModerationBlock } from '../adminServices.ts';
import { getStudentClasses } from '../classQueries.ts';
import { getStudentQuizAttempts, getPublishedQuizzesForClass } from '../quizQueries.ts';
import { collectStudentMistakes, buildStudyCoachContext, gatherClassOverviewContext } from '../studyCoachService.ts';

const router = express.Router();

// Resolves the signed-in user id (sent as X-User-Id by the API client) so
// moderation blocks can be attributed to the instructor in the audit log.
function resolveUserId(req: Request): number | null {
  // Read the X-User-Id header from the incoming request.
  const raw = req.headers['x-user-id'];
  // Headers can be a string or array; take the first value if it's an array.
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Convert it to a number.
  const num = Number(value);
  // Return the id only if it's a valid positive number, otherwise null.
  return Number.isFinite(num) && num > 0 ? num : null;
}

// Builds a compact, factual snapshot of a student's own classes, available
// quizzes (with due dates) and recent grades. EduBot uses this to answer
// questions like "what quizzes are due?" or "how am I doing?" grounded in real
// data. Returns null when there's nothing useful to add. Never throws.
async function buildStudentContext(studentId: number): Promise<string | null> {
  try {
    // Fetch the student's classes and recent attempts in parallel.
    const [classes, attempts] = await Promise.all([
      getStudentClasses(studentId),
      getStudentQuizAttempts(studentId),
    ]);

    const parts: string[] = [];

    // Summarise enrolled classes (cap to keep the prompt small).
    if (classes.length > 0) {
      const classList = classes
        .slice(0, 10)
        .map((c: any) => `${c.title}${c.instructor_name ? ` (instructor: ${c.instructor_name})` : ''}`)
        .join('; ');
      parts.push(`Enrolled classes (${classes.length}): ${classList}.`);
    }

    // Gather quizzes published to each class (lightweight query, no questions).
    const quizzes: Array<{ title: string }> = [];
    for (const c of classes.slice(0, 6)) {
      try {
        const classQuizzes = await getPublishedQuizzesForClass(c.id, c.instructor_id);
        for (const q of classQuizzes) quizzes.push({ title: q.title });
      } catch {
        // Skip any class whose quizzes can't be loaded.
      }
    }
    if (quizzes.length > 0) {
      const quizList = quizzes
        .slice(0, 15)
        .map((q) => `"${q.title}"`)
        .join('; ');
      parts.push(`Quizzes available to the student: ${quizList}.`);
    }

    // Summarise the most recent grades.
    if (attempts.length > 0) {
      const gradeList = attempts
        .slice(0, 8)
        .map((a: any) => `"${a.quiz_title}" ${Math.round(Number(a.score) || 0)}%`)
        .join('; ');
      parts.push(`Recent quiz grades: ${gradeList}.`);
    }

    // Nothing to add -> no extra context.
    if (parts.length === 0) return null;

    // Wrap the facts with guidance on how EduBot should use them.
    return `## The student's own data (use ONLY to answer questions about their classes, quizzes, due dates, and grades; if a detail isn't listed here, say you don't have that information):\n${parts.join('\n')}`;
  } catch {
    // On any failure, just skip grounding rather than break the chat.
    return null;
  }
}

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;

function describePage(pathname: string | undefined, role: string | undefined): string | null {
  if (!pathname) return null;

  const studentPages: Array<[string, string]> = [
    ['/student/dashboard', 'Student Dashboard'],
    ['/student/join', 'Join Class (browse or enter join code)'],
    ['/student/classes', 'Enrolled Classes (membership list)'],
    ['/student/courses', 'Class Content (materials, quizzes, games)'],
    ['/student/quiz', 'Pending Quizzes overview'],
    ['/student/grades', 'My Grades'],
    ['/student/study-coach', 'AI Study Coach'],
    ['/student/settings', 'Student Settings'],
  ];

  const instructorPages: Array<[string, string]> = [
    ['/instructor/dashboard', 'Instructor Dashboard'],
    ['/instructor/classes', 'My Classes'],
    ['/instructor/library', 'Library (quizzes and games)'],
    ['/instructor/studio', 'Content Maker (quizzes & games)'],
    ['/instructor/performance', 'Student Performance'],
    ['/instructor/settings', 'Instructor Settings'],
  ];

  if (pathname === '/' || pathname === '') {
    return 'Public marketing front page (not logged in)';
  }

  const list =
    role === 'Instructor'
      ? instructorPages
      : role === 'Student'
        ? studentPages
        : [...studentPages, ...instructorPages];

  for (const [path, label] of list) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      return label;
    }
  }

  if (pathname.startsWith('/student/games')) return 'Student learning game (in progress)';
  if (pathname.startsWith('/instructor/studio/')) return 'Content Maker editor';
  if (pathname.startsWith('/instructor/classes/')) return 'Instructor class management (deep page)';

  return null;
}

router.post('/', requireFeature('chatbot_enabled'), requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const { messages, role, username, pathname, userId } = req.body as {
      messages?: Array<{ role: string; content: string }>;
      role?: string;
      username?: string;
      pathname?: string;
      userId?: number;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required.' });
      return;
    }

    const trimmed = messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, MAX_MESSAGE_LENGTH),
    })) as ChatMessage[];

    const contextBits: string[] = [];
    if (username) contextBits.push(`The user's display name is ${username}.`);
    if (role === 'Instructor' || role === 'Student') {
      contextBits.push(`The user is logged in as a ${role}. Tailor website guidance to that role when relevant.`);
    } else {
      contextBits.push('The user is on the public front page (not logged in). Help with general questions and how to sign up or log in.');
    }

    const pageLabel = describePage(typeof pathname === 'string' ? pathname : undefined, role);
    if (pageLabel) {
      contextBits.push(
        `The user is currently viewing: ${pageLabel} (path: ${pathname}). When they ask "here" or "this page", refer to that screen and give step-by-step directions using the sidebar labels from your system prompt.`
      );
    }

    // For students, ground EduBot in their real classes, quizzes and grades so it
    // can answer questions about their own data accurately.
    if (role === 'Student') {
      const studentId = Number(userId) || resolveUserId(req);
      if (studentId) {
        const studentContext = await buildStudentContext(studentId);
        if (studentContext) contextBits.push(studentContext);
      }
    }

    const systemContent =
      contextBits.length > 0
        ? `${EDUBOT_SYSTEM_PROMPT}\n\n## Current session\n${contextBits.join('\n')}`
        : EDUBOT_SYSTEM_PROMPT;

    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...trimmed,
    ];

    // EduBot uses a stronger conversational model than the cheaper background
    // tasks (moderation / study-coach) so its help and tutoring are sharper.
    // Override with OPENAI_CHAT_MODEL if you want a different/cheaper model.
    const reply = await createChatCompletion({
      messages: apiMessages,
      model: process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o',
      temperature: 0.6,
      max_tokens: 1000,
    });

    res.json({ reply: reply.trim() || 'Sorry, I could not generate a response. Please try again.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chat request failed';
    console.error('Chat error:', message);
    res.status(500).json({ error: message });
  }
});

// Personalized "Study Coach" — analyses a student's quiz results and returns
// structured, encouraging insights. Optionally scoped to a single class.
router.post('/study-coach', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    // Resolve the student id from the body, falling back to the X-User-Id header.
    const bodyId = Number((req.body as { student_id?: number }).student_id);
    const studentId = Number.isFinite(bodyId) && bodyId > 0 ? bodyId : resolveUserId(req);
    if (!studentId) {
      res.status(400).json({ error: 'student_id is required.' });
      return;
    }

    // Optional class filter — null means "all of the student's quizzes".
    const rawClassId = Number((req.body as { class_id?: number }).class_id);
    const classId = Number.isFinite(rawClassId) && rawClassId > 0 ? rawClassId : null;

    // Load the student's submitted attempts (optionally for one class only).
    const attempts = await getStudentQuizAttempts(studentId, classId);

    // No attempts yet -> nothing to analyse; tell the UI to show a friendly hint.
    if (attempts.length === 0) {
      res.json({ insights: null, message: 'Complete a quiz to unlock your personalized study insights.' });
      return;
    }

    // Turn the most recent attempts into a compact text summary for the model.
    const lines = attempts.slice(0, 25).map((a: any) => {
      const score = Number(a.score) || 0;
      const date = a.completed_at ? new Date(a.completed_at).toLocaleDateString() : 'unknown date';
      return `- "${a.quiz_title}": ${score.toFixed(0)}% (${a.correct_answers}/${a.total_questions}) on ${date}`;
    });
    const scores = attempts.map((a: any) => Number(a.score) || 0);
    const avg = scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
    const weak = attempts.filter((a: any) => (Number(a.score) || 0) < 70);
    const performanceText = [
      classId ? 'Scope: single selected class.' : 'Scope: all enrolled classes.',
      `Average score: ${avg.toFixed(0)}% across ${attempts.length} recent attempt(s).`,
      weak.length > 0
        ? `Quizzes below 70%: ${weak
            .slice(0, 6)
            .map((a: any) => `"${a.quiz_title}" ${Math.round(Number(a.score) || 0)}%`)
            .join('; ')}.`
        : '',
      `Student's recent quiz results:\n${lines.join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Ask the AI study coach for structured insights.
    const insights = await generateStudyInsights(performanceText);
    res.json({ insights });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate study insights';
    console.error('Study coach error:', message);
    res.status(500).json({ error: message });
  }
});

// Wrong answers from recent quiz attempts (for Review tab).
router.post('/study-coach/mistakes', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const bodyId = Number((req.body as { student_id?: number }).student_id);
    const studentId = Number.isFinite(bodyId) && bodyId > 0 ? bodyId : resolveUserId(req);
    if (!studentId) {
      res.status(400).json({ error: 'student_id is required.' });
      return;
    }
    const rawClassId = Number((req.body as { class_id?: number }).class_id);
    const classId = Number.isFinite(rawClassId) && rawClassId > 0 ? rawClassId : null;
    const mistakes = await collectStudentMistakes(studentId, classId);
    res.json({ mistakes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load mistakes';
    console.error('Study coach mistakes error:', message);
    res.status(500).json({ error: message });
  }
});

// AI explanation for a single wrong answer.
router.post('/study-coach/explain', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      question_text?: string;
      question_type?: string;
      student_answer?: string;
      correct_answer?: string;
      options?: string[];
      explanation?: string;
    };
    if (!body.question_text?.trim() || !body.correct_answer?.trim()) {
      res.status(400).json({ error: 'question_text and correct_answer are required.' });
      return;
    }
    const textToModerate = [body.question_text, body.student_answer, body.correct_answer].join(' ');
    const mod = await moderateEducationalContent(textToModerate);
    if (!mod.allowed) {
      res.status(422).json({ error: mod.reason });
      return;
    }
    const result = await explainQuizMistake({
      question_text: body.question_text,
      question_type: body.question_type || 'multiple-choice',
      student_answer: body.student_answer || '(no answer)',
      correct_answer: body.correct_answer,
      options: body.options,
      existing_explanation: body.explanation,
    });
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to explain mistake';
    console.error('Study coach explain error:', message);
    res.status(500).json({ error: message });
  }
});

const VALID_FORMATS: StudyQuestionFormat[] = [
  'multiple-choice',
  'true-false',
  'short-answer',
  'essay',
  'fill-blank',
];

// Generate practice questions from weak areas / mistakes.
router.post('/study-coach/practice', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const body = req.body as { student_id?: number; class_id?: number; count?: number };
    const studentId = Number.isFinite(Number(body.student_id)) && Number(body.student_id) > 0
      ? Number(body.student_id)
      : resolveUserId(req);
    if (!studentId) {
      res.status(400).json({ error: 'student_id is required.' });
      return;
    }
    const classId = Number.isFinite(Number(body.class_id)) && Number(body.class_id) > 0
      ? Number(body.class_id)
      : null;
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);

    const mistakes = await collectStudentMistakes(studentId, classId);
    let context: string;
    if (mistakes.length > 0) {
      context = mistakes
        .slice(0, 12)
        .map(
          (m) =>
            `- From "${m.quiz_title}": Q: ${m.question_text} | Student said: ${m.student_answer} | Correct: ${m.correct_answer}`
        )
        .join('\n');
    } else {
      const attempts = await getStudentQuizAttempts(studentId, classId);
      if (attempts.length === 0) {
        res.status(400).json({
          error: 'Complete at least one quiz first, or use Create to generate questions from a topic.',
        });
        return;
      }
      context = attempts
        .slice(0, 10)
        .map((a: { quiz_title?: string; score?: number }) => `- "${a.quiz_title}": ${Math.round(Number(a.score) || 0)}%`)
        .join('\n');
    }

    const mod = await moderateEducationalContent(context);
    if (!mod.allowed) {
      res.status(422).json({ error: mod.reason });
      return;
    }

    const set = await generatePracticeFromMistakes(context, count);
    const outputMod = await moderateEducationalContent(JSON.stringify(set.questions));
    if (!outputMod.allowed) {
      res.status(422).json({ error: `Generated content was blocked: ${outputMod.reason}` });
      return;
    }
    res.json(set);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate practice';
    console.error('Study coach practice error:', message);
    res.status(500).json({ error: message });
  }
});

// Create study questions in various formats (quiz, essay, etc.).
router.post('/study-coach/create', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      topic?: string;
      format?: StudyQuestionFormat;
      count?: number;
      difficulty?: 'easy' | 'normal' | 'hard';
      class_id?: number;
      student_id?: number;
    };
    if (!body.topic?.trim()) {
      res.status(400).json({ error: 'topic is required.' });
      return;
    }
    const format = VALID_FORMATS.includes(body.format as StudyQuestionFormat)
      ? (body.format as StudyQuestionFormat)
      : 'multiple-choice';
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);
    const difficulty =
      body.difficulty === 'easy' || body.difficulty === 'hard' ? body.difficulty : 'normal';

    const promptCheck = await moderateEducationalContent(body.topic);
    if (!promptCheck.allowed) {
      res.status(422).json({ error: promptCheck.reason });
      return;
    }

    let context: string | undefined;
    const studentId = Number.isFinite(Number(body.student_id)) && Number(body.student_id) > 0
      ? Number(body.student_id)
      : resolveUserId(req);
    if (studentId) {
      const classId =
        Number.isFinite(Number(body.class_id)) && Number(body.class_id) > 0
          ? Number(body.class_id)
          : null;
      const coachCtx = await buildStudyCoachContext(studentId, classId);
      if (coachCtx) context = coachCtx;
    }

    const set = await generateStudyQuestions({
      topic: body.topic.trim(),
      format,
      count,
      difficulty,
      context,
    });

    const outputCheck = await moderateEducationalContent(JSON.stringify(set.questions));
    if (!outputCheck.allowed) {
      res.status(422).json({ error: `Generated content was blocked: ${outputCheck.reason}` });
      return;
    }

    res.json(set);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create questions';
    console.error('Study coach create error:', message);
    res.status(500).json({ error: message });
  }
});

// AI overview of a single enrolled class (Analyse button on Enrolled Classes).
router.post('/study-coach/class-overview', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const body = req.body as { student_id?: number; class_id?: number };
    const studentId =
      Number.isFinite(Number(body.student_id)) && Number(body.student_id) > 0
        ? Number(body.student_id)
        : resolveUserId(req);
    const classId = Number(body.class_id);

    if (!studentId) {
      res.status(400).json({ error: 'student_id is required.' });
      return;
    }
    if (!Number.isFinite(classId) || classId <= 0) {
      res.status(400).json({ error: 'class_id is required.' });
      return;
    }

    const snapshot = await gatherClassOverviewContext(studentId, classId);
    const overview = await generateClassOverview(snapshot.context_text, snapshot.is_sparse);

    res.json({ overview, is_sparse: snapshot.is_sparse });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to analyse class';
    console.error('Class overview error:', message);
    res.status(500).json({ error: message });
  }
});

// Focused study chat (learning-only coach).
router.post('/study-coach/ask', requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const { messages, class_id, student_id } = req.body as {
      messages?: Array<{ role: string; content: string }>;
      class_id?: number;
      student_id?: number;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required.' });
      return;
    }

    const studentId =
      Number.isFinite(Number(student_id)) && Number(student_id) > 0
        ? Number(student_id)
        : resolveUserId(req);

    const trimmed = messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content || '').slice(0, MAX_MESSAGE_LENGTH),
    }));

    const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      const mod = await moderateEducationalContent(lastUser.content);
      if (!mod.allowed) {
        res.status(422).json({ error: mod.reason });
        return;
      }
    }

    let contextParts: string[] = [];
    if (studentId) {
      const classId =
        Number.isFinite(Number(class_id)) && Number(class_id) > 0 ? Number(class_id) : null;
      const coachCtx = await buildStudyCoachContext(studentId, classId);
      if (coachCtx) contextParts.push(coachCtx);
    }

    const systemContent =
      STUDY_COACH_CHAT_PROMPT +
      (contextParts.length > 0 ? `\n\n## Student context\n${contextParts.join('\n\n')}` : '');

    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...trimmed,
    ];

    const reply = await createChatCompletion({
      messages: apiMessages,
      temperature: 0.55,
      max_tokens: 1200,
    });

    res.json({ reply });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Study coach chat failed';
    console.error('Study coach ask error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/quiz-generate', requireFeature('ai_quiz_enabled'), requireFeature('openai_enabled'), async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'prompt is required.' });
      return;
    }

    // Identify who is making the request (for the audit log).
    const userId = resolveUserId(req);

    // 1) Screen the instructor's request before generating anything.
    const promptCheck = await moderateEducationalContent(prompt);
    // If the prompt is inappropriate, log it and stop here.
    if (!promptCheck.allowed) {
      // Record the blocked attempt in the audit log.
      await logModerationBlock({
        userId,
        category: promptCheck.category,
        reason: promptCheck.reason,
        context: 'ai_quiz_prompt',
      });
      // Return 422 with a readable reason the instructor will see.
      res.status(422).json({
        error: `This request was blocked by content moderation: ${promptCheck.reason}`,
        category: promptCheck.category,
      });
      return;
    }

    const raw = await createChatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a quiz generator. Always respond with valid JSON only, with no markdown and no extra text.',
        },
        { role: 'user', content: prompt.trim().slice(0, 12000) },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    // 2) Screen the generated questions (the model can still drift off-topic).
    const outputCheck = await moderateEducationalContent(raw);
    // If the AI produced something inappropriate, log it and don't send it back.
    if (!outputCheck.allowed) {
      // Record the blocked output in the audit log.
      await logModerationBlock({
        userId,
        category: outputCheck.category,
        reason: outputCheck.reason,
        context: 'ai_quiz_output',
      });
      // Return 422 so the instructor knows the generated quiz was rejected.
      res.status(422).json({
        error: `The generated quiz was blocked by content moderation: ${outputCheck.reason}`,
        category: outputCheck.category,
      });
      return;
    }

    // All checks passed — return the generated quiz JSON.
    res.json({ content: raw });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Quiz generation failed';
    console.error('Quiz generate error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
