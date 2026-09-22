import { describe, it, expect } from 'vitest'
import { icon, ICON_NAMES, CATEGORY_ICON, SOURCE_ICON } from '../icons.js'

describe('icon', () => {
  it('renders an inline svg for every named icon', () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain('<path d="M')
    }
  })
  it('renders nothing for an unknown name', () => {
    expect(icon('nope')).toBe('')
  })
  it('covers every category and source', () => {
    for (const n of Object.values(CATEGORY_ICON))
      expect(ICON_NAMES).toContain(n)
    for (const n of Object.values(SOURCE_ICON)) expect(ICON_NAMES).toContain(n)
  })
})
