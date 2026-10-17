import { AppError } from '@/types/errors'
import { LIMITS, formatBytes } from '@/utils/limits'
import { detectKind, readHead, type DetectedKind } from './signatures'

export interface ValidationRules {
  /** Detected kinds that are allowed, or 'any' to skip content-type checks (size/empty/duplicate checks still apply). */
  accept: readonly Exclude<DetectedKind, 'unknown'>[] | 'any'
  maxFileBytes?: number
}

export interface ValidatedFile {
  file: File
  kind: DetectedKind
}

/** Validates size, non-emptiness and real content type (by signature). Throws AppError. */
export async function validateFile(file: File, rules: ValidationRules): Promise<ValidatedFile> {
  const max = rules.maxFileBytes ?? LIMITS.maxFileBytes
  if (file.size === 0) throw new AppError('EMPTY_FILE', `"${file.name}" is empty.`)
  if (file.size > max) {
    throw new AppError('FILE_TOO_LARGE', `"${file.name}" is ${formatBytes(file.size)}; the limit is ${formatBytes(max)}.`)
  }
  const kind = detectKind(await readHead(file))
  if (rules.accept !== 'any' && (kind === 'unknown' || !rules.accept.includes(kind))) {
    throw new AppError('UNSUPPORTED_TYPE', `"${file.name}" is not a supported file type (accepted: ${(rules.accept as readonly string[]).join(', ')}).`)
  }
  return { file, kind }
}

export interface BatchResult {
  accepted: ValidatedFile[]
  rejected: { file: File; error: AppError }[]
}

const fingerprint = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

/** Validates a batch against existing selection: duplicates, count and total-size caps. */
export async function validateBatch(
  incoming: File[],
  existing: File[],
  rules: ValidationRules,
): Promise<BatchResult> {
  const accepted: ValidatedFile[] = []
  const rejected: BatchResult['rejected'] = []
  const seen = new Set(existing.map(fingerprint))
  let count = existing.length
  let total = existing.reduce((s, f) => s + f.size, 0)

  for (const file of incoming) {
    try {
      if (seen.has(fingerprint(file))) throw new AppError('DUPLICATE', `"${file.name}" is already selected.`)
      if (count >= LIMITS.maxFiles) throw new AppError('TOO_MANY_FILES', `You can select up to ${LIMITS.maxFiles} files.`)
      if (total + file.size > LIMITS.maxTotalBytes) {
        throw new AppError('TOTAL_TOO_LARGE', `Total size would exceed ${formatBytes(LIMITS.maxTotalBytes)}.`)
      }
      accepted.push(await validateFile(file, rules))
      seen.add(fingerprint(file)); count++; total += file.size
    } catch (e) {
      rejected.push({ file, error: e instanceof AppError ? e : new AppError('PROCESSING_FAILED', 'Could not read this file.') })
    }
  }
  return { accepted, rejected }
}
