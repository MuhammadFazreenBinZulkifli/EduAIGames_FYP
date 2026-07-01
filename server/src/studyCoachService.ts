import { canStudentReviewQuiz, getQuizById, getStudentQuizAttempts, getPublishedQuizzesForClass } from './quizQueries.ts';
import { getStudentClasses, isStudentInClass } from './classQueries.ts';
import { getClassContentForStudent } from './classTopicQueries.ts';
import { getPublishedGamesForStudent } from './gameQueries.ts';

export interface StudyCoachMistake {
  quiz_id: number;
  quiz_title: string;
  question_index: number;
  question_text: string;
  question_type: string;
  student_answer: string;
  correct_answer: string;
  explanation?: string;
  options?: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function parseResponses(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([k, v]) => [String(k), String(v)])
  );
}

/** Collect wrong answers from the student's latest attempts (optional class filter). */
export async function collectStudentMistakes(
  studentId: number,
  classId?: number | null
): Promise<StudyCoachMistake[]> {
  const attempts = await getStudentQuizAttempts(studentId, classId);
  const mistakes: StudyCoachMistake[] = [];
  const seenQuiz = new Set<number>();

  for (const attempt of attempts) {
    const quizId = Number(attempt.quiz_id);
    if (!Number.isFinite(quizId) || seenQuiz.has(quizId)) continue;
    seenQuiz.add(quizId);

    const allowed = await canStudentReviewQuiz(studentId, quizId);
    if (!allowed) continue;

    const responses = parseResponses(attempt.responses);
    if (Object.keys(responses).length === 0) continue;

    const quiz = await getQuizById(quizId);
    if (!quiz?.questions?.length) continue;

    const sorted = [...quiz.questions].sort(
      (a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)
    );

    sorted.forEach((q, idx) => {
      const key = String(idx);
      const studentAnswer = responses[key];
      if (studentAnswer == null) return;

      const correct = q.correct_answer?.trim() ?? '';
      if (!correct) return;
      if (norm(studentAnswer) === norm(correct)) return;

      const options =
        q.question_type === 'true-false'
          ? ['True', 'False']
          : (q.options || []).map((o) => o.option_text).filter(Boolean);

      mistakes.push({
        quiz_id: quizId,
        quiz_title: attempt.quiz_title || quiz.title,
        question_index: idx,
        question_text: q.question_text,
        question_type: q.question_type,
        student_answer: studentAnswer,
        correct_answer: correct,
        explanation: q.explanation ?? undefined,
        options: options.length > 0 ? options : undefined,
      });
    });
  }

  return mistakes;
}

/** Rich student context for Study Coach chat and generation. */
export async function buildStudyCoachContext(
  studentId: number,
  classId?: number | null
): Promise<string | null> {
  try {
    const [classes, attempts, mistakes] = await Promise.all([
      getStudentClasses(studentId),
      getStudentQuizAttempts(studentId, classId ?? null),
      collectStudentMistakes(studentId, classId ?? null),
    ]);

    const parts: string[] = [];
    const focused = classId ? classes.find((c: { id: number }) => c.id === classId) : null;

    if (focused) {
      const name = (focused as { title?: string; instructor_name?: string }).title || 'Selected class';
      const instructor = (focused as { instructor_name?: string }).instructor_name;
      parts.push(
        `Focused class: "${name}"${instructor ? ` (instructor: ${instructor})` : ''}.`
      );
    } else if (classes.length > 0) {
      const titles = classes
        .slice(0, 8)
        .map((c: { title?: string }) => c.title)
        .filter(Boolean)
        .join(', ');
      parts.push(`Enrolled in ${classes.length} class(es): ${titles}.`);
    }

    if (attempts.length > 0) {
      const scores = attempts.map((a: { score?: number }) => Number(a.score) || 0);
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const weak = attempts.filter((a: { score?: number }) => (Number(a.score) || 0) < 70);
      const strong = attempts.filter((a: { score?: number }) => (Number(a.score) || 0) >= 85);

      parts.push(
        `Recent quiz performance: average ${avg.toFixed(0)}% across ${attempts.length} attempt(s).`
      );
      if (weak.length > 0) {
        parts.push(
          `Weakest quizzes (<70%): ${weak
            .slice(0, 5)
            .map(
              (a: { quiz_title?: string; score?: number }) =>
                `"${a.quiz_title}" ${Math.round(Number(a.score) || 0)}%`
            )
            .join('; ')}.`
        );
      }
      if (strong.length > 0) {
        parts.push(
          `Strongest quizzes (≥85%): ${strong
            .slice(0, 4)
            .map(
              (a: { quiz_title?: string; score?: number }) =>
                `"${a.quiz_title}" ${Math.round(Number(a.score) || 0)}%`
            )
            .join('; ')}.`
        );
      }
    }

    if (mistakes.length > 0) {
      parts.push(`Recent wrong answers (${mistakes.length}):`);
      mistakes.slice(0, 6).forEach((m) => {
        const q = m.question_text.length > 140 ? `${m.question_text.slice(0, 140)}…` : m.question_text;
        parts.push(
          `- From "${m.quiz_title}": "${q}" | student answered: ${m.student_answer} | correct: ${m.correct_answer}`
        );
      });
    }

    if (parts.length === 0) return null;

    return (
      'Use this live student data to personalize tutoring. Reference quiz titles and scores when relevant. ' +
      'Never invent classes, quizzes, or grades not listed here.\n\n' +
      parts.join('\n')
    );
  } catch {
    return null;
  }
}

