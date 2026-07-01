import type { BreadcrumbItem } from '../components/PanelBreadcrumbs'
import { ROUTES } from '../routes/paths'

export const STUDENT_NAV = {
  enrolledClasses: 'Enrolled Classes',
  joinClass: 'Join Class',
  classContent: 'Class Content',
  pendingQuizzes: 'Pending Quizzes',
  myGrades: 'My Grades',
  studyCoach: 'AI Study Coach',
} as const

export const INSTRUCTOR_NAV = {
  myClasses: 'My Classes',
  library: 'Library',
  contentMaker: 'Content Maker',
  performance: 'Student Performance',
} as const

export function studentDashboardCrumb(): BreadcrumbItem {
  return { label: 'Dashboard', to: ROUTES.student.dashboard }
}

export function instructorDashboardCrumb(): BreadcrumbItem {
  return { label: 'Dashboard', to: ROUTES.instructor.dashboard }
}

export function studentClassContentCrumb(classId?: number | null, classTitle?: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    studentDashboardCrumb(),
    { label: STUDENT_NAV.classContent, to: ROUTES.student.courses },
  ]
  if (classId != null && classTitle) {
    items.push({
      label: classTitle,
      to: ROUTES.student.coursesWithClass(classId),
    })
  }
  return items
}

export function studentStudyCoachCrumb(): BreadcrumbItem[] {
  return [
    studentDashboardCrumb(),
    { label: STUDENT_NAV.studyCoach },
  ]
}
