import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CATEGORY_CONFIG, type TechCategory } from '@/lib/tech-categories'

/**
 * Minimal SVG scatter plot for the live radar: x = days ago (recent on the
 * right), y = signal score, dot area = reach within the source. Highlighted
 * items get an accent ring, nothing else is decorated. Hover shows a
 * tooltip; click, Enter or Space selects; every dot is focusable.
 */

export interface ScatterPoint {
  id: string
  title: string
  x: number
  y: number
  z: number
  category: TechCategory
  highlighted?: boolean
}

const MARGIN = { top: 12, right: 12, bottom: 26, left: 34 }
const X_MIN_DOMAIN = 14
// Dot area range in px².
const AREA_MIN = 28
const AREA_MAX = 260

/** Round tick step: the smallest of 1/2/5×10ⁿ giving at most ~6 intervals. */
export function tickStep(max: number): number {
  const raw = max / 6
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow
  return 10 * pow
}

export function ticks(max: number): number[] {
  const step = tickStep(max)
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step)
    out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** Dot radius for `z` in [0,1], mapped linearly onto the area range. */
export function bubbleRadius(z: number): number {
  const t = Math.min(Math.max(z, 0), 1)
  return Math.sqrt((AREA_MIN + t * (AREA_MAX - AREA_MIN)) / Math.PI)
}

export function RadarScatter({
  points,
  onSelect,
  renderTooltip,
  axisLabels,
  accent,
}: {
  points: ScatterPoint[]
  onSelect: (point: ScatterPoint) => void
  renderTooltip: (point: ScatterPoint) => ReactNode
  axisLabels: { x: string; y: string }
  accent: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hovered, setHovered] = useState<ScatterPoint | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { width, height } = size
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const plotH = Math.max(height - MARGIN.top - MARGIN.bottom, 0)
  const xMax = Math.max(X_MIN_DOMAIN, ...points.map((p) => p.x))
  const yMax = 1
  // x is "days ago": 0 (today) sits on the right edge.
  const sx = (x: number) => MARGIN.left + plotW * (1 - x / xMax)
  const sy = (y: number) => MARGIN.top + plotH * (1 - y / yMax)

  const axis = 'rgba(255,255,255,0.12)'
  const grid = 'rgba(255,255,255,0.05)'
  const tickText = 'rgba(255,255,255,0.45)'

  // Draw highlighted dots last so their ring is never covered.
  const ordered = [...points].sort(
    (a, b) => Number(a.highlighted ?? false) - Number(b.highlighted ?? false),
  )

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      {width > 0 && (
        <svg width={width} height={height} className="block" role="group">
          {ticks(yMax).map((v) => (
            <line
              key={`g${v}`}
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={sy(v)}
              y2={sy(v)}
              stroke={grid}
            />
          ))}
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotW}
            y1={MARGIN.top + plotH}
            y2={MARGIN.top + plotH}
            stroke={axis}
          />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left}
            y1={MARGIN.top}
            y2={MARGIN.top + plotH}
            stroke={axis}
          />
          {ticks(xMax).map((v) => (
            <g
              key={`x${v}`}
              transform={`translate(${sx(v)},${MARGIN.top + plotH})`}
            >
              <line y2={4} stroke={axis} />
              <text
                y={15}
                textAnchor="middle"
                fill={tickText}
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {v}
              </text>
            </g>
          ))}
          {ticks(yMax).map((v) => (
            <g key={`y${v}`} transform={`translate(${MARGIN.left},${sy(v)})`}>
              <line x2={-4} stroke={axis} />
              <text
                x={-7}
                dy="0.32em"
                textAnchor="end"
                fill={tickText}
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          <text
            x={MARGIN.left + plotW}
            y={MARGIN.top + plotH - 6}
            textAnchor="end"
            fill={tickText}
            fontSize={10}
          >
            {axisLabels.x}
          </text>
          <text
            transform={`translate(${MARGIN.left + 10},${MARGIN.top + 4}) rotate(-90)`}
            textAnchor="end"
            fill={tickText}
            fontSize={10}
          >
            {axisLabels.y}
          </text>

          {hovered && (
            <g stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3">
              <line
                x1={sx(hovered.x)}
                x2={sx(hovered.x)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
              />
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={sy(hovered.y)}
                y2={sy(hovered.y)}
              />
            </g>
          )}

          {ordered.map((p) => {
            const color = CATEGORY_CONFIG[p.category].color
            const r = bubbleRadius(p.z)
            const active = hovered?.id === p.id
            return (
              <g key={p.id}>
                {p.highlighted && (
                  <circle
                    cx={sx(p.x)}
                    cy={sy(p.y)}
                    r={r + 3}
                    fill="none"
                    stroke={accent}
                    strokeWidth={1.5}
                  />
                )}
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={r}
                  fill={color}
                  fillOpacity={active ? 0.95 : 0.7}
                  stroke={active ? '#fff' : color}
                  strokeWidth={1}
                  className="cursor-pointer outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={p.title}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(p)}
                  onBlur={() => setHovered(null)}
                  onClick={() => onSelect(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(p)
                    }
                  }}
                />
              </g>
            )
          })}
        </svg>
      )}

      {hovered && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: Math.min(sx(hovered.x) + 12, Math.max(width - 280, 0)),
            top: Math.max(sy(hovered.y) - 12, 0),
          }}
        >
          {renderTooltip(hovered)}
        </div>
      )}
    </div>
  )
}
