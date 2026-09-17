import { describe, it, expect } from 'vitest'
import { tagTopics, snapshotFromTexts, collectTopicSignals } from '../topics'

describe('tagTopics', () => {
  it('tags known topics', () => {
    expect(tagTopics('a new LLM agent framework')).toContain('llm-agents')
    expect(tagTopics('post-quantum cryptography')).toContain('post-quantum')
  })
  it('returns [] when nothing matches', () => {
    expect(tagTopics('an unrelated cooking blog')).toEqual([])
  })
  it('does not tag on substring-only matches (word boundaries)', () => {
    expect(tagTopics('We upgraded our storage backend')).not.toContain('rag')
    expect(tagTopics('The dragon flew over')).not.toContain('rag')
  })
  it('still tags real RAG mentions', () => {
    expect(tagTopics('a new RAG pipeline')).toContain('rag')
    expect(tagTopics('retrieval augmented generation')).toContain('rag')
  })
})

describe('snapshotFromTexts', () => {
  it('counts topic occurrences per day', () => {
    const snap = snapshotFromTexts(
      ['llm agent', 'llm agent tools'],
      '2026-06-15',
    )
    expect(snap.date).toBe('2026-06-15')
    expect(snap.topics['llm-agents']).toBe(2)
  })
})

describe('collectTopicSignals', () => {
  it('groups matching posts under each topic and caps per topic', () => {
    const posts = [
      {
        title: 'A new LLM agent framework',
        url: 'https://ex.com/a',
        source: 'anthropic',
        publishedAt: '2026-06-03T00:00:00Z',
        contentText: '',
      },
      {
        title: 'More on llm agents',
        url: 'https://ex.com/b',
        source: 'openai',
        publishedAt: '2026-06-05T00:00:00Z',
        contentText: 'tool use',
      },
      {
        title: 'A cooking blog',
        url: 'https://ex.com/c',
        source: 'meta',
        publishedAt: '2026-06-04T00:00:00Z',
        contentText: '',
      },
    ]
    const map = collectTopicSignals(posts, 5)
    expect(map['llm-agents'].map((s) => s.url)).toEqual([
      'https://ex.com/b',
      'https://ex.com/a',
    ]) // newest first
    expect(map['llm-agents']).toHaveLength(2)
    expect(map['cooking']).toBeUndefined()
  })
  it('caps at maxPerTopic', () => {
    const posts = Array.from({ length: 8 }, (_, i) => ({
      title: 'llm agent ' + i,
      url: 'u' + i,
      source: 'hf',
      publishedAt: '2026-06-0' + (i % 9) + 'T00:00:00Z',
    }))
    expect(collectTopicSignals(posts, 3)['llm-agents']).toHaveLength(3)
  })
})
