import { describe, it, expect } from 'vitest'
import {
  summarizePost,
  DigestItemSchema,
  extractJsonObject,
} from '../summarize'

const fakeClient = {
  create: async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          category: 'ai',
          en: {
            headline: 'Why it matters: context is a budget',
            tweets: ['a', 'b', 'c'],
          },
          ru: {
            headline: 'Почему важно: контекст — это бюджет',
            tweets: ['а', 'б', 'в'],
          },
        }),
      },
    ],
  }),
}

describe('summarizePost', () => {
  it('returns validated EN+RU blocks with exactly 3 tweets', async () => {
    const r = await summarizePost(
      {
        source: 'anthropic',
        title: 'T',
        url: 'u',
        publishedAt: '2026-06-01T00:00:00Z',
        contentText: 'body',
      },
      fakeClient as any,
    )
    expect(r.en.tweets).toHaveLength(3)
    expect(r.ru.headline).toContain('Почему')
    expect(r.category).toBe('ai')
  })
  it('DigestItemSchema rejects wrong tweet count', () => {
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

describe('extractJsonObject', () => {
  it('strips ```json fences', () => {
    expect(JSON.parse(extractJsonObject('```json\n{"a":1}\n```'))).toEqual({
      a: 1,
    })
  })
  it('strips bare ``` fences and trims prose', () => {
    expect(JSON.parse(extractJsonObject('```\n{"b":2}\n```'))).toEqual({ b: 2 })
  })
  it('passes through plain json', () => {
    expect(JSON.parse(extractJsonObject('{"c":3}'))).toEqual({ c: 3 })
  })
})

describe('summarizePost with fenced output', () => {
  it('parses a fenced Claude response', async () => {
    const fencedClient = {
      create: async () => ({
        content: [
          {
            type: 'text',
            text:
              '```json\n' +
              JSON.stringify({
                category: 'ai',
                en: { headline: 'h', tweets: ['a', 'b', 'c'] },
                ru: { headline: 'h', tweets: ['а', 'б', 'в'] },
              }) +
              '\n```',
          },
        ],
      }),
    }
    const r = await summarizePost(
      {
        source: 'x',
        title: 't',
        url: 'u',
        publishedAt: '2026-01-01T00:00:00Z',
        contentText: 'c',
      },
      fencedClient as any,
    )
    expect(r.en.tweets).toHaveLength(3)
    expect(r.category).toBe('ai')
  })
})
