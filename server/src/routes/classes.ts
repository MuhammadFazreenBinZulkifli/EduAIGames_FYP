import express from 'express';
import type { Request, Response } from 'express';
import {
  createClass,
  getClassesByInstructor,
  getClassById,
  updateClass,
  deleteClass,
  getAllAvailableClasses,
  getClassByJoinCode,
  joinClass,
  leaveClass,
  getStudentClasses,
  isStudentInClass,
  getClassMembers,
  getClassMembersForInstructor,
  removeStudentFromClassByInstructor,
} from '../classQueries.ts';
import { notifyInstructorStudentJoined } from '../notificationService.ts';

const router = express.Router();
const CLASS_DESCRIPTION_MAX_LENGTH = 250;

function validateDescription(description: unknown): string | null {
  if (description === undefined || description === null) return '';
  if (typeof description !== 'string') return null;
  if (description.length > CLASS_DESCRIPTION_MAX_LENGTH) {
    return null;
  }
  return description;
}

// Create a new class (Instructor only)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { instructor_id, title, description, visibility } = req.body;

    // Validation
    if (!instructor_id || !title) {
      res.status(400).json({ error: 'instructor_id and title are required' });
      return;
    }

    if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
      res.status(400).json({ error: 'visibility must be public or private' });
      return;
    }

    const validatedDescription = validateDescription(description);
    if (validatedDescription === null) {
      res.status(400).json({
        error: `Description must be at most ${CLASS_DESCRIPTION_MAX_LENGTH} characters`,
      });
      return;
    }

    const newClass = await createClass({
      instructor_id,
      title,
      description: validatedDescription,
      visibility: visibility === 'private' ? 'private' : 'public',
    });

    res.status(201).json({
      message: 'Class created successfully',
      class: newClass,
    });
  } catch (error: any) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: error.message || 'Failed to create class' });
  }
});

// Get all classes for an instructor
router.get('/instructor/:instructorId', async (req: Request, res: Response) => {
  try {
    const { instructorId } = req.params;
    const classes = await getClassesByInstructor(parseInt(instructorId));
    res.json({ classes });
  } catch (error: any) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch classes' });
  }
});

// Get all available classes (for students)
router.get('/available/all', async (req: Request, res: Response) => {
  try {
    const classes = await getAllAvailableClasses();
    res.json({ classes });
  } catch (error: any) {
    console.error('Error fetching available classes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch classes' });
  }
});

// Get class by ID
router.get('/:classId', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const classData = await getClassById(parseInt(classId));

    if (!classData) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }

    res.json({ class: classData });
  } catch (error: any) {
    console.error('Error fetching class:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch class' });
  }
});

// Get class by join code
router.get('/code/:joinCode', async (req: Request, res: Response) => {
  try {
    const { joinCode } = req.params;
    const classData = await getClassByJoinCode(joinCode);

    if (!classData) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }

    res.json({ class: classData });
  } catch (error: any) {
    console.error('Error fetching class:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch class' });
  }
});

// Update class
router.put('/:classId', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { title, description, visibility } = req.body;

    if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
      res.status(400).json({ error: 'visibility must be public or private' });
      return;
    }

    let validatedDescription: string | undefined;
    if (description !== undefined) {
      const parsed = validateDescription(description);
      if (parsed === null) {
        res.status(400).json({
          error: `Description must be at most ${CLASS_DESCRIPTION_MAX_LENGTH} characters`,
        });
        return;
      }
      validatedDescription = parsed;
    }

    const updatedClass = await updateClass(parseInt(classId), {
      title,
      description: validatedDescription,
      visibility: visibility === 'private' ? 'private' : visibility === 'public' ? 'public' : undefined,
    });

    res.json({
      message: 'Class updated successfully',
      class: updatedClass,
    });
  } catch (error: any) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: error.message || 'Failed to update class' });
  }
});

