export type ProcessingState<T> =
  | { status: 'idle' }
  | { status: 'processing'; progress: number | null } // null = indeterminate
  | { status: 'done'; result: T }
  | { status: 'failed'; message: string }
