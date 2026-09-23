/**
 * New works per day as tiny bars (hand-written SVG, no chart library). The
 * last seven days are drawn in the accent colour so a recent rise reads at
 * a glance; the label says the same in words for screen readers.
 */
export function Sparkline({
  counts,
  label,
}: {
  counts: number[]
  label: string
}) {
  const max = Math.max(1, ...counts)
  const w = 2
  const gap = 1
  const h = 16
  return (
    <svg
      role="img"
      aria-label={label}
      width={counts.length * (w + gap)}
      height={h}
      className="shrink-0"
    >
      {counts.map((c, i) => {
        const bh = c === 0 ? 1 : Math.max(2, Math.round((c / max) * h))
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - bh}
            width={w}
            height={bh}
            className={
              c === 0
                ? 'fill-rule'
                : i >= counts.length - 7
                  ? 'fill-accent'
                  : 'fill-fg-3'
            }
          />
        )
      })}
    </svg>
  )
}
