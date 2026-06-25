import express from 'express';
import type { Request, Response } from 'express';
import pool from '../db.ts';
import { notifyClassStudentsAnnouncement } from '../notificationService.ts';

const router = express.Router();

// POST /api/classes/:classId/announcements — instructor posts an announcement
router.post('/:classId/announcements', async (req: Request, res: Response) => {
  try {
    const classId = parseInt(req.params.classId);
    const { instructor_id, content } = req.body;

    if (!instructor_id || !content) {
      res.status(400).json({ error: 'instructor_id and content are required' });
      return;
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Content cannot be empty' });
      return;
    }

    if (content.length > 500) {
      res.status(400).json({ error: 'Content must be 500 characters or fewer' });
      return;
    }

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
      [classId, instructor_id]
    );
    if ((ownerCheck.rows as any[]).length === 0) {
      res.status(403).json({ error: 'You can only post announcements to your own classes' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO class_announcements (class_id, instructor_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, class_id, instructor_id, content, created_at`,
      [classId, instructor_id, content.trim()]
    );

    try {
      await notifyClassStudentsAnnouncement(classId, content.trim());
    } catch (notifyErr) {
      console.error('Notification (announcement):', notifyErr);
    }

    res.status(201).json({ announcement: (result.rows as any[])[0] });
  } catch (error: any) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: error.message || 'Failed to create announcement' });
  }
});

// GET /api/classes/:classId/announcements — fetch latest 10 announcements
router.get('/:classId/announcements', async (req: Request, res: Response) => {
  try {
    const classId = parseInt(req.params.classId);

    const result = await pool.query(
      `SELECT a.id, a.class_id, a.content, a.created_at, u.username AS instructor_name
       FROM class_announcements a
       JOIN users u ON u.id = a.instructor_id
       WHERE a.class_id = $1
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [classId]
    );

    res.json({ announcements: result.rows });
  } catch (error: any) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch announcements' });
  }
});

// DELETE /api/classes/:classId/announcements/:announcementId — instructor deletes
router.delete('/:classId/announcements/:announcementId', async (req: Request, res: Response) => {
  try {
    const classId = parseInt(req.params.classId);
    const announcementId = parseInt(req.params.announcementId);
    const instructorIdRaw = req.query.instructor_id ?? req.body?.instructor_id;

    if (!instructorIdRaw) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }

    const instructorId = parseInt(String(instructorIdRaw));

    // Verify ownership of the class
    const ownerCheck = await pool.query(
      'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
      [classId, instructorId]
    );
    if ((ownerCheck.rows as any[]).length === 0) {
      res.status(403).json({ error: 'You can only delete announcements from your own classes' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM class_announcements WHERE id = $1 AND class_id = $2 RETURNING id',
      [announcementId, classId]
    );

    if ((result.rows as any[]).length === 0) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }

    res.json({ message: 'Announcement deleted' });
  } catch (error: any) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: error.message || 'Failed to delete announcement' });
  }
});

export default router;