// Update class background image
router.put('/:classId/background', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { background_image } = req.body as { background_image: string | null };
    if (background_image && background_image.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image is too large. Please use a smaller image.' });
      return;
    }
    const result = await (await import('../db.ts')).default.query(
      `UPDATE classes SET background_image = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING id, background_image`,
      [parseInt(classId), background_image ?? null]
    );
    res.json({ class: (result.rows as any[])[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update background' });
  }
});

// Delete class
router.delete('/:classId', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;

    await deleteClass(parseInt(classId));

    res.json({ message: 'Class deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: error.message || 'Failed to delete class' });
  }
});

// Student joins a class using join code
router.post('/student/join-by-code', async (req: Request, res: Response) => {
  try {
    const { student_id, join_code } = req.body;

    if (!student_id || !join_code) {
      res.status(400).json({ error: 'student_id and join_code are required' });
      return;
    }

    const classData = await getClassByJoinCode(join_code);
    if (!classData) {
      res.status(404).json({ error: 'Invalid join code' });
      return;
    }

    const membership = await joinClass(student_id, classData.id);
    try {
      await notifyInstructorStudentJoined(student_id, classData.id);
    } catch (notifyErr) {
      console.error('Notification (join by code):', notifyErr);
    }

    res.status(201).json({
      message: 'Successfully joined class',
      membership,
      class: classData,
    });
  } catch (error: any) {
    console.error('Error joining class:', error);
    if (error.message.includes('Already joined')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Failed to join class' });
    }
  }
});

// Student joins a class using class ID
router.post('/student/join/:classId', async (req: Request, res: Response) => {
  try {
    const { student_id } = req.body;
    const { classId } = req.params;

    if (!student_id) {
      res.status(400).json({ error: 'student_id is required' });
      return;
    }

    const classData = await getClassById(parseInt(classId));
    if (!classData) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }

    const visibility = classData.visibility ?? 'public';
    if (visibility === 'private') {
      res.status(403).json({
        error: 'This class is private. Use the join code shared by your instructor.',
      });
      return;
    }

    const membership = await joinClass(student_id, parseInt(classId));
    try {
      await notifyInstructorStudentJoined(student_id, parseInt(classId));
    } catch (notifyErr) {
      console.error('Notification (join class):', notifyErr);
    }

    res.status(201).json({
      message: 'Successfully joined class',
      membership,
      class: classData,
    });
  } catch (error: any) {
    console.error('Error joining class:', error);
    if (error.message.includes('Already joined')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Failed to join class' });
    }
  }
});

// Student leaves a class
router.delete('/student/:classId', async (req: Request, res: Response) => {
  try {
    const { student_id } = req.body;
    const { classId } = req.params;

    if (!student_id) {
      res.status(400).json({ error: 'student_id is required' });
      return;
    }

    await leaveClass(student_id, parseInt(classId));

    res.json({ message: 'Successfully left class' });
  } catch (error: any) {
    console.error('Error leaving class:', error);
    res.status(500).json({ error: error.message || 'Failed to leave class' });
  }
});

// Get all classes for a student
router.get('/student/:studentId/my-classes', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const classes = await getStudentClasses(parseInt(studentId));
    res.json({ classes });
  } catch (error: any) {
    console.error('Error fetching student classes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch classes' });
  }
});

// Check if student is in a class
router.get('/student/:studentId/check/:classId', async (req: Request, res: Response) => {
  try {
    const { studentId, classId } = req.params;
    const isMember = await isStudentInClass(parseInt(studentId), parseInt(classId));
    res.json({ isMember });
  } catch (error: any) {
    console.error('Error checking membership:', error);
    res.status(500).json({ error: error.message || 'Failed to check membership' });
  }
});

// Get all members in a class
router.get('/:classId/members', async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const members = await getClassMembers(parseInt(classId));
    res.json({ members });
  } catch (error: any) {
    console.error('Error fetching class members:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch members' });
  }
});

// Instructor view class members (ownership-protected)
router.get('/:classId/instructor/:instructorId/members', async (req: Request, res: Response) => {
  try {
    const { classId, instructorId } = req.params;
    const members = await getClassMembersForInstructor(parseInt(classId), parseInt(instructorId));
    res.json({ members });
  } catch (error: any) {
    console.error('Error fetching instructor class members:', error);
    if (error.message.includes('own classes')) {
      res.status(403).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to fetch members' });
  }
});

// Instructor removes student from class (ownership-protected)
router.delete('/:classId/instructor/:instructorId/students/:studentId', async (req: Request, res: Response) => {
  try {
    const { classId, instructorId, studentId } = req.params;
    await removeStudentFromClassByInstructor(
      parseInt(instructorId),
      parseInt(classId),
      parseInt(studentId)
    );
    res.json({ message: 'Student removed from class successfully' });
  } catch (error: any) {
    console.error('Error removing student by instructor:', error);
    if (error.message.includes('own classes')) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error.message.includes('not in this class')) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to remove student' });
  }
});

export default router;
