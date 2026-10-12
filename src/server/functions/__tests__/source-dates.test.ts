import { describe, expect, it } from 'vitest'
import { parseHALSubmittedDate, withinBudget } from '../tech-feed'
import { openDb } from '@/server/store/db'
import { recordSourceRuns, sourceHealth } from '@/server/store/ops'

function item(id: string, date: Date) {
  return {
    id,
    title: id,
    summary: 'Fixture',
    source: 'hal' as const,
    sourceUrl: `https://hal.science/${id}`,
    category: 'uncategorized' as const,
    maturityStage: 'research' as const,
    originalLanguage: 'en' as const,
    publishedAt: date,
    engagement: null,
    engagementUnit: null,
    jev: { id, title: id },
  }
}

describe('HAL submission timestamps', () => {
  it.each([
    ['2026-09-30 12:30:00', '2026-09-30T12:30:00.000Z'],
    ['2026-09-30T12:30:00Z', '2026-09-30T12:30:00.000Z'],
    ['2026-09-30T12:30:00.123Z', '2026-09-30T12:30:00.123Z'],
    ['2026-09-30T12:30:00+02:00', '2026-09-30T10:30:00.000Z'],
    ['2026-09-30T12:30:00', '2026-09-30T12:30:00.000Z'],
  ])('parses %s without adding a second timezone', (input, expected) => {
    expect(parseHALSubmittedDate(input).toISOString()).toBe(expected)
  })
})

describe('source date isolation', () => {
  it('keeps valid items from mixed responses and records degradation', async () => {
    const valid = item('valid', new Date('2026-09-30T12:30:00Z'))
    const run = await withinBudget('hal', async () => [
      valid,
      item('invalid', new Date('bad date')),
    ])
    expect(run.items).toEqual([valid])
    expect(run.error).toBe('invalid publication dates: discarded 1 of 2 items')
    expect(() =>
      run.items.map((i) => i.publishedAt.toISOString()),
    ).not.toThrow()
    const db = await openDb(':memory:')
    recordSourceRuns(
      db,
      [{ ...run, items: run.items.length }],
      '2026-09-30T13:00:00Z',
    )
    expect(sourceHealth(db, '2026-09-30', ['hal'])[0]).toMatchObject({
      status: 'degraded',
      lastItems: 1,
      lastError: run.error,
    })
    db.close()
  })

  it('reports an all-invalid source and preserves independently fetched sources', async () => {
    const runs = await Promise.all([
      withinBudget('hal', async () => [item('invalid', new Date(NaN))]),
      withinBudget('github', async () => [
        { ...item('valid', new Date('2026-09-30')), source: 'github' as const },
      ]),
    ])
    expect(runs[0].items).toEqual([])
    expect(runs[0].error).toBe(
      'invalid publication dates: discarded 1 of 1 items',
    )
    expect(runs.flatMap((r) => r.items).map((i) => i.id)).toEqual(['valid'])
    const db = await openDb(':memory:')
    for (const hour of ['13', '14', '15']) {
      recordSourceRuns(
        db,
        [{ ...runs[0], items: 0 }],
        `2026-09-30T${hour}:00:00Z`,
      )
    }
    expect(sourceHealth(db, '2026-09-30', ['hal'])[0]).toMatchObject({
      status: 'down',
      lastItems: 0,
      lastError: runs[0].error,
    })
    db.close()
  })
})
