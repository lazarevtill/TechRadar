import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import {
  summarizePost,
  DigestItemSchema,
  ModelResponseSchema,
  EN_PREFIX,
  RU_PREFIX,
  TWEET_MAX_CHARS,
} from '../summarize'
import { MODEL_PROFILES, resolveProfile } from '../model'

const profile = MODEL_PROFILES['claude-haiku-4-5']

const post = {
  source: 'anthropic',
  title: 'T',
  url: 'u',
  publishedAt: '2026-06-01T00:00:00Z',
  contentText: 'body',
}

const ok = {
  category: 'ai',
  en: { headline: `${EN_PREFIX}context is a budget`, tweets: ['a', 'b', 'c'] },
  ru: {
    headline: `${RU_PREFIX}контекст — это бюджет`,
    tweets: ['а', 'б', 'в'],
  },
}

/**
 * Fakes `messages.create`, not `messages.parse`: the pipeline deliberately
 * avoids `parse`, which throws on malformed output before stop_reason can be
 * read. A fake shaped like `parse` would test a path the SDK never takes.
 */
const clientReturning = (resp: unknown) =>
  ({ messages: { create: async () => resp } }) as unknown as Anthropic

const reply = (body: unknown, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'text', text: JSON.stringify(body) }],
  usage: { input_tokens: 10, output_tokens: 20 },
})

describe('summarizePost', () => {
  it('returns validated EN+RU blocks with exactly 3 tweets', async () => {
    const r = await summarizePost(post, clientReturning(reply(ok)), profile)
    expect(r.en.tweets).toHaveLength(3)
    expect(r.ru.headline).toContain('Почему')
    expect(r.category).toBe('ai')
  })

  it('reports token usage so the daily run is costed', async () => {
    const r = await summarizePost(post, clientReturning(reply(ok)), profile)
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 20 })
  })

  it('throws a named error on refusal', async () => {
    const client = clientReturning({
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    })
    await expect(summarizePost(post, client, profile)).rejects.toThrow(
      /refused \(cyber\)/,
    )
  })

  it('throws a named error on truncation', async () => {
    const client = clientReturning(reply(ok, 'max_tokens'))
    await expect(summarizePost(post, client, profile)).rejects.toThrow(
      /truncated/,
    )
  })

  it('throws when no text block is present', async () => {
    const client = clientReturning({
      stop_reason: 'end_turn',
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    })
    await expect(summarizePost(post, client, profile)).rejects.toThrow(
      /no text block/,
    )
  })

  it('throws when the body is not JSON', async () => {
    const client = clientReturning({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'sorry, I cannot' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    await expect(summarizePost(post, client, profile)).rejects.toThrow(
      /not valid JSON/,
    )
  })

  // The API grammar cannot enforce these — they are why the local schema exists.
  it('rejects a tweet over the character limit', async () => {
    const tooLong = {
      ...ok,
      en: { ...ok.en, tweets: ['a'.repeat(TWEET_MAX_CHARS + 1), 'b', 'c'] },
    }
    await expect(
      summarizePost(post, clientReturning(reply(tooLong)), profile),
    ).rejects.toThrow(/schema mismatch/)
  })

  it('retries once with the validation error and accepts the correction', async () => {
    const tooLong = {
      ...ok,
      en: { ...ok.en, tweets: ['a'.repeat(TWEET_MAX_CHARS + 1), 'b', 'c'] },
    }
    const replies = [reply(tooLong), reply(ok)]
    let seen: unknown[] = []
    const client = {
      messages: {
        create: async (args: { messages: unknown[] }) => {
          seen = args.messages
          return replies.shift()
        },
      },
    } as unknown as Anthropic

    const r = await summarizePost(post, client, profile)
    expect(r.en.tweets[0]).toBe('a')
    // the retry must carry the failed attempt plus the complaint
    expect(seen).toHaveLength(3)
    expect(JSON.stringify(seen[2])).toContain('failed validation')
    // usage is summed across both calls
    expect(r.usage.inputTokens).toBe(20)
  })

  it('gives up after a second failure', async () => {
    const bad = {
      ...ok,
      en: { ...ok.en, tweets: ['a'.repeat(TWEET_MAX_CHARS + 1), 'b', 'c'] },
    }
    const client = clientReturning(reply(bad))
    await expect(summarizePost(post, client, profile)).rejects.toThrow(
      /schema mismatch after retry/,
    )
  })

  it('rejects a headline missing its required prefix', async () => {
    const noPrefix = { ...ok, ru: { ...ok.ru, headline: 'Контекст — бюджет' } }
    await expect(
      summarizePost(post, clientReturning(reply(noPrefix)), profile),
    ).rejects.toThrow(/schema mismatch/)
  })

  it('rejects a category outside the allowed set', async () => {
    const badCategory = { ...ok, category: 'blockchain' }
    await expect(
      summarizePost(post, clientReturning(reply(badCategory)), profile),
    ).rejects.toThrow(/schema mismatch/)
  })
})

describe('ModelResponseSchema', () => {
  it('requires exactly three tweets', () => {
    const two = { ...ok, en: { ...ok.en, tweets: ['1', '2'] } }
    expect(ModelResponseSchema.safeParse(two).success).toBe(false)
  })
})

describe('DigestItemSchema', () => {
  it('rejects wrong tweet count', () => {
    const bad = {
      id: 'x',
      source: 'a',
      sourceUrl: 'u',
      publishedAt: '2026-01-01T00:00:00Z',
      category: 'ai',
      en: { headline: 'h', tweets: ['1', '2'] },
      ru: { headline: 'h', tweets: ['1', '2', '3'] },
    }
    expect(DigestItemSchema.safeParse(bad).success).toBe(false)
  })
})

describe('resolveProfile', () => {
  it('resolves a known model', () => {
    expect(resolveProfile('claude-sonnet-5').model).toBe('claude-sonnet-5')
  })

  it('fails fast on a typo rather than silently using a default', () => {
    expect(() => resolveProfile('claude-hiaku-4-5')).toThrow(
      /Unknown DIGEST_MODEL/,
    )
  })

  it('gives sonnet room for adaptive thinking', () => {
    const sonnet = MODEL_PROFILES['claude-sonnet-5']
    const haiku = MODEL_PROFILES['claude-haiku-4-5']
    expect(sonnet.thinking).toEqual({ type: 'adaptive' })
    expect(sonnet.maxTokens).toBeGreaterThan(haiku.maxTokens)
    // effort errors on Haiku 4.5 — it must not be sent.
    expect(haiku.effort).toBeUndefined()
  })
})
