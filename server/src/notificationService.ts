import pool from './db.ts';
import {
  getClassStudentIds,
  insertNotification,
  QUIZ_PASS_THRESHOLD,
} from './notificationQueries.ts';

async function getUsername(userId: number): Promise<string> {
  const result = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
  return (result.rows as any[])[0]?.username ?? 'A student';
}

async function getClassInfo(classId: number): Promise<{ instructorId: number; title: string } | null> {
  const result = await pool.query(
    'SELECT instructor_id, title FROM classes WHERE id = $1',
    [classId]
  );
  const row = (result.rows as any[])[0];
  if (!row) return null;
  return { instructorId: row.instructor_id, title: row.title };
}

async function getQuizInfo(
  quizId: number
): Promise<{ title: string; classId: number | null; instructorId: number } | null> {
  const result = await pool.query(
    'SELECT title, class_id, instructor_id FROM quizzes WHERE id = $1',
    [quizId]
  );
  const row = (result.rows as any[])[0];
  if (!row) return null;
  return {
    title: row.title,
    classId: row.class_id,
    instructorId: row.instructor_id,
  };
}

export async function notifyInstructorStudentJoined(
  studentId: number,
  classId: number
): Promise<void> {
  const classInfo = await getClassInfo(classId);
  if (!classInfo) return;
  const studentName = await getUsername(studentId);
  await insertNotification({
    recipientId: classInfo.instructorId,
    recipientRole: 'Instructor',
    type: 'student_joined',
    title: 'New class member',
    body: `${studentName} joined your class "${classInfo.title}".`,
    metadata: { studentId, classId, classTitle: classInfo.title, studentName },
  });
}

export async function notifyInstructorQuizAttempt(
  studentId: number,
  quizId: number,
  score: number
): Promise<void> {
  const quiz = await getQuizInfo(quizId);
  if (!quiz?.classId) return;
  const classInfo = await getClassInfo(quiz.classId);
  if (!classInfo) return;
  const studentName = await getUsername(studentId);
  const scoreRounded = Math.round(Number(score) * 10) / 10;
  const passed = scoreRounded >= QUIZ_PASS_THRESHOLD;

  if (passed) {
    await insertNotification({
      recipientId: classInfo.instructorId,
      recipientRole: 'Instructor',
      type: 'quiz_completed',
      title: 'Quiz submitted',
      body: `${studentName} finished "${quiz.title}" in ${classInfo.title} with ${scoreRounded}%.`,
      metadata: {
        studentId,
        studentName,
        quizId,
        quizTitle: quiz.title,
        classId: quiz.classId,
        classTitle: classInfo.title,
        score: scoreRounded,
      },
    });
  } else {
    await insertNotification({
      recipientId: classInfo.instructorId,
      recipientRole: 'Instructor',
      type: 'quiz_failed',
      title: 'Quiz needs attention',
      body: `${studentName} completed "${quiz.title}" in ${classInfo.title} but did not pass (${scoreRounded}%).`,
      metadata: {
        studentId,
        studentName,
        quizId,
        quizTitle: quiz.title,
        classId: quiz.classId,
        classTitle: classInfo.title,
        score: scoreRounded,
      },
    });
  }
}

export async function notifyStudentsQuizReminder(
  classId: number,
  quizId: number,
  studentIds: number[],
  quizTitle?: string
): Promise<number> {
  const classInfo = await getClassInfo(classId);
  if (!classInfo || studentIds.length === 0) return 0;

  const quiz = quizTitle
    ? { title: quizTitle }
    : await getQuizInfo(quizId);
  if (!quiz) return 0;

  const uniqueIds = [...new Set(studentIds)];
  await Promise.all(
    uniqueIds.map((studentId) =>
      insertNotification({
        recipientId: studentId,
        recipientRole: 'Student',
        type: 'quiz_reminder',
        title: 'Quiz reminder',
        body: `Reminder: "${quiz.title}" in ${classInfo.title} is waiting for your submission.`,
        metadata: { classId, classTitle: classInfo.title, quizId, quizTitle: quiz.title },
      })
    )
  );
  return uniqueIds.length;
}

export async function notifyClassStudentsQuizPublished(
  classId: number,
  quizId: number,
  quizTitle: string
): Promise<void> {
  const classInfo = await getClassInfo(classId);
  if (!classInfo) return;
  const studentIds = await getClassStudentIds(classId);
  await Promise.all(
    studentIds.map((studentId) =>
      insertNotification({
        recipientId: studentId,
        recipientRole: 'Student',
        type: 'quiz_published',
        title: 'New quiz available',
        body: `Your instructor published "${quizTitle}" in ${classInfo.title}.`,
        metadata: { classId, classTitle: classInfo.title, quizId, quizTitle },
      })
    )
  );
}

export async function notifyClassStudentsGamePublished(
  classId: number,
  gameId: number,
  gameTitle: string,
  gameType: string
): Promise<void> {
  const classInfo = await getClassInfo(classId);
  if (!classInfo) return;
  const label =
    gameType === 'snake'
      ? 'Snake Quest'
      : gameType === 'breakout'
        ? 'Brick Breaker'
        : gameType === 'race'
          ? 'Trivia Race'
          : 'Maze Quest';
  const studentIds = await getClassStudentIds(classId);
  await Promise.all(
    studentIds.map((studentId) =>
      insertNotification({
        recipientId: studentId,
        recipientRole: 'Student',
        type: 'game_published',
        title: 'New game available',
        body: `${label} "${gameTitle}" is now live in ${classInfo.title}.`,
        metadata: { classId, classTitle: classInfo.title, gameId, gameTitle, gameType },
      })
    )
  );
}

export async function notifyClassStudentsAnnouncement(
  classId: number,
  preview: string
): Promise<void> {
  const classInfo = await getClassInfo(classId);
  if (!classInfo) return;
  const snippet =
    preview.length > 120 ? `${preview.slice(0, 117).trim()}…` : preview.trim();
  const studentIds = await getClassStudentIds(classId);
  await Promise.all(
    studentIds.map((studentId) =>
      insertNotification({
        recipientId: studentId,
        recipientRole: 'Student',
        type: 'announcement_published',
        title: 'New class announcement',
        body: `Your instructor posted an update in ${classInfo.title}: "${snippet}"`,
        metadata: { classId, classTitle: classInfo.title, preview: snippet },
      })
    )
  );
}

export async function notifyClassStudentsContentPublished(
  classId: number,
  itemTitle: string,
  topicName?: string
): Promise<void> {
  const classInfo = await getClassInfo(classId);
  if (!classInfo) return;
  const topicPart = topicName ? ` under ${topicName}` : '';
  const studentIds = await getClassStudentIds(classId);
  await Promise.all(
    studentIds.map((studentId) =>
      insertNotification({
        recipientId: studentId,
        recipientRole: 'Student',
        type: 'content_published',
        title: 'New learning material',
        body: `"${itemTitle}" was added to ${classInfo.title}${topicPart}.`,
        metadata: { classId, classTitle: classInfo.title, itemTitle, topicName },
      })
    )
  );
}
