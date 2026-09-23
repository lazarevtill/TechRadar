import { describe, it, expect } from 'vitest'
import { cleanText, decodeEntities } from '../clean-text'

describe('cleanText', () => {
  it('strips HAL-style markup', () => {
    expect(
      cleanText(
        '<div><p>Reinforcement Learning (RL) is the common approach.</p><p>Testing is</p></div>',
      ),
    ).toBe('Reinforcement Learning (RL) is the common approach. Testing is')
  })
  it('decodes entities, including double-encoded tags', () => {
    expect(
      cleanText('Q&amp;A &mdash; &#x4E2D;&#25991; &lt;p&gt;x&lt;/p&gt;'),
    ).toBe('Q&A — 中文 x')
  })
  it('keeps comparisons and math that only look like tags', () => {
    expect(cleanText('if x < 5 and y > 3, a <-> b')).toBe(
      'if x < 5 and y > 3, a <-> b',
    )
  })
  it('drops a tag cut off by truncation and handles empty input', () => {
    expect(cleanText('Good text <di')).toBe('Good text')
    expect(cleanText(null)).toBe('')
  })
  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notanentity; &#0;')).toBe('&notanentity; &#0;')
  })
})
