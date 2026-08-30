/** One date format for the whole app: dd-mm-yyyy (decision 2026-08-30).
 * Native date inputs follow the device's own locale and are left alone.
 * File names use it too; a folder of reports sorts by Date Created. */

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** For file names: same format, so a report is named the way its date reads. */
export function fileStamp(d = new Date()): string {
  return fmtDate(d)
}