export interface ClassOverviewSnapshot {
  is_sparse: boolean;
  context_text: string;
}

/** Factual class snapshot for AI class overview (student must be enrolled). */
export async function gatherClassOverviewContext(
  studentId: number,
  classId: number
): Promise<ClassOverviewSnapshot> {
  const enrolled = await isStudentInClass(studentId, classId);
  if (!enrolled) {
    throw new Error('You are not enrolled in this class.');
  }

  const classes = await getStudentClasses(studentId);
  const classRow = classes.find((c: { id: number }) => c.id === classId);
  if (!classRow) {
    throw new Error('Class not found.');
  }

  const instructorId = Number(classRow.instructor_id);
  const [content, games, publishedQuizzes, attempts, mistakes] = await Promise.all([
    getClassContentForStudent(classId, studentId).catch(() => []),
    getPublishedGamesForStudent(classId, studentId).catch(() => []),
    getPublishedQuizzesForClass(classId, instructorId).catch(() => []),
    getStudentQuizAttempts(studentId, classId).catch(() => []),
    collectStudentMistakes(studentId, classId).catch(() => []),
  ]);

  const topicNames = content.map((t: { name: string; is_quiz_topic: boolean }) =>
    t.is_quiz_topic ? `${t.name} (quizzes)` : t.name
  );
  const fileCount = content.reduce(
    (sum: number, t: { items: unknown[] }) => sum + (t.items?.length ?? 0),
    0
  );
  const quizTitles = publishedQuizzes.map((q: { title: string }) => q.title);
  const gameTitles = games.map((g: { game_title: string }) => g.game_title);

  const completedQuizIds = new Set(attempts.map((a: { quiz_id: number }) => a.quiz_id));
  const pendingCount = publishedQuizzes.filter(
    (q: { id: number }) => !completedQuizIds.has(q.id)
  ).length;
  const avgScore =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((s: number, a: { score?: number }) => s + (Number(a.score) || 0), 0) /
            attempts.length
        )
      : null;

  const lines: string[] = [
    `Class: "${classRow.title}"`,
    classRow.description?.trim()
      ? `Description: ${String(classRow.description).slice(0, 400)}`
      : 'Description: (none provided)',
    `Instructor: ${classRow.instructor_name || 'Unknown'}`,
    `Students enrolled: ${classRow.student_count ?? 'unknown'}`,
    `You joined: ${classRow.joined_at ? new Date(classRow.joined_at).toLocaleDateString() : 'unknown'}`,
    `Topics: ${topicNames.length > 0 ? topicNames.join(', ') : 'none yet'}`,
    `Materials and items in topics: ${fileCount}`,
    `Published quizzes (${quizTitles.length}): ${quizTitles.length > 0 ? quizTitles.join('; ') : 'none yet'}`,
    `Learning games (${gameTitles.length}): ${gameTitles.length > 0 ? gameTitles.join('; ') : 'none yet'}`,
    `Your quiz attempts in this class: ${attempts.length}`,
    pendingCount > 0 ? `Quizzes not yet completed by you: ${pendingCount}` : '',
    avgScore != null ? `Your average score in this class: ${avgScore}%` : 'You have not completed any quizzes in this class yet.',
  ];

  if (attempts.length > 0) {
    lines.push('Your recent scores:');
    attempts.slice(0, 8).forEach((a: { quiz_title?: string; score?: number; completed_at?: string }) => {
      const date = a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '';
      lines.push(`- "${a.quiz_title}": ${Math.round(Number(a.score) || 0)}%${date ? ` on ${date}` : ''}`);
    });
  }

  if (mistakes.length > 0) {
    lines.push(`Recent mistakes (${mistakes.length}):`);
    mistakes.slice(0, 5).forEach((m) => {
      lines.push(`- "${m.quiz_title}": ${m.question_text.slice(0, 100)} (correct: ${m.correct_answer})`);
    });
  }

  const is_sparse =
    topicNames.length === 0 &&
    fileCount === 0 &&
    quizTitles.length === 0 &&
    gameTitles.length === 0 &&
    attempts.length === 0;

  if (is_sparse) {
    lines.push(
      'Note: This class currently has very little or no published content. The instructor may still be setting it up.'
    );
  }

  return {
    is_sparse: is_sparse,
    context_text: lines.filter(Boolean).join('\n'),
  };
}
