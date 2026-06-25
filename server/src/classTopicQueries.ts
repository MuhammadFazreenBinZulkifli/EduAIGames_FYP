import pool from './db.ts';

export const QUIZ_TOPIC_NAME = 'Quiz';

export interface ClassTopic {
  id: number;
  class_id: number;
  name: string;
  is_quiz_topic: boolean;
  display_order: number;
  created_at: string;
}

export interface ClassTopicItem {
  id: number;
  topic_id: number;
  class_id: number;
  item_type: 'file' | 'quiz';
  title: string;
  file_name: string | null;
  stored_name: string | null;
  mime_type: string | null;
  quiz_id: number | null;
  display_order: number;
  created_at: string;
  quiz_title?: string;
}

async function verifyInstructorOwnsClass(classId: number, instructorId: number) {
  const result = await pool.query(
    'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
    [classId, instructorId]
  );
  if ((result.rows as any[]).length === 0) {
    throw new Error('You can only manage your own classes');
  }
}

async function verifyStudentInClass(classId: number, studentId: number) {
  const result = await pool.query(
    'SELECT id FROM class_memberships WHERE class_id = $1 AND student_id = $2',
    [classId, studentId]
  );
  if ((result.rows as any[]).length === 0) {
    throw new Error('You are not enrolled in this class');
  }
}

