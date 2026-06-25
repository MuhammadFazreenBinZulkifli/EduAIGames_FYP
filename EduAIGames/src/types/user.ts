export type UserRole = 'Instructor' | 'Student' | 'Admin' | 'SuperAdmin'

export interface User {
  id?: number
  username: string
  email: string
  password?: string
  role: UserRole
  avatarUrl?: string | null
  institution_id?: number | null
  institution_name?: string | null
  plan_name?: string | null
}
