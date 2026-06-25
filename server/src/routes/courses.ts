import express from 'express';
import type { Request, Response } from 'express';
import {
  createCourse,
  getCoursesByInstructor,
  getCourseById,
  updateCourse,
  deleteCourse,
  enrollStudent,
  unenrollStudent,
  getStudentCourses,
  getEnrolledStudents,
  isStudentEnrolled,
} from '../courseQueries.ts';

const router = express.Router();

// Create a new course (Instructor only)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { instructor_id, title, description } = req.body;

    // Validation
    if (!instructor_id || !title) {
      res.status(400).json({ error: 'instructor_id and title are required' });
      return;
    }

    const newCourse = await createCourse({
      instructor_id,
      title,
      description: description || '',
    });

    res.status(201).json({
      message: 'Course created successfully',
      course: newCourse,
    });
  } catch (error: any) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: error.message || 'Failed to create course' });
  }
});

// Get all courses for an instructor
router.get('/instructor/:instructorId', async (req: Request, res: Response) => {
  try {
    const { instructorId } = req.params;
    const courses = await getCoursesByInstructor(parseInt(instructorId));
    res.json({ courses });
  } catch (error: any) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch courses' });
  }
});

// Get a specific course
router.get('/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const course = await getCourseById(parseInt(courseId));

    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    res.json({ course });
  } catch (error: any) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch course' });
  }
});

// Update a course
router.put('/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { title, description } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const updatedCourse = await updateCourse(parseInt(courseId), { title, description });

    if (!updatedCourse) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    res.json({ message: 'Course updated successfully', course: updatedCourse });
  } catch (error: any) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: error.message || 'Failed to update course' });
  }
});

// Delete a course
router.delete('/:courseId', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const deleted = await deleteCourse(parseInt(courseId));

    if (!deleted) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    res.json({ message: 'Course deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: error.message || 'Failed to delete course' });
  }
});

// Get enrolled students for a course
router.get('/:courseId/students', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const students = await getEnrolledStudents(parseInt(courseId));
    res.json({ students });
  } catch (error: any) {
    console.error('Error fetching enrolled students:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch students' });
  }
});

// Enroll a student in a course
router.post('/:courseId/enroll', async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const { student_id } = req.body;

    if (!student_id) {
      res.status(400).json({ error: 'student_id is required' });
      return;
    }

    const enrollment = await enrollStudent(student_id, parseInt(courseId));

    res.status(201).json({
      message: 'Student enrolled successfully',
      enrollment,
    });
  } catch (error: any) {
    console.error('Error enrolling student:', error);
    res.status(400).json({ error: error.message || 'Failed to enroll student' });
  }
});

// Unenroll a student from a course
router.delete('/:courseId/enroll/:studentId', async (req: Request, res: Response) => {
  try {
    const { courseId, studentId } = req.params;
    const unenrolled = await unenrollStudent(parseInt(studentId), parseInt(courseId));

    if (!unenrolled) {
      res.status(404).json({ error: 'Enrollment not found' });
      return;
    }

    res.json({ message: 'Student unenrolled successfully' });
  } catch (error: any) {
    console.error('Error unenrolling student:', error);
    res.status(500).json({ error: error.message || 'Failed to unenroll student' });
  }
});

// Get all courses for a student
router.get('/student/:studentId', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const courses = await getStudentCourses(parseInt(studentId));
    res.json({ courses });
  } catch (error: any) {
    console.error('Error fetching student courses:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch courses' });
  }
});

// Check if student is enrolled in a course
router.get('/:courseId/enrolled/:studentId', async (req: Request, res: Response) => {
  try {
    const { courseId, studentId } = req.params;
    const isEnrolled = await isStudentEnrolled(parseInt(studentId), parseInt(courseId));
    res.json({ isEnrolled });
  } catch (error: any) {
    console.error('Error checking enrollment:', error);
    res.status(500).json({ error: error.message || 'Failed to check enrollment' });
  }
});

export default router;
