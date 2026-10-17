export type CompressPreset = 'light' | 'balanced' | 'strong'

/** Shared by the PDF and Office optimizers: real settings, not labels. */
export const PRESETS: Record<CompressPreset, { quality: number; maxDimension?: number; label: string }> = {
  light: { quality: 0.85, label: 'Light' },
  balanced: { quality: 0.7, maxDimension: 2000, label: 'Balanced' },
  strong: { quality: 0.5, maxDimension: 1400, label: 'Strong' },
}
