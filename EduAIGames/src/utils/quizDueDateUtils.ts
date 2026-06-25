/** Format a Date as a datetime-local input value (local timezone). */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse an ISO/API timestamp into a datetime-local string (local timezone). */
export function isoToDatetimeLocal(iso: string): string {
  return toDatetimeLocalValue(new Date(iso))
}

/** Convert datetime-local value to ISO string for the API. */
export function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString()
}

function setEndOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 0, 0)
  return out
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export type DueDatePresetId = 'tomorrow' | '3days' | 'friday' | 'monday'

export const DUE_DATE_PRESETS: Array<{ id: DueDatePresetId; label: string }> = [
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: '3days', label: 'In 3 days' },
  { id: 'friday', label: 'This Friday' },
  { id: 'monday', label: 'Next Monday' },
]

export function getPresetDatetimeLocal(id: DueDatePresetId): string {
  const now = new Date()
  switch (id) {
    case 'tomorrow':
      return toDatetimeLocalValue(setEndOfDay(addDays(now, 1)))
    case '3days':
      return toDatetimeLocalValue(setEndOfDay(addDays(now, 3)))
    case 'friday': {
      const d = new Date(now)
      const day = d.getDay()
      let add = (5 - day + 7) % 7
      if (add === 0 && d.getHours() >= 23 && d.getMinutes() >= 59) add = 7
      d.setDate(d.getDate() + add)
      return toDatetimeLocalValue(setEndOfDay(d))
    }
    case 'monday': {
      const d = new Date(now)
      const day = d.getDay()
      let add = (1 - day + 7) % 7
      if (add === 0) add = 7
      d.setDate(d.getDate() + add)
      return toDatetimeLocalValue(setEndOfDay(d))
    }
  }
}

export interface DueDatePreview {
  formatted: string
  relative: string
  isPast: boolean
}

export function getDueDatePreview(localValue: string): DueDatePreview | null {
  if (!localValue.trim()) return null
  const due = new Date(localValue)
  if (Number.isNaN(due.getTime())) return null

  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const formatted = due.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  let relative: string
  if (diffMs < 0) relative = 'Already past due'
  else if (diffDays <= 1) relative = 'Due within 24 hours'
  else if (diffDays <= 7) relative = `In ${diffDays} days`
  else relative = `In ${Math.ceil(diffDays / 7)} week${Math.ceil(diffDays / 7) !== 1 ? 's' : ''}`

  return { formatted, relative, isPast: diffMs < 0 }
}

/** Split datetime-local into date and time parts for separate inputs. */
export function splitDatetimeLocal(value: string): { date: string; time: string } {
  if (!value.includes('T')) return { date: '', time: '23:59' }
  const [date, time] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

export function joinDatetimeLocal(date: string, time: string): string {
  if (!date) return ''
  return `${date}T${time || '23:59'}`
}

export function isEndOfDayTime(time: string): boolean {
  return time === '23:59' || time === '23:59:00'
}
