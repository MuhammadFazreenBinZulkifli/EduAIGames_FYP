import { ROUTES } from '../routes/paths'
import type { NotificationType } from '../components/NotificationBell'

export function notificationTargetPath(
  type: NotificationType,
  metadata: Record<string, unknown> | null | undefined,
  role: 'Student' | 'Instructor' | string
): string | null {
  const classId = metadata?.classId != null ? Number(metadata.classId) : null
  const quizId = metadata?.quizId != null ? Number(metadata.quizId) : null

  if (role === 'Student') {
    switch (type) {
      case 'quiz_published':
      case 'quiz_reminder':
        if (classId && quizId) return ROUTES.student.quizSession(classId, quizId)
        if (classId) return ROUTES.student.coursesWithClass(classId)
        return ROUTES.student.courses
      case 'game_published':
      case 'content_published':
      case 'announcement_published':
        if (classId) return ROUTES.student.coursesWithClass(classId)
        return ROUTES.student.courses
      default:
        return null
    }
  }

  if (role === 'Instructor') {
    switch (type) {
      case 'student_joined':
        if (classId) return ROUTES.instructor.classManage(classId)
        return ROUTES.instructor.classes
      case 'quiz_completed':
      case 'quiz_failed':
        return ROUTES.instructor.performance
      default:
        return null
    }
  }

  return null
}
