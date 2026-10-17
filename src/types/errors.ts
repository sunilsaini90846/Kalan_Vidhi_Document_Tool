export type AppErrorCode =
  | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'TOO_MANY_FILES' | 'TOTAL_TOO_LARGE'
  | 'UNSUPPORTED_TYPE' | 'TYPE_MISMATCH' | 'DUPLICATE' | 'PROCESSING_FAILED' | 'CANCELLED'

export class AppError extends Error {
  constructor(public readonly code: AppErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
  }
}

/** Safe, user-facing message; never leaks stack traces. */
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message
  return 'Something went wrong while processing this file.'
}