export async function ensureQuizTopic(classId: number): Promise<ClassTopic | null> {
  const existing = await pool.query(
    `SELECT id, class_id, name, is_quiz_topic, display_order, created_at
     FROM class_topics WHERE class_id = $1 AND is_quiz_topic = true`,
    [classId]
  );
  if ((existing.rows as any[]).length > 0) {
    return (existing.rows as any[])[0];
  }

  const customCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM class_topics WHERE class_id = $1 AND is_quiz_topic = false`,
    [classId]
  );
  if ((customCount.rows as any[])[0].count === 0) {
    return null;
  }

  const orderResult = await pool.query(
    `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM class_topics WHERE class_id = $1`,
    [classId]
  );
  const nextOrder = (orderResult.rows as any[])[0].next_order;

  const inserted = await pool.query(
    `INSERT INTO class_topics (class_id, name, is_quiz_topic, display_order)
     VALUES ($1, $2, true, $3)
     RETURNING id, class_id, name, is_quiz_topic, display_order, created_at`,
    [classId, QUIZ_TOPIC_NAME, nextOrder]
  );
  return (inserted.rows as any[])[0];
}

export async function createCustomTopic(classId: number, instructorId: number, name: string) {
  await verifyInstructorOwnsClass(classId, instructorId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Topic name is required');
  if (trimmed.toLowerCase() === QUIZ_TOPIC_NAME.toLowerCase()) {
    throw new Error(`"${QUIZ_TOPIC_NAME}" is reserved for quizzes`);
  }

  const orderResult = await pool.query(
    `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM class_topics WHERE class_id = $1`,
    [classId]
  );
  const nextOrder = (orderResult.rows as any[])[0].next_order;

  const result = await pool.query(
    `INSERT INTO class_topics (class_id, name, is_quiz_topic, display_order)
     VALUES ($1, $2, false, $3)
     RETURNING id, class_id, name, is_quiz_topic, display_order, created_at`,
    [classId, trimmed, nextOrder]
  );

  await ensureQuizTopic(classId);
  return (result.rows as any[])[0];
}

export async function deleteCustomTopic(topicId: number, instructorId: number) {
  const topicResult = await pool.query(
    `SELECT t.id, t.class_id, t.is_quiz_topic FROM class_topics t
     JOIN classes c ON c.id = t.class_id
     WHERE t.id = $1 AND c.instructor_id = $2`,
    [topicId, instructorId]
  );
  const topic = (topicResult.rows as any[])[0];
  if (!topic) throw new Error('Topic not found');
  if (topic.is_quiz_topic) throw new Error('The Quiz topic cannot be deleted');

  await pool.query('DELETE FROM class_topics WHERE id = $1', [topicId]);
  return { success: true };
}

async function getTopicItems(topicIds: number[]): Promise<Map<number, ClassTopicItem[]>> {
  const map = new Map<number, ClassTopicItem[]>();
  if (topicIds.length === 0) return map;

  const result = await pool.query(
    `SELECT i.id, i.topic_id, i.class_id, i.item_type, i.title, i.file_name, i.stored_name,
            i.mime_type, i.quiz_id, i.display_order, i.created_at, q.title AS quiz_title
     FROM class_topic_items i
     LEFT JOIN quizzes q ON q.id = i.quiz_id
     WHERE i.topic_id = ANY($1::int[])
     ORDER BY i.display_order ASC, i.created_at ASC`,
    [topicIds]
  );

  for (const row of result.rows as ClassTopicItem[]) {
    const list = map.get(row.topic_id) || [];
    list.push(row);
    map.set(row.topic_id, list);
  }
  return map;
}

export async function getClassContentForInstructor(classId: number, instructorId: number) {
  await verifyInstructorOwnsClass(classId, instructorId);
  await ensureQuizTopic(classId);

  const topicsResult = await pool.query(
    `SELECT id, class_id, name, is_quiz_topic, display_order, created_at
     FROM class_topics WHERE class_id = $1
     ORDER BY is_quiz_topic ASC, display_order ASC, id ASC`,
    [classId]
  );
  const topics = topicsResult.rows as ClassTopic[];
  const itemsMap = await getTopicItems(topics.map((t) => t.id));

  return topics.map((t) => ({
    ...t,
    items: itemsMap.get(t.id) || [],
  }));
}

export async function getClassContentForStudent(classId: number, studentId: number) {
  await verifyStudentInClass(classId, studentId);

  const topicsResult = await pool.query(
    `SELECT id, class_id, name, is_quiz_topic, display_order, created_at
     FROM class_topics WHERE class_id = $1
     ORDER BY is_quiz_topic ASC, display_order ASC, id ASC`,
    [classId]
  );
  const topics = topicsResult.rows as ClassTopic[];
  const itemsMap = await getTopicItems(topics.map((t) => t.id));

  return topics.map((t) => ({
    ...t,
    items: itemsMap.get(t.id) || [],
  }));
}

export async function addFileItem(
  topicId: number,
  instructorId: number,
  data: { title: string; file_name: string; stored_name: string; mime_type: string }
) {
  const topicResult = await pool.query(
    `SELECT t.id, t.class_id, t.is_quiz_topic FROM class_topics t
     JOIN classes c ON c.id = t.class_id
     WHERE t.id = $1 AND c.instructor_id = $2`,
    [topicId, instructorId]
  );
  const topic = (topicResult.rows as any[])[0];
  if (!topic) throw new Error('Topic not found');
  if (topic.is_quiz_topic) throw new Error('Upload files to a custom topic, not the Quiz topic');

  const orderResult = await pool.query(
    `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM class_topic_items WHERE topic_id = $1`,
    [topicId]
  );
  const nextOrder = (orderResult.rows as any[])[0].next_order;

  const result = await pool.query(
    `INSERT INTO class_topic_items
     (topic_id, class_id, item_type, title, file_name, stored_name, mime_type, display_order)
     VALUES ($1, $2, 'file', $3, $4, $5, $6, $7)
     RETURNING id, topic_id, class_id, item_type, title, file_name, stored_name, mime_type, quiz_id, display_order, created_at`,
    [topicId, topic.class_id, data.title, data.file_name, data.stored_name, data.mime_type, nextOrder]
  );
  return (result.rows as any[])[0];
}

export async function addQuizToTopic(topicId: number, instructorId: number, quizId: number) {
  const topicResult = await pool.query(
    `SELECT t.id, t.class_id, t.is_quiz_topic FROM class_topics t
     JOIN classes c ON c.id = t.class_id
     WHERE t.id = $1 AND c.instructor_id = $2`,
    [topicId, instructorId]
  );
  const topic = (topicResult.rows as any[])[0];
  if (!topic) throw new Error('Topic not found');
  if (!topic.is_quiz_topic) throw new Error('Quizzes can only be published to the Quiz topic');

  const quizResult = await pool.query(
    'SELECT id, title, class_id FROM quizzes WHERE id = $1 AND instructor_id = $2',
    [quizId, instructorId]
  );
  const quiz = (quizResult.rows as any[])[0];
  if (!quiz) throw new Error('Quiz not found');
  if (quiz.class_id != null && quiz.class_id !== topic.class_id) {
    throw new Error('Quiz must belong to this class');
  }

  const dup = await pool.query(
    `SELECT id FROM class_topic_items WHERE topic_id = $1 AND quiz_id = $2`,
    [topicId, quizId]
  );
  if ((dup.rows as any[]).length > 0) {
    throw new Error('This quiz is already published in the Quiz topic');
  }

  const orderResult = await pool.query(
    `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM class_topic_items WHERE topic_id = $1`,
    [topicId]
  );
  const nextOrder = (orderResult.rows as any[])[0].next_order;

  const result = await pool.query(
    `INSERT INTO class_topic_items
     (topic_id, class_id, item_type, title, quiz_id, display_order)
     VALUES ($1, $2, 'quiz', $3, $4, $5)
     RETURNING id, topic_id, class_id, item_type, title, file_name, stored_name, mime_type, quiz_id, display_order, created_at`,
    [topicId, topic.class_id, quiz.title, quizId, nextOrder]
  );
  return (result.rows as any[])[0];
}

export async function deleteTopicItem(itemId: number, instructorId: number) {
  const itemResult = await pool.query(
    `SELECT i.id, i.stored_name, i.item_type, i.class_id, c.instructor_id
     FROM class_topic_items i
     JOIN classes c ON c.id = i.class_id
     WHERE i.id = $1 AND c.instructor_id = $2`,
    [itemId, instructorId]
  );
  const item = (itemResult.rows as any[])[0];
  if (!item) throw new Error('Item not found');

  await pool.query('DELETE FROM class_topic_items WHERE id = $1', [itemId]);
  return item;
}

export async function getTopicItemForDownload(itemId: number) {
  const result = await pool.query(
    `SELECT i.id, i.class_id, i.item_type, i.stored_name, i.file_name, i.mime_type, i.title
     FROM class_topic_items i WHERE i.id = $1`,
    [itemId]
  );
  return (result.rows as any[])[0] || null;
}

export async function getClassQuizzesForPicker(classId: number, instructorId: number) {
  await verifyInstructorOwnsClass(classId, instructorId);
  const result = await pool.query(
    `SELECT id, title, description, created_at FROM quizzes
     WHERE instructor_id = $2 AND (class_id IS NULL OR class_id = $1)
     ORDER BY created_at DESC`,
    [classId, instructorId]
  );
  return result.rows;
}
