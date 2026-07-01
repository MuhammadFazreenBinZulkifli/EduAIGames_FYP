import pool from './db.ts';

// Generate a random join code
function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export type ClassVisibility = 'public' | 'private';

// Create a new class
export async function createClass(data: {
  instructor_id: number;
  title: string;
  description: string;
  visibility?: ClassVisibility;
}) {
  try {
    const joinCode = generateJoinCode();
    const visibility = data.visibility === 'private' ? 'private' : 'public';
    const result = await pool.query(
      `INSERT INTO classes (instructor_id, title, description, join_code, visibility)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, instructor_id, title, description, join_code, visibility, background_image, created_at, updated_at`,
      [data.instructor_id, data.title, data.description, joinCode, visibility]
    );
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error creating class:', error);
    throw error;
  }
}

// Get all classes for an instructor
export async function getClassesByInstructor(instructorId: number) {
  try {
    const result = await pool.query(
      `SELECT id, instructor_id, title, description, join_code, visibility, background_image, created_at, updated_at
       FROM classes WHERE instructor_id = $1 ORDER BY created_at DESC`,
      [instructorId]
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching classes:', error);
    throw error;
  }
}

// Get class by ID
export async function getClassById(classId: number) {
  try {
    const result = await pool.query(
      `SELECT id, instructor_id, title, description, join_code, visibility, background_image, created_at, updated_at
       FROM classes WHERE id = $1`,
      [classId]
    );
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error fetching class:', error);
    throw error;
  }
}

// Update class
export async function updateClass(
  classId: number,
  data: { title?: string; description?: string; visibility?: ClassVisibility }
) {
  try {
    const updates = [];
    const values = [classId];
    let paramIndex = 2;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (data.visibility !== undefined) {
      updates.push(`visibility = $${paramIndex}`);
      values.push(data.visibility === 'private' ? 'private' : 'public');
      paramIndex++;
    }

    if (updates.length === 0) {
      return { id: classId };
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `UPDATE classes SET ${updates.join(', ')} WHERE id = $1 RETURNING id, instructor_id, title, description, join_code, visibility, background_image, created_at, updated_at`;

    const result = await pool.query(query, values);
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error updating class:', error);
    throw error;
  }
}

// Delete class
export async function deleteClass(classId: number) {
  try {
    await pool.query('DELETE FROM classes WHERE id = $1', [classId]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting class:', error);
    throw error;
  }
}

// Get all available classes (for students to join)
export async function getAllAvailableClasses() {
  try {
    const result = await pool.query(
      `SELECT c.id, c.instructor_id, c.title, c.description, c.join_code, c.visibility, c.background_image, c.created_at, u.username AS instructor_name
       FROM classes c
       JOIN users u ON c.instructor_id = u.id
       WHERE COALESCE(c.visibility, 'public') = 'public'
       ORDER BY c.created_at DESC`
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching available classes:', error);
    throw error;
  }
}

// Get class by join code
export async function getClassByJoinCode(joinCode: string) {
  try {
    const result = await pool.query(
      `SELECT c.id, c.instructor_id, c.title, c.description, c.join_code, c.visibility, c.background_image, c.created_at, u.username AS instructor_name
       FROM classes c
       JOIN users u ON c.instructor_id = u.id
       WHERE c.join_code = $1`,
      [joinCode]
    );
    return (result.rows as any[])[0];
  } catch (error) {
    console.error('Error fetching class by join code:', error);
    throw error;
  }
}

// Student joins a class
export async function joinClass(studentId: number, classId: number) {
  try {
    const result = await pool.query(
      'INSERT INTO class_memberships (student_id, class_id) VALUES ($1, $2) RETURNING id, student_id, class_id, joined_at',
      [studentId, classId]
    );
    return (result.rows as any[])[0];
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error('Already joined this class');
    }
    console.error('Error joining class:', error);
    throw error;
  }
}

// Student leaves a class
export async function leaveClass(studentId: number, classId: number) {
  try {
    await pool.query('DELETE FROM class_memberships WHERE student_id = $1 AND class_id = $2', [
      studentId,
      classId,
    ]);
    return { success: true };
  } catch (error) {
    console.error('Error leaving class:', error);
    throw error;
  }
}

// Get all classes for a student (with member count and join date)
export async function getStudentClasses(studentId: number) {
  try {
    const result = await pool.query(
      `SELECT c.id, c.instructor_id, c.title, c.description, c.join_code, c.visibility, c.background_image,
              cm.joined_at,
              u.username AS instructor_name,
              (SELECT COUNT(*)::int FROM class_memberships cm2 WHERE cm2.class_id = c.id) AS student_count
       FROM classes c
       JOIN class_memberships cm ON c.id = cm.class_id
       JOIN users u ON c.instructor_id = u.id
       WHERE cm.student_id = $1
       ORDER BY cm.joined_at DESC`,
      [studentId]
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching student classes:', error);
    throw error;
  }
}

// Check if student is in a class
export async function isStudentInClass(studentId: number, classId: number) {
  try {
    const result = await pool.query(
      'SELECT id FROM class_memberships WHERE student_id = $1 AND class_id = $2',
      [studentId, classId]
    );
    return (result.rows as any[]).length > 0;
  } catch (error) {
    console.error('Error checking class membership:', error);
    throw error;
  }
}

// Get all members in a class
export async function getClassMembers(classId: number) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.avatar_url, cm.joined_at
       FROM class_memberships cm
       JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1
       ORDER BY cm.joined_at DESC`,
      [classId]
    );
    return result.rows as any[];
  } catch (error) {
    console.error('Error fetching class members:', error);
    throw error;
  }
}

// Get members only when class belongs to instructor
export async function getClassMembersForInstructor(classId: number, instructorId: number) {
  try {
    const ownership = await pool.query(
      'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
      [classId, instructorId]
    );

    if ((ownership.rows as any[]).length === 0) {
      throw new Error('You can only view members for your own classes');
    }

    return await getClassMembers(classId);
  } catch (error) {
    console.error('Error fetching instructor class members:', error);
    throw error;
  }
}

// Instructor removes a student from own class
export async function removeStudentFromClassByInstructor(
  instructorId: number,
  classId: number,
  studentId: number
) {
  try {
    const ownership = await pool.query(
      'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
      [classId, instructorId]
    );

    if ((ownership.rows as any[]).length === 0) {
      throw new Error('You can only manage your own classes');
    }

    const deleted = await pool.query(
      'DELETE FROM class_memberships WHERE class_id = $1 AND student_id = $2 RETURNING id',
      [classId, studentId]
    );

    if ((deleted.rows as any[]).length === 0) {
      throw new Error('Student is not in this class');
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing student from class by instructor:', error);
    throw error;
  }
}
