import { describe, it, expect, vi } from 'vitest'
import {
  AREA_CRITERIA,
  buildCategoryRequest,
  categorizeItems,
} from '../jev-categorize'
import { CATEGORY_CONFIG } from '@/lib/tech-categories'

describe('buildCategoryRequest', () => {
  it('asks one choice over every radar area plus none', () => {
    const req = buildCategoryRequest({
      id: 'gh-1',
      title: 'org/repo',
      summary: 'A wallet',
      evidence: { github_topics: ['ai'] },
    })
    expect(req.state).toEqual({
      title: 'org/repo',
      summary: 'A wallet',
      evidence: { github_topics: ['ai'] },
    })
    expect(req.questions.area.type).toBe('choice')
    const options = Object.keys(req.questions.area.criteria).sort()
    const areas = Object.keys(CATEGORY_CONFIG)
      .filter((c) => c !== 'uncategorized')
      .concat('none')
      .sort()
    expect(options).toEqual(areas)
    expect(Object.keys(AREA_CRITERIA).sort()).toEqual(areas)
  })

  it('truncates long summaries', () => {
    const req = buildCategoryRequest({
      id: 'x',
      title: 't',
      summary: 'a'.repeat(5000),
    })
    expect(req.state.summary).toHaveLength(1200)
  })
})

describe('categorizeItems', () => {
  it('maps verdicts per id, including none', async () => {
    const ask = vi.fn(async (input: { id: string }) =>
      input.id === 'cat-a' ? ('quantum' as const) : ('none' as const),
    )
    const verdicts = await categorizeItems(
      [
        { id: 'cat-a', title: 'qubits' },
        { id: 'cat-b', title: 'a cooking blog' },
      ],
      ask,
    )
    expect(verdicts.get('cat-a')).toBe('quantum')
    expect(verdicts.get('cat-b')).toBe('none')
  })

  it('marks failed items uncategorized instead of guessing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const verdicts = await categorizeItems(
      [{ id: 'fail-a', title: 'x' }],
      async () => {
        throw new Error('529 overloaded')
      },
    )
    expect(verdicts.get('fail-a')).toBe('uncategorized')
  })

  it('caches successful verdicts but not failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = vi.fn(async () => 'space' as const)
    await categorizeItems([{ id: 'cache-ok', title: 'rocket' }], ok)
    await categorizeItems([{ id: 'cache-ok', title: 'rocket' }], ok)
    expect(ok).toHaveBeenCalledTimes(1)

    const flaky = vi
      .fn<() => Promise<'ai'>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('ai')
    await categorizeItems([{ id: 'cache-fail', title: 'llm' }], flaky)
    const second = await categorizeItems(
      [{ id: 'cache-fail', title: 'llm' }],
      flaky,
    )
    expect(flaky).toHaveBeenCalledTimes(2)
    expect(second.get('cache-fail')).toBe('ai')
  })
})
