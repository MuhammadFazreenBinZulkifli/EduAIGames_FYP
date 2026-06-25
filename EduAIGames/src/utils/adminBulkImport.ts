import * as XLSX from 'xlsx'

export interface ParsedImportRow {
  username: string
  email: string
  password: string
  role: string
}

function pickField(row: Record<string, string>, ...names: string[]): string {
  const map: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    map[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(v ?? '').trim()
  }
  for (const name of names) {
    const key = name.toLowerCase().replace(/\s+/g, '_')
    if (map[key]) return map[key]
  }
  return ''
}

function normalizeRow(raw: Record<string, string>): ParsedImportRow | null {
  const username = pickField(raw, 'full_name', 'fullname', 'username', 'user', 'name')
  const email = pickField(raw, 'email', 'e-mail')
  const password = pickField(raw, 'password', 'pass')
  const role = pickField(raw, 'role', 'type', 'user_role')
  if (!username && !email && !password && !role) return null
  return { username, email, password, role }
}

export function parseSpreadsheetFile(file: File): Promise<ParsedImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result
        if (!buffer) {
          reject(new Error('Empty file'))
          return
        }
        const wb = XLSX.read(buffer, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) {
          reject(new Error('No sheet found in file'))
          return
        }
        const sheet = wb.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
        const rows = json.map(normalizeRow).filter((r): r is ParsedImportRow => r !== null)
        if (rows.length === 0) {
          reject(new Error('No data rows found. Use columns: full_name, email, password, role'))
          return
        }
        resolve(rows)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse spreadsheet'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export function downloadImportTemplate() {
  const header = 'full_name,email,password,role'
  const sample = [
    'Jane Student,jane@school.edu,TempPass123,Student',
    'John Instructor,john@school.edu,TempPass123,Instructor',
  ]
  const csv = [header, ...sample].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'user_import_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
