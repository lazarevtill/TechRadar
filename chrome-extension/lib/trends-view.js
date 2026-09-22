const ORDER = ['research', 'prototype', 'early-adopter', 'mass-market']

export function nextStage(stage) {
  const i = ORDER.indexOf(stage)
  if (i < 0) return ORDER[0]
  return ORDER[Math.min(i + 1, ORDER.length - 1)]
}

export function trajectoryMeta(trajectory) {
  if (trajectory === 'rising') return { icon: 'up', label: 'rising' }
  if (trajectory === 'cooling') return { icon: 'down', label: 'cooling' }
  return { icon: 'flat', label: 'stable' }
}

/**
 * Bar heights in [0,1] for a sparkline, one per week. Drawn as SVG rects by
 * the page: block glyphs depend on the installed font.
 */
export function sparklineBars(weeklyCounts) {
  if (!weeklyCounts || weeklyCounts.length === 0) return []
  const max = Math.max(1, ...weeklyCounts)
  return weeklyCounts.map((c) => Math.round((c / max) * 100) / 100)
}
