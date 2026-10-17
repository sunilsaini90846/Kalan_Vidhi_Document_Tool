const mb = (n: number) => n * 1024 * 1024

const envNum = (value: string | undefined, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const LIMITS = {
  maxFileBytes: mb(envNum(import.meta.env.VITE_MAX_FILE_MB, 100)),
  maxFiles: envNum(import.meta.env.VITE_MAX_FILES, 50),
  /** Total input bytes across a batch, a guard for low-memory mobile browsers. */
  maxTotalBytes: mb(400),
} as const

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`
}
