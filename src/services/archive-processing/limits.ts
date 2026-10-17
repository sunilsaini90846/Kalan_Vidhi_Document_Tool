const mb = (n: number) => n * 1024 * 1024
export interface ArchiveLimits { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }

/** Caps on what we will inflate in memory; protects against zip bombs and low-memory tabs. */
export const ARCHIVE_LIMITS: ArchiveLimits = { maxEntries: 5000, maxEntryBytes: mb(150), maxTotalBytes: mb(300) }
