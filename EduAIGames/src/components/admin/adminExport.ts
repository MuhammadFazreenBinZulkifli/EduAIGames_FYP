import { API_BASE_URL } from '../../config'

export async function downloadAdminExport(adminId: number, type: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/admin/export/${type}`, {
    headers: { 'X-Admin-Id': String(adminId) },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Export failed')
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || `${type}_export.csv`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
