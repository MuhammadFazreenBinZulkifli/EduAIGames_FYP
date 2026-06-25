import type { User } from '../types/user'

const BACKUP_KEY = 'super_admin_impersonation_backup'

interface ImpersonationBackup {
  superAdmin: User
  target: User
  startedAt: number
}

export function startImpersonation(superAdmin: User, target: User): void {
  const backup: ImpersonationBackup = {
    superAdmin,
    target,
    startedAt: Date.now(),
  }
  sessionStorage.setItem(BACKUP_KEY, JSON.stringify(backup))
  localStorage.setItem('user', JSON.stringify(target))
}

export function getImpersonationBackup(): ImpersonationBackup | null {
  try {
    const raw = sessionStorage.getItem(BACKUP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ImpersonationBackup
  } catch {
    return null
  }
}

export function isImpersonating(): boolean {
  return getImpersonationBackup() !== null
}

export function endImpersonation(): User | null {
  const backup = getImpersonationBackup()
  if (!backup) return null
  sessionStorage.removeItem(BACKUP_KEY)
  localStorage.setItem('user', JSON.stringify(backup.superAdmin))
  return backup.superAdmin
}
