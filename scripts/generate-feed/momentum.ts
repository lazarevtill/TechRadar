export type SignalSnapshot = { date: string; topics: Record<string, number> }
export type Signal = {
  title: string
  url: string
  source: string
  publishedAt: string
}
export type Topic = {
  id: string
  label: string
  category: string
  stage: string
  trajectory: 'rising' | 'stable' | 'cooling'
  momentum: number
  weeklyCounts: number[]
  signals?: Signal[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function bucketByWeek(history: SignalSnapshot[], topicId: string): number[] {
  if (history.length === 0) return []
  const sorted = [...history].sort(
    (a, b) => +new Date(a.date) - +new Date(b.date),
  )
  const start = +new Date(sorted[0].date)
  const weeks: number[] = []
  for (const snap of sorted) {
    const idx = Math.floor((+new Date(snap.date) - start) / WEEK_MS)
    weeks[idx] = (weeks[idx] ?? 0) + (snap.topics[topicId] ?? 0)
  }
  for (let i = 0; i < weeks.length; i++)
    if (weeks[i] === undefined) weeks[i] = 0
  return weeks
}

export function computeTrends(
  history: SignalSnapshot[],
  labels: Record<string, { label: string; category: string; stage: string }>,
): Topic[] {
  const ids = new Set<string>()
  history.forEach((s) => Object.keys(s.topics).forEach((k) => ids.add(k)))

  const topics: Topic[] = []
  for (const id of ids) {
    const meta = labels[id] ?? { label: id, category: 'ai', stage: 'research' }
    const weekly = bucketByWeek(history, id)
    const last = weekly[weekly.length - 1] ?? 0
    const prev = weekly[weekly.length - 2] ?? 0
    const momentum = prev === 0 ? (last > 0 ? 1 : 0) : (last - prev) / prev
    let trajectory: Topic['trajectory'] = 'stable'
    if (last > prev) trajectory = 'rising'
    else if (last < prev) trajectory = 'cooling'
    topics.push({
      id,
      label: meta.label,
      category: meta.category,
      stage: meta.stage,
      trajectory,
      momentum: Math.round(momentum * 100) / 100,
      weeklyCounts: weekly,
    })
  }
  return topics.sort((a, b) => b.momentum - a.momentum)
}
