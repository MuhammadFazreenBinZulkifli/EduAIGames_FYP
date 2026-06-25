import express from 'express';
import type { Request, Response } from 'express';
import {
  getNotificationsForUser,
  getUnreadCount,
  markNotificationsRead,
  clearNotificationsForUser,
} from '../notificationQueries.ts';

const router = express.Router();

router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const notifications = await getNotificationsForUser(userId);
    const unreadCount = await getUnreadCount(userId);
    res.json({ notifications, unreadCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch notifications';
    res.status(500).json({ error: message });
  }
});

router.get('/user/:userId/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const unreadCount = await getUnreadCount(userId);
    res.json({ unreadCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch unread count';
    res.status(500).json({ error: message });
  }
});

router.post('/user/:userId/mark-read', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const { notification_ids } = req.body as { notification_ids?: number[] };
    await markNotificationsRead(userId, notification_ids);
    const unreadCount = await getUnreadCount(userId);
    res.json({ ok: true, unreadCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark notifications read';
    res.status(500).json({ error: message });
  }
});

router.post('/user/:userId/clear', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    await clearNotificationsForUser(userId);
    res.json({ ok: true, unreadCount: 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear notifications';
    res.status(500).json({ error: message });
  }
});

export default router;
