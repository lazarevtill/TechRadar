import { seededJitter } from './jitter.js'

/**
 * Pure layout math for the chart views (no DOM, unit-tested). Each canvas
 * layout returns points as { x, y, r, item } in CSS pixels, which app.js
 * draws and hit-tests the same way for every view.
 */

export const VIEWS = ['radar', 'timeline', 'matrix', 'topics']
export const MATURITY_ORDER = [
  'research',
  'prototype',
  'early-adopter',
  'mass-market',
]
/** Canvas views stay readable with this many dots; the rest are listed as "top N". */
export const MAX_PLOTTED = 200

const hasReasons = (item) => (item.signal?.reasons?.length ?? 0) > 0

/** Highest-signal items first; highlighted ones always make the cut. */
export function plottedItems(items, max = MAX_PLOTTED) {
  const ranked = [...items].sort(
    (a, b) =>
      hasReasons(b) - hasReasons(a) ||
      (b.signal?.score ?? -1) - (a.signal?.score ?? -1),
  )
  return ranked.slice(0, max)
}

/** Dot radius from within-source reach; unmeasured items get the minimum. */
export function dotRadius(item) {
  const reach = item.signal?.reach
  return reach === null || reach === undefined ? 3 : 3.5 + reach * 5.5
}

/**
 * Radar: rings are maturity (mass market in the centre), and every category
 * owns an angular sector sized by its share of items (with a floor so small
 * categories stay visible). Position therefore means something: which area,
 * how mature.
 */
export function radarLayout(items, width, height, categoryOrder) {
  const cx = width / 2
  const cy = height / 2
  const maxR = Math.min(width, height) / 2 - 28
  if (maxR <= 0) return { points: [], sectors: [], rings: [], cx, cy, maxR }

  const rings = [...MATURITY_ORDER].reverse() // centre → edge
  const ringBand = maxR / rings.length
  const present = categoryOrder.filter((c) =>
    items.some((i) => i.category === c),
  )
  const minShare = 0.04
  const weights = present.map((c) =>
    Math.max(
      items.filter((i) => i.category === c).length / items.length,
      minShare,
    ),
  )
  const total = weights.reduce((a, b) => a + b, 0) || 1

  let start = -Math.PI / 2
  const sectors = present.map((category, k) => {
    const span = (weights[k] / total) * Math.PI * 2
    const sector = { category, start, end: start + span }
    start += span
    return sector
  })

  const points = []
  for (const sector of sectors) {
    const inSector = items.filter((i) => i.category === sector.category)
    for (const [ringIndex, stage] of rings.entries()) {
      const group = inSector
        .filter((i) => i.maturityStage === stage)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
      const inner = ringIndex * ringBand
      group.forEach((item, n) => {
        // Spread evenly across the sector with a small stable wobble, and
        // alternate depth inside the ring band so neighbours don't touch.
        const pad = 0.06 * (sector.end - sector.start)
        const t = (n + 0.5) / group.length
        const angle =
          sector.start + pad + t * (sector.end - sector.start - 2 * pad)
        const depth = 0.3 + 0.5 * (0.5 + seededJitter(item.id, n))
        const radius = inner + ringBand * Math.min(Math.max(depth, 0.15), 0.9)
        points.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          r: dotRadius(item),
          item,
        })
      })
    }
  }
  return {
    points,
    sectors,
    rings: rings.map((stage, i) => ({ stage, radius: (i + 1) * ringBand })),
    cx,
    cy,
    maxR,
  }
}

export const TIMELINE_MARGIN = { top: 16, right: 20, bottom: 30, left: 40 }

/** Hours since publication, never below one (so the log axis is defined). */
export function ageHours(item, now = Date.now()) {
  return Math.max((now - new Date(item.publishedAt).getTime()) / 36e5, 1)
}

/**
 * Timeline: x = age on a log scale (oldest left, now at the right edge),
 * y = signal score. Unscored items have no y and are not plotted.
 */
export function timelineLayout(items, width, height, now = Date.now()) {
  const m = TIMELINE_MARGIN
  const w = Math.max(width - m.left - m.right, 0)
  const h = Math.max(height - m.top - m.bottom, 0)
  const scored = items.filter((i) => typeof i.signal?.score === 'number')
  const maxAge = Math.max(24, ...scored.map((i) => ageHours(i, now)))
  const logMax = Math.log(maxAge)
  const x = (hours) => m.left + w * (1 - Math.log(hours) / logMax)
  const y = (score) => m.top + h * (1 - score)
  const points = scored.map((item) => ({
    x: x(ageHours(item, now)),
    y: y(item.signal.score),
    r: dotRadius(item),
    item,
  }))
  // Human ticks: 1h, 6h, 1d, 1w, 1mo, 3mo, 1y … within range.
  const tickHours = [1, 6, 24, 24 * 7, 24 * 30, 24 * 90, 24 * 365].filter(
    (t) => t <= maxAge,
  )
  return {
    points,
    unscored: items.length - scored.length,
    xTicks: tickHours.map((hours) => ({ hours, x: x(hours) })),
    yTicks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ value: v, y: y(v) })),
    plot: { left: m.left, top: m.top, width: w, height: h },
  }
}

/** Matrix: counts per category × maturity, with highlighted counts. */
export function matrixCells(items, categoryOrder) {
  const rows = categoryOrder
    .filter((c) => items.some((i) => i.category === c))
    .map((category) => ({
      category,
      cells: MATURITY_ORDER.map((stage) => {
        const inCell = items.filter(
          (i) => i.category === category && i.maturityStage === stage,
        )
        return {
          stage,
          count: inCell.length,
          highlighted: inCell.filter(hasReasons).length,
        }
      }),
    }))
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.count)))
  return { rows, max }
}

/**
 * Topics: every tracked topic tagged in the feed, with how many items and
 * distinct sources carry it, sorted by reach across sources.
 */
export function topicRows(items, labels = {}) {
  const byTopic = new Map()
  for (const item of items) {
    for (const topic of item.signal?.topics ?? []) {
      const row = byTopic.get(topic) ?? { topic, items: 0, sources: new Set() }
      row.items++
      row.sources.add(item.source)
      byTopic.set(topic, row)
    }
  }
  return [...byTopic.values()]
    .map((r) => ({
      topic: r.topic,
      label: labels[r.topic] ?? r.topic,
      items: r.items,
      sources: r.sources.size,
    }))
    .sort((a, b) => b.sources - a.sources || b.items - a.items)
}
