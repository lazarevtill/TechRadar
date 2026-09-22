import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CATEGORY_CONFIG, type TechCategory } from '@/lib/tech-categories'

/**
 * Minimal SVG scatter plot for the live radar.
 *
 * Replaces a recharts ScatterChart: that one chart pulled recharts plus redux,
 * immer, d3-* and decimal.js into the dashboard bundle. This renders the same
 * encoding — x = days ago (recent on the right), y = impact, bubble area =
 * hype, anomalies glow — with a hover tooltip and click/keyboard selection.
 */

export interface ScatterPoint {
  id: string
  title: string
  x: number
  y: number
  z: number
  category: TechCategory
  isAnomaly?: boolean
}

const MARGIN = { top: 16, right: 16, bottom: 28, left: 36 }
const X_MIN_DOMAIN = 25
const Y_MIN_DOMAIN = 11
// Bubble area range in px², as the recharts ZAxis `range` it replaces.
const AREA_MIN = 100
const AREA_MAX = 800

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

/** Bubble radius for `z`, mapping [0, zMax] linearly onto the area range. */
export function bubbleRadius(z: number, zMax: number): number {
  const t = zMax > 0 ? Math.min(Math.max(z / zMax, 0), 1) : 0
  return Math.sqrt((AREA_MIN + t * (AREA_MAX - AREA_MIN)) / Math.PI)
}

export function RadarScatter({
  points,
  onSelect,
  renderTooltip,
  axisLabels,
}: {
  points: ScatterPoint[]
  onSelect: (point: ScatterPoint) => void
  renderTooltip: (point: ScatterPoint) => ReactNode
  axisLabels: { x: string; y: string }
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
  const yMax = Math.max(Y_MIN_DOMAIN, ...points.map((p) => p.y))
  const zMax = Math.max(0, ...points.map((p) => p.z))
  // x is "days ago": 0 (today) sits on the right edge.
  const sx = (x: number) => MARGIN.left + plotW * (1 - x / xMax)
  const sy = (y: number) => MARGIN.top + plotH * (1 - y / yMax)

  const axis = 'rgba(255,255,255,0.1)'
  const tickText = 'rgba(255,255,255,0.4)'

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      {width > 0 && (
        <svg width={width} height={height} className="block">
          <defs>
            <filter id="radar-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Axes */}
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
              <line y2={5} stroke={axis} />
              <text y={16} textAnchor="middle" fill={tickText} fontSize={10}>
                {v}
              </text>
            </g>
          ))}
          {ticks(yMax).map((v) => (
            <g key={`y${v}`} transform={`translate(${MARGIN.left},${sy(v)})`}>
              <line x2={-5} stroke={axis} />
              <text
                x={-8}
                dy="0.32em"
                textAnchor="end"
                fill={tickText}
                fontSize={10}
              >
                {v}
              </text>
            </g>
          ))}
          <text
            x={MARGIN.left + plotW}
            y={MARGIN.top + plotH - 6}
            textAnchor="end"
            fill="rgba(255,255,255,0.3)"
            fontSize={10}
          >
            {axisLabels.x}
          </text>
          <text
            transform={`translate(${MARGIN.left + 12},${MARGIN.top + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize={10}
          >
            {axisLabels.y}
          </text>

          {/* Hover crosshair */}
          {hovered && (
            <g stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3">
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

          {points.map((p) => {
            const color = CATEGORY_CONFIG[p.category].color
            return (
              <circle
                key={p.id}
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={bubbleRadius(p.z, zMax)}
                fill={color}
                fillOpacity={p.isAnomaly ? 0.9 : 0.6}
                stroke={p.isAnomaly ? '#ffaa00' : color}
                strokeWidth={p.isAnomaly ? 2 : 1}
                filter={p.isAnomaly ? 'url(#radar-glow)' : undefined}
                className="cursor-pointer"
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
            )
          })}
        </svg>
      )}

      {hovered && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: Math.min(sx(hovered.x) + 12, Math.max(width - 260, 0)),
            top: Math.max(sy(hovered.y) - 12, 0),
          }}
        >
          {renderTooltip(hovered)}
        </div>
      )}
    </div>
  )
}
