/**
 * Per-model request shape for the digest pipeline.
 *
 * Haiku 4.5 and Sonnet 5 are not drop-in equivalents: Haiku rejects
 * `output_config.effort` and has no adaptive thinking, while Sonnet 5 runs
 * adaptive thinking whenever `thinking` is omitted — and `max_tokens` is a
 * ceiling on thinking *plus* answer, so a Haiku-sized budget would truncate.
 * Keeping those differences here makes switching models a one-line change.
 */
export type ModelProfile = {
  model: string
  maxTokens: number
  /** Omitted for models without adaptive thinking (Haiku 4.5). */
  thinking?: { type: 'adaptive' }
  /** Omitted for models that reject it — `effort` errors on Haiku 4.5. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  // $1/$5 per MTok. ~$1.30/month at 10 posts/day.
  'claude-haiku-4-5': {
    model: 'claude-haiku-4-5',
    maxTokens: 2048,
  },
  // $2/$10 per MTok. ~$6/month. Adaptive thinking is on unless disabled, and
  // the newer tokenizer produces ~30% more tokens, hence the larger budget.
  'claude-sonnet-5': {
    model: 'claude-sonnet-5',
    maxTokens: 4096,
    thinking: { type: 'adaptive' },
    effort: 'low',
  },
}

/**
 * Chosen 2026-09-18 by A/B over 8 live posts (scripts/generate-feed/compare-models.ts).
 * Both models produced valid output with zero failures, but Haiku's Russian was
 * full of transliterated calques ("компакт-суммаризацию", "гайдлайны
 * безопасности", "кастомизированными процессами") — exactly what the prompt's
 * "natural Russian, not a literal translation" rule exists to prevent. Sonnet
 * read as native and used *fewer* output tokens (4360 vs 5212), so the real
 * cost gap is ~1.8x, not the ~4x the list prices suggest: roughly $3/month
 * against $1.70. Switch back by changing this one line.
 */
export const DEFAULT_MODEL = 'claude-sonnet-5'

/** Resolve the profile for DIGEST_MODEL, failing fast on a typo. */
export function resolveProfile(
  id: string = process.env.DIGEST_MODEL ?? DEFAULT_MODEL,
): ModelProfile {
  const profile = MODEL_PROFILES[id]
  if (!profile) {
    throw new Error(
      `Unknown DIGEST_MODEL "${id}". Known: ${Object.keys(MODEL_PROFILES).join(', ')}`,
    )
  }
  return profile
}
