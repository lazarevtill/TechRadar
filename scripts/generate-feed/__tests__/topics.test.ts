import { describe, it, expect, vi } from 'vitest'
import {
  TOPIC_LABELS,
  TOPIC_THRESHOLD,
  buildTopicRequest,
  createTopicAsker,
  tagPosts,
  snapshotFromTags,
  collectTopicSignals,
} from '../topics'

describe('buildTopicRequest', () => {
  it('asks one noul per tracked topic over title and truncated content', () => {
    const req = buildTopicRequest({
      title: 'A new agent framework',
      contentText: 'x'.repeat(10_000),
    })
    expect(req.state.title).toBe('A new agent framework')
    expect(req.state.content).toHaveLength(6000)
    expect(Object.keys(req.questions).sort()).toEqual(
      Object.keys(TOPIC_LABELS).sort(),
    )
    for (const q of Object.values(req.questions)) expect(q.type).toBe('noul')
  })
})

describe('createTopicAsker', () => {
  it('fails fast without TYPESAFE_API_KEY', () => {
    expect(() => createTopicAsker({})).toThrow(/TYPESAFE_API_KEY/)
  })
})

describe('tagPosts', () => {
  it('keeps topics at or above the threshold, in input order', async () => {
    const ask = vi.fn(
      async (p: { title: string }): Promise<Record<string, number>> =>
        p.title === 'agents'
          ? { 'llm-agents': 0.9, rag: TOPIC_THRESHOLD }
          : { 'llm-agents': 0.1, fusion: 0.49 },
    )
    const tags = await tagPosts([{ title: 'agents' }, { title: 'other' }], ask)
    expect(tags).toEqual([['llm-agents', 'rag'], []])
  })

  it('propagates a failed request rather than publishing partial trends', async () => {
    await expect(
      tagPosts([{ title: 'a' }], async () => {
        throw new Error('401')
      }),
    ).rejects.toThrow('401')
  })
})

describe('snapshotFromTags', () => {
  it('counts topic occurrences per day', () => {
    const snap = snapshotFromTags(
      [['llm-agents'], ['llm-agents', 'rag'], []],
      '2026-06-15',
    )
    expect(snap).toEqual({
      date: '2026-06-15',
      topics: { 'llm-agents': 2, rag: 1 },
    })
  })
})

describe('collectTopicSignals', () => {
  const post = (url: string, publishedAt: string) => ({
    title: url,
    url,
    source: 'hf',
    publishedAt,
  })

  it('groups tagged posts under each topic, newest first', () => {
    const posts = [
      post('a', '2026-06-03T00:00:00Z'),
      post('b', '2026-06-05T00:00:00Z'),
      post('c', '2026-06-04T00:00:00Z'),
    ]
    const map = collectTopicSignals(posts, [['llm-agents'], ['llm-agents'], []])
    expect(map['llm-agents'].map((s) => s.url)).toEqual(['b', 'a'])
    expect(Object.keys(map)).toEqual(['llm-agents'])
  })

  it('caps at maxPerTopic', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      post('u' + i, `2026-06-0${i + 1}T00:00:00Z`),
    )
    const tags = posts.map(() => ['llm-agents'])
    expect(collectTopicSignals(posts, tags, 3)['llm-agents']).toHaveLength(3)
  })
})
