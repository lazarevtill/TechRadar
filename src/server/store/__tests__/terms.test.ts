import { describe, it, expect } from 'vitest'
import { extractTerms } from '../terms'

const keys = (title: string) =>
  extractTerms(title)
    .map((t) => t.key)
    .sort()

describe('extractTerms', () => {
  it('finds model and product names', () => {
    expect(keys('Qwen3.5 beats GPT-6 on LoRA fine-tuning')).toEqual(
      expect.arrayContaining(['qwen3.5', 'gpt-6', 'lora']),
    )
    expect(keys('WorldCrafter: Consistent Video World Model')).toEqual(
      expect.arrayContaining([
        'worldcrafter',
        'consistent video',
        'video world',
      ]),
    )
  })
  it('skips numbers, years, common acronyms and stop-word phrases', () => {
    const k = keys('The 2026 AI report for the USA: 45% of CEO say yes')
    for (const bad of ['2026', 'ai', 'usa', 'ceo', '45%', 'the ai', 'for the'])
      expect(k).not.toContain(bad)
  })
  it('keeps the readable form for display', () => {
    expect(
      extractTerms('vLLM 0.9 released').find((t) => t.key === 'vllm')?.display,
    ).toBe('vLLM')
  })
})

describe('itemTerms', () => {
  it('adds names from the summary, not word pairs', async () => {
    const { itemTerms } = await import('../terms')
    const keys = itemTerms(
      'A faster attention kernel',
      'We compare against FlashAttention3 and vLLM on long sequences.',
    ).map((t) => t.key)
    expect(keys).toContain('flashattention3')
    expect(keys).toContain('vllm')
    expect(keys).toContain('attention kernel') // title pair
    expect(keys).not.toContain('long sequences') // summary pair
  })
})
