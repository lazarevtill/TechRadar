import { describe, it, expect } from 'vitest'
import { reportCacheId, savedReportFor } from '../report-cache.js'

describe('saved weekly report', () => {
  it('is used only for the same server and the same watch terms', () => {
    const saved = {
      id: reportCacheId('http://localhost:3000', ['Mamba', 'GRPO']),
      at: 1,
      report: { topics: [] },
    }
    expect(
      savedReportFor(saved, 'http://localhost:3000', ['grpo', 'mamba']),
    ).toBe(saved)
    expect(savedReportFor(saved, 'http://other:3000', ['Mamba', 'GRPO'])).toBe(
      null,
    )
    expect(savedReportFor(saved, 'http://localhost:3000', ['Mamba'])).toBe(null)
    expect(savedReportFor(undefined, 'x', [])).toBe(null)
  })
})
