import { describe, it, expect } from 'vitest'
import { escapeHtml, num } from '../html.js'

describe('escapeHtml', () => {
  it('escapes text and attribute breakouts', () => {
    expect(escapeHtml('<b>"x" & \'y\'</b>')).toBe(
      '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;',
    )
    expect(escapeHtml(null)).toBe('')
  })

  it('never lets a string pass as a number', () => {
    expect(num('<img src=x>')).toBe(0)
    expect(num(12)).toBe(12)
    expect(num('7')).toBe(7)
  })
})
