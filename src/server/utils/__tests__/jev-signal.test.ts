import { describe, it, expect, vi } from 'vitest'
import { buildSignalRequest, judgeSignals, NOVELTY_LEVELS } from '../jev-signal'
import { TOPIC_LABELS } from '@/lib/trend-topics'

describe('buildSignalRequest', () => {
  it('batches novelty, substance and one noul per tracked topic', () => {
    const req = buildSignalRequest({
      id: 'gh-1',
      title: 'org/repo',
      summary: 'a'.repeat(2000),
      evidence: { github_topics: ['agents'] },
    })
    expect(req.state.title).toBe('org/repo')
    expect(req.state.summary).toHaveLength(1200)
    expect(req.questions.novelty.type).toBe('score')
    expect(req.questions.novelty.criteria).toHaveLength(NOVELTY_LEVELS.length)
    expect(req.questions.substance.type).toBe('noul')
    const topicKeys = Object.keys(req.questions)
      .filter((k) => k.startsWith('topic:'))
      .map((k) => k.slice('topic:'.length))
      .sort()
    expect(topicKeys).toEqual(Object.keys(TOPIC_LABELS).sort())
  })
})

describe('judgeSignals', () => {
  it('returns judgments per id and null for failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ask = vi.fn(async (input: { id: string }) => {
      if (input.id === 'bad') throw new Error('529')
      return { novelty: 0.7, substance: 0.9, topics: ['fusion'] }
    })
    const out = await judgeSignals(
      [
        { id: 'good', title: 'x' },
        { id: 'bad', title: 'y' },
      ],
      ask,
    )
    expect(out.get('good')).toEqual({
      novelty: 0.7,
      substance: 0.9,
      topics: ['fusion'],
    })
    expect(out.get('bad')).toBeNull()
  })

  it('caches successes only', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = vi.fn(async () => ({ novelty: 0.1, substance: 0.5, topics: [] }))
    await judgeSignals([{ id: 'sig-cache', title: 't' }], ok)
    await judgeSignals([{ id: 'sig-cache', title: 't' }], ok)
    expect(ok).toHaveBeenCalledTimes(1)

    const flaky = vi
      .fn<
        () => Promise<{ novelty: number; substance: number; topics: string[] }>
      >()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ novelty: 0.9, substance: 0.9, topics: [] })
    await judgeSignals([{ id: 'sig-flaky', title: 't' }], flaky)
    const second = await judgeSignals([{ id: 'sig-flaky', title: 't' }], flaky)
    expect(flaky).toHaveBeenCalledTimes(2)
    expect(second.get('sig-flaky')?.novelty).toBe(0.9)
  })
})
