import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { historyDb } from '@/server/store/db'
import { recordItems } from '@/server/store/history'
import { weeklyReport } from '@/server/store/report'
import { getWeeklyReport } from '../report'

process.env.HISTORY_DB = join(
  mkdtempSync(join(tmpdir(), 'radar-report-')),
  'history.db',
)

const DAY = '2026-10-12'
const at = (hh: string) => Date.parse(`${DAY}T${hh}:00Z`)

const item = (id: string, title: string) => ({
  id,
  source: 'hackernews' as const,
  title,
  sourceUrl: `https://a.dev/${id}`,
  summary: '',
  category: 'ai',
  maturityStage: 'research',
  publishedAt: new Date(`${DAY}T00:00:00Z`),
  engagement: 1,
})

describe('getWeeklyReport', () => {
  it('matches weeklyReport, reusing the shared part across watch terms', async () => {
    const db = await historyDb()
    recordItems(
      db,
      [item('hn-1', 'Mamba-3 benchmarks')],
      DAY,
      `${DAY}T08:00:00Z`,
    )

    const first = await getWeeklyReport(['Mamba'], at('09:00'))
    expect(first.ok && first.report).toEqual(weeklyReport(db, DAY, ['Mamba']))

    // A new item arrives; within five minutes another reader asks with other
    // terms. Their terms are answered from the live store, the shared part
    // (new items this week) comes from the cache instead of a rebuild.
    recordItems(db, [item('hn-2', 'GRPO explained')], DAY, `${DAY}T09:01:00Z`)
    const second = await getWeeklyReport(['GRPO'], at('09:02'))
    expect(second.ok && second.report.newItems).toBe(1)
    expect(second.ok && second.report.watch[0].thisWeek).toBe(1)

    // Five minutes on, the shared part is built again.
    const later = await getWeeklyReport([], at('09:06'))
    expect(later.ok && later.report.newItems).toBe(2)
  })
})
