import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db.ts';
import {
  createCustomTopic,
  deleteCustomTopic,
  getClassContentForInstructor,
  getClassContentForStudent,
  addFileItem,
  addQuizToTopic,
  deleteTopicItem,
  getTopicItemForDownload,
  getClassQuizzesForPicker,
} from '../classTopicQueries.ts';
import {
  notifyClassStudentsContentPublished,
  notifyClassStudentsQuizPublished,
} from '../notificationService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, '../../uploads/class-materials');

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const ALLOWED_EXT = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext) || ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents (.pdf, .doc, .docx) are allowed'));
    }
  },
});

function guessMimeType(fileName: string, storedMime?: string | null): string {
  if (storedMime && storedMime !== 'application/octet-stream') return storedMime;
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function verifyFileAccess(
  item: { class_id: number },
  studentId: number | null,
  instructorId: number | null
): Promise<boolean> {
  if (studentId) {
    const mem = await pool.query(
      'SELECT id FROM class_memberships WHERE student_id = $1 AND class_id = $2',
      [studentId, item.class_id]
    );
    return (mem.rows as any[]).length > 0;
  }
  if (instructorId) {
    const own = await pool.query('SELECT id FROM classes WHERE id = $1 AND instructor_id = $2', [
      item.class_id,
      instructorId,
    ]);
    return (own.rows as any[]).length > 0;
  }
  return false;
}

function sendClassFile(
  res: Response,
  filePath: string,
  fileName: string,
  mimeType: string,
  inline: boolean
) {
  const safeName = (fileName || 'document').replace(/[^\w.\- ()]/g, '_');
  res.setHeader('Content-Type', mimeType);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`
  );
  res.sendFile(path.resolve(filePath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to send file' });
    }
  });
}

const router = express.Router();

router.get('/class/:classId/instructor/:instructorId', async (req: Request, res: Response) => {
  try {
    const { classId, instructorId } = req.params;
    const classRow = await pool.query(
      'SELECT id, title, description FROM classes WHERE id = $1 AND instructor_id = $2',
      [parseInt(classId), parseInt(instructorId)]
    );
    if ((classRow.rows as any[]).length === 0) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    const topics = await getClassContentForInstructor(parseInt(classId), parseInt(instructorId));
    res.json({ class: (classRow.rows as any[])[0], topics });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load class content' });
  }
});

router.get('/class/:classId/student/:studentId', async (req: Request, res: Response) => {
  try {
    const { classId, studentId } = req.params;
    const classRow = await pool.query(
      `SELECT c.id, c.title, c.description, u.username AS instructor_name
       FROM classes c JOIN users u ON u.id = c.instructor_id WHERE c.id = $1`,
      [parseInt(classId)]
    );
    if ((classRow.rows as any[]).length === 0) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    const topics = await getClassContentForStudent(parseInt(classId), parseInt(studentId));
    res.json({ class: (classRow.rows as any[])[0], topics });
  } catch (error: any) {
    if (error.message?.includes('not enrolled')) {
      res.status(403).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to load class content' });
  }
});

router.get('/class/:classId/quizzes/:instructorId', async (req: Request, res: Response) => {
  try {
    const { classId, instructorId } = req.params;
    const quizzes = await getClassQuizzesForPicker(parseInt(classId), parseInt(instructorId));
    res.json({ quizzes });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load quizzes' });
  }
});

router.post('/class/:classId/topics', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { instructor_id, name } = req.body;
    if (!instructor_id || !name) {
      res.status(400).json({ error: 'instructor_id and name are required' });
      return;
    }
    const topic = await createCustomTopic(parseInt(classId), instructor_id, name);
    res.status(201).json({ topic });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create topic' });
  }
});

router.delete('/topics/:topicId', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const instructorId = parseInt(String(req.query.instructor_id || req.body?.instructor_id));
    if (!instructorId) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }
    await deleteCustomTopic(parseInt(topicId), instructorId);
    res.json({ message: 'Topic deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to delete topic' });
  }
});

router.post(
  '/topics/:topicId/files',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Upload failed' });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const { topicId } = req.params;
      const instructorId = parseInt(String(req.body.instructor_id));
      if (!instructorId) {
        res.status(400).json({ error: 'instructor_id is required' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const topicRow = await pool.query(
        'SELECT t.class_id, t.name AS topic_name FROM class_topics t JOIN classes c ON c.id = t.class_id WHERE t.id = $1 AND c.instructor_id = $2',
        [parseInt(topicId), instructorId]
      );
      if ((topicRow.rows as any[]).length === 0) {
        res.status(404).json({ error: 'Topic not found' });
        return;
      }
      const topicMeta = (topicRow.rows as any[])[0];
      const classId = topicMeta.class_id;
      const topicName = topicMeta.topic_name as string | undefined;
      const ext = path.extname(req.file.originalname).toLowerCase();
      const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const classDir = path.join(uploadsRoot, String(classId));
      fs.mkdirSync(classDir, { recursive: true });
      fs.writeFileSync(path.join(classDir, storedName), req.file.buffer);

      const title = (req.body.title as string)?.trim() || req.file.originalname;
      const item = await addFileItem(parseInt(topicId), instructorId, {
        title,
        file_name: req.file.originalname,
        stored_name: storedName,
        mime_type: req.file.mimetype || guessMimeType(req.file.originalname),
      });
      try {
        await notifyClassStudentsContentPublished(classId, title, topicName);
      } catch (notifyErr) {
        console.error('Notification (file publish):', notifyErr);
      }
      res.status(201).json({ item });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to upload file' });
    }
  }
);

router.post('/topics/:topicId/quizzes', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const { instructor_id, quiz_id } = req.body;
    if (!instructor_id || !quiz_id) {
      res.status(400).json({ error: 'instructor_id and quiz_id are required' });
      return;
    }
    const item = await addQuizToTopic(parseInt(topicId), instructor_id, quiz_id);
    try {
      await notifyClassStudentsQuizPublished(item.class_id, item.quiz_id, item.title);
    } catch (notifyErr) {
      console.error('Notification (quiz publish):', notifyErr);
    }
    res.status(201).json({ item });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to publish quiz' });
  }
});

router.delete('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const instructorId = parseInt(String(req.query.instructor_id || req.body?.instructor_id));
    if (!instructorId) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }
    const deleted = await deleteTopicItem(parseInt(itemId), instructorId);
    if (deleted.stored_name && deleted.item_type === 'file' && deleted.class_id) {
      const filePath = path.join(uploadsRoot, String(deleted.class_id), deleted.stored_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.json({ message: 'Item removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to delete item' });
  }
});

router.get('/files/:itemId/view', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const studentId = req.query.student_id ? parseInt(String(req.query.student_id)) : null;
    const instructorId = req.query.instructor_id ? parseInt(String(req.query.instructor_id)) : null;

    const item = await getTopicItemForDownload(parseInt(itemId));
    if (!item || item.item_type !== 'file' || !item.stored_name) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const allowed = await verifyFileAccess(item, studentId, instructorId);
    if (!studentId && !instructorId) {
      res.status(400).json({ error: 'student_id or instructor_id is required' });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const filePath = path.join(uploadsRoot, String(item.class_id), item.stored_name);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File missing on server' });
      return;
    }

    const fileName = item.file_name || item.title;
    const mimeType = guessMimeType(fileName, item.mime_type);
    const inline = mimeType === 'application/pdf';
    sendClassFile(res, filePath, fileName, mimeType, inline);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to open file' });
  }
});

router.get('/files/:itemId/download', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const studentId = req.query.student_id ? parseInt(String(req.query.student_id)) : null;
    const instructorId = req.query.instructor_id ? parseInt(String(req.query.instructor_id)) : null;

    const item = await getTopicItemForDownload(parseInt(itemId));
    if (!item || item.item_type !== 'file' || !item.stored_name) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!studentId && !instructorId) {
      res.status(400).json({ error: 'student_id or instructor_id is required' });
      return;
    }
    const allowed = await verifyFileAccess(item, studentId, instructorId);
    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const filePath = path.join(uploadsRoot, String(item.class_id), item.stored_name);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File missing on server' });
      return;
    }

    const fileName = item.file_name || item.title;
    const mimeType = guessMimeType(fileName, item.mime_type);
    sendClassFile(res, filePath, fileName, mimeType, false);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Download failed' });
  }
});

export default router;
