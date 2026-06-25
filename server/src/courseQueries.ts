import pool from './db.ts';

export interface Course {
  id?: number;
  instructor_id: number;
  title: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface StudentEnrollment {
  id?: number;
  student_id: number;
  course_id: number;
  enrolled_at?: string;
}

// Course Functions

export async function createCourse(course: Course): Promise<Course> {
  try {
    const result = await pool.query(
      'INSERT INTO courses (instructor_id, title, description) VALUES ($1, $2, $3) RETURNING id, instructor_id, title, description, created_at, updated_at',
      [course.instructor_id, course.title, course.description]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating course:', error);
    throw error;
  }
}

export async function getCoursesByInstructor(instructorId: number): Promise<Course[]> {
  try {
    const result = await pool.query(
      'SELECT id, instructor_id, title, description, created_at, updated_at FROM courses WHERE instructor_id = $1 ORDER BY created_at DESC',
      [instructorId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching courses:', error);
    throw error;
  }
}

export async function getCourseById(courseId: number): Promise<Course | null> {
  try {
    const result = await pool.query(
      'SELECT id, instructor_id, title, description, created_at, updated_at FROM courses WHERE id = $1',
      [courseId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching course:', error);
    throw error;
  }
}

export async function updateCourse(courseId: number, updates: Partial<Course>): Promise<Course | null> {
  try {
    const { title, description } = updates;
    const result = await pool.query(
      'UPDATE courses SET title = COALESCE($1, title), description = COALESCE($2, description), updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, instructor_id, title, description, created_at, updated_at',
      [title, description, courseId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error updating course:', error);
    throw error;
  }
}

export async function deleteCourse(courseId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'DELETE FROM courses WHERE id = $1 RETURNING id',
      [courseId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error deleting course:', error);
    throw error;
  }
}

// Student Enrollment Functions

export async function enrollStudent(studentId: number, courseId: number): Promise<StudentEnrollment> {
  try {
    const result = await pool.query(
      'INSERT INTO student_enrollments (student_id, course_id) VALUES ($1, $2) RETURNING id, student_id, course_id, enrolled_at',
      [studentId, courseId]
    );
    return result.rows[0];
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error('Student is already enrolled in this course');
    }
    console.error('Error enrolling student:', error);
    throw error;
  }
}

export async function unenrollStudent(studentId: number, courseId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'DELETE FROM student_enrollments WHERE student_id = $1 AND course_id = $2 RETURNING id',
      [studentId, courseId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error unenrolling student:', error);
    throw error;
  }
}

export async function getStudentCourses(studentId: number): Promise<Course[]> {
  try {
    const result = await pool.query(
      `SELECT c.id, c.instructor_id, c.title, c.description, c.created_at, c.updated_at
       FROM courses c
       INNER JOIN student_enrollments se ON c.id = se.course_id
       WHERE se.student_id = $1
       ORDER BY c.created_at DESC`,
      [studentId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching student courses:', error);
    throw error;
  }
}

export async function getEnrolledStudents(courseId: number): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, se.enrolled_at
       FROM users u
       INNER JOIN student_enrollments se ON u.id = se.student_id
       WHERE se.course_id = $1
       ORDER BY se.enrolled_at DESC`,
      [courseId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching enrolled students:', error);
    throw error;
  }
}

export async function isStudentEnrolled(studentId: number, courseId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT id FROM student_enrollments WHERE student_id = $1 AND course_id = $2',
      [studentId, courseId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking enrollment:', error);
    throw error;
  }
}
