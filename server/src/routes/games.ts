import express from 'express';
import type { Request, Response } from 'express';
import pool from '../db.ts';
import {
  createGame,
  getGamesByInstructor,
  getGameById,
  updateGame,
  deleteGame,
  publishGameToClass,
  unpublishGameFromClass,
  getPublishedGamesForInstructor,
  getPublishedGamesForStudent,
} from '../gameQueries.ts';
import { GAME_TYPES, type GameType } from '../gameQueries.ts';
import { notifyClassStudentsGamePublished } from '../notificationService.ts';
import { requireFeature } from '../featureGate.ts';

const router = express.Router();
router.use(requireFeature('games_enabled'));

// Create a new saved game
router.post('/', async (req: Request, res: Response) => {
  try {
    const { instructor_id, quiz_id, title, description, ghost_enabled, game_type, settings } = req.body;
    if (!instructor_id || !quiz_id || !title) {
      res.status(400).json({ error: 'instructor_id, quiz_id, and title are required' });
      return;
    }
    // Verify instructor owns the quiz
    const quizCheck = await pool.query(
      'SELECT id FROM quizzes WHERE id = $1 AND instructor_id = $2',
      [parseInt(quiz_id), parseInt(instructor_id)]
    );
    if ((quizCheck.rows as any[]).length === 0) {
      res.status(403).json({ error: 'You can only create games from your own quizzes' });
      return;
    }
    const game = await createGame({
      instructor_id: parseInt(instructor_id),
      quiz_id: parseInt(quiz_id),
      title: String(title).trim(),
      description: String(description || '').trim(),
      ghost_enabled: !!ghost_enabled,
      game_type: (GAME_TYPES.includes(game_type as GameType) ? game_type : 'maze') as GameType,
      settings: typeof settings === 'string' ? settings : JSON.stringify(settings || {}),
    });
    res.status(201).json({ game });
  } catch (error: any) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: error.message || 'Failed to create game' });
  }
});

// Get all saved games for an instructor
router.get('/instructor/:instructorId', async (req: Request, res: Response) => {
  try {
    const games = await getGamesByInstructor(parseInt(req.params.instructorId));
    res.json({ games });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch games' });
  }
});

// Get published games for a class — instructor view
router.get('/class/:classId/instructor/:instructorId', async (req: Request, res: Response) => {
  try {
    const games = await getPublishedGamesForInstructor(
      parseInt(req.params.classId),
      parseInt(req.params.instructorId)
    );
    res.json({ games });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch class games' });
  }
});

// Get published games for a class — student view
router.get('/class/:classId/student/:studentId', async (req: Request, res: Response) => {
  try {
    const games = await getPublishedGamesForStudent(
      parseInt(req.params.classId),
      parseInt(req.params.studentId)
    );
    res.json({ games });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch games' });
  }
});

// Unpublish a game from a class (must come before /:gameId route)
router.delete('/class-game/:classGameId', async (req: Request, res: Response) => {
  try {
    const { classGameId } = req.params;
    const instructorId = req.query.instructor_id ?? (req.body as any)?.instructor_id;
    if (!instructorId) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }
    await unpublishGameFromClass(parseInt(classGameId), parseInt(String(instructorId)));
    res.json({ message: 'Game unpublished from class' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to unpublish game' });
  }
});

// Get a single game by ID
router.get('/:gameId(\\d+)', async (req: Request, res: Response) => {
  try {
    const game = await getGameById(parseInt(req.params.gameId));
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json({ game });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch game' });
  }
});

// Update a game
router.put('/:gameId', async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;
    const { instructor_id, title, description, ghost_enabled, settings } = req.body;
    if (!instructor_id || !title) {
      res.status(400).json({ error: 'instructor_id and title are required' });
      return;
    }
    const game = await updateGame(parseInt(gameId), parseInt(instructor_id), {
      title: String(title).trim(),
      description: String(description || '').trim(),
      ghost_enabled: !!ghost_enabled,
      settings: typeof settings === 'string' ? settings : JSON.stringify(settings || {}),
    });
    res.json({ game });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update game' });
  }
});

// Delete a game
router.delete('/:gameId', async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;
    const instructorId = req.query.instructor_id ?? (req.body as any)?.instructor_id;
    if (!instructorId) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }
    await deleteGame(parseInt(gameId), parseInt(String(instructorId)));
    res.json({ message: 'Game deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete game' });
  }
});

// Publish a game to a class
router.post('/:gameId/publish/:classId', async (req: Request, res: Response) => {
  try {
    const { gameId, classId } = req.params;
    const { instructor_id } = req.body;
    if (!instructor_id) {
      res.status(400).json({ error: 'instructor_id is required' });
      return;
    }
    const game = await getGameById(parseInt(gameId));
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    if (game.instructor_id !== parseInt(instructor_id)) {
      res.status(403).json({ error: 'You can only publish your own games' });
      return;
    }
    const classCheck = await pool.query(
      'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
      [parseInt(classId), parseInt(instructor_id)]
    );
    if ((classCheck.rows as any[]).length === 0) {
      res.status(403).json({ error: 'You can only publish to your own classes' });
      return;
    }
    await publishGameToClass(parseInt(classId), parseInt(gameId));
    try {
      await notifyClassStudentsGamePublished(
        parseInt(classId),
        parseInt(gameId),
        game.title,
        game.game_type
      );
    } catch (notifyErr) {
      console.error('Notification (game publish):', notifyErr);
    }
    res.status(201).json({ message: 'Game published to class' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to publish game' });
  }
});

export default router;
