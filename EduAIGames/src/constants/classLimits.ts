export const CLASS_DESCRIPTION_MAX_LENGTH = 250

export function truncateClassDescription(text: string, max = CLASS_DESCRIPTION_MAX_LENGTH): string {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max)}…`
}
