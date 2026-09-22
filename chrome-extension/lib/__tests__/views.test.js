import { describe, it, expect } from 'vitest'
import {
  MAX_PLOTTED,
  hexToRgba,
  matrixCells,
  plottedItems,
  radarLayout,
  timelineLayout,
  topicRows,
} from '../views.js'

const NOW = Date.parse('2026-09-22T12:00:00Z')
const item = (id, category, stage, extra = {}) => ({
  id,
  category,
  maturityStage: stage,
  source: extra.source ?? 'github',
  publishedAt: extra.publishedAt ?? new Date(NOW - 36e5 * 10).toISOString(),
  signal: {
    score: extra.score ?? 0.5,
    reach: extra.reach ?? 0.5,
    reasons: extra.reasons ?? [],
    topics: extra.topics ?? [],
  },
})
const ORDER = ['ai', 'energy', 'biotech']

describe('plottedItems', () => {
  it('keeps highlighted items first, then by score, capped', () => {
    const items = Array.from({ length: MAX_PLOTTED + 50 }, (_, i) =>
      item(`i${i}`, 'ai', 'research', { score: i / 1000 }),
    )
    items.push(item('hl', 'ai', 'research', { score: 0, reasons: ['novel'] }))
    const out = plottedItems(items)
    expect(out).toHaveLength(MAX_PLOTTED)
    expect(out[0].id).toBe('hl')
    expect(out[1].signal.score).toBeGreaterThan(out[2].signal.score)
  })
})

describe('radarLayout', () => {
  it('gives every present category its own sector and keeps dots inside', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => item(`a${i}`, 'ai', 'research')),
      item('e1', 'energy', 'mass-market'),
      item('b1', 'biotech', 'prototype'),
    ]
    const { points, sectors, cx, cy, maxR } = radarLayout(
      items,
      600,
      500,
      ORDER,
    )
    expect(sectors.map((s) => s.category)).toEqual(ORDER)
    const total = sectors.reduce((a, s) => a + (s.end - s.start), 0)
    expect(total).toBeCloseTo(Math.PI * 2)
    // The big category gets the widest sector.
    const span = (c) => sectors.find((s) => s.category === c)
    expect(span('ai').end - span('ai').start).toBeGreaterThan(
      span('energy').end - span('energy').start,
    )
    expect(points).toHaveLength(items.length)
    for (const p of points)
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThanOrEqual(maxR)
    // Mass market sits nearer the centre than research.
    const d = (id) => {
      const p = points.find((q) => q.item.id === id)
      return Math.hypot(p.x - cx, p.y - cy)
    }
    expect(d('e1')).toBeLessThan(d('a0'))
  })

  it('returns nothing when there is no room', () => {
    expect(
      radarLayout([item('a', 'ai', 'research')], 20, 20, ORDER).points,
    ).toEqual([])
  })
})

describe('timelineLayout', () => {
  it('puts newer items to the right and higher scores higher', () => {
    const items = [
      item('new', 'ai', 'research', {
        publishedAt: new Date(NOW - 36e5).toISOString(),
        score: 0.9,
      }),
      item('old', 'ai', 'research', {
        publishedAt: new Date(NOW - 36e5 * 24 * 30).toISOString(),
        score: 0.1,
      }),
      {
        ...item('unscored', 'ai', 'research'),
        signal: { score: null, reasons: [], topics: [] },
      },
    ]
    const { points, unscored, xTicks } = timelineLayout(items, 800, 400, NOW)
    const p = (id) => points.find((q) => q.item.id === id)
    expect(p('new').x).toBeGreaterThan(p('old').x)
    expect(p('new').y).toBeLessThan(p('old').y)
    expect(unscored).toBe(1)
    expect(xTicks.map((t) => t.hours)).toContain(24)
  })
})

describe('matrixCells', () => {
  it('counts items and highlights per category and stage', () => {
    const { rows, max } = matrixCells(
      [
        item('a', 'ai', 'research'),
        item('b', 'ai', 'research', { reasons: ['fast-rising'] }),
        item('c', 'biotech', 'prototype'),
      ],
      ORDER,
    )
    expect(rows.map((r) => r.category)).toEqual(['ai', 'biotech'])
    expect(rows[0].cells[0]).toEqual({
      stage: 'research',
      count: 2,
      highlighted: 1,
    })
    expect(max).toBe(2)
  })
})

describe('topicRows', () => {
  it('counts items and distinct sources per topic, widest spread first', () => {
    const rows = topicRows(
      [
        item('a', 'ai', 'research', { topics: ['rag'], source: 'arxiv' }),
        item('b', 'ai', 'research', {
          topics: ['rag', 'agents'],
          source: 'github',
        }),
        item('c', 'ai', 'research', { topics: ['agents'], source: 'github' }),
        item('d', 'ai', 'research', { topics: ['agents'], source: 'github' }),
      ],
      { rag: 'RAG' },
    )
    expect(rows[0]).toEqual({
      topic: 'rag',
      label: 'RAG',
      items: 2,
      sources: 2,
    })
    expect(rows[1]).toEqual({
      topic: 'agents',
      label: 'agents',
      items: 3,
      sources: 1,
    })
  })
})

describe('hexToRgba', () => {
  it('converts hex colours and tolerates bad input', () => {
    expect(hexToRgba('#c792ea', 0.5)).toBe('rgba(199, 146, 234, 0.5)')
    expect(hexToRgba('nope', 0.2)).toBe('rgba(138, 138, 144, 0.2)')
  })
})
