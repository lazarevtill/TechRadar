import { describe, it, expect } from 'vitest'
import { isAllowedFontPath, rewriteFontCss } from '../font-proxy'

describe('isAllowedFontPath', () => {
  it('accepts Google font slices only', () => {
    expect(
      isAllowedFontPath(
        's/notosansjp/v56/-F62fjtqLzI2JPCgQBnw7HFow2oe2EcP5pp0erwTqsSWs9Jezazjcb4.0.woff2',
      ),
    ).toBe(true)
  })
  it('rejects anything that would turn it into an open proxy', () => {
    for (const path of [
      '../../etc/passwd',
      's/notosansjp/v56/x.woff2/../../admin',
      'https://evil.example/x.woff2',
      's/notosansjp/v56/x.ttf',
      'css2?family=x',
      '',
    ])
      expect(isAllowedFontPath(path)).toBe(false)
  })
})

describe('rewriteFontCss', () => {
  it('points every font URL at our own origin', () => {
    const css =
      "src: url(https://fonts.gstatic.com/s/notosanssc/v40/a.0.woff2) format('woff2');"
    expect(rewriteFontCss(css, 'http://localhost:3000')).toBe(
      "src: url(http://localhost:3000/api/fonts/file/s/notosanssc/v40/a.0.woff2) format('woff2');",
    )
  })
})
