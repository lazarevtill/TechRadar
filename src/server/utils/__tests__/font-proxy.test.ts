import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fontFilesIn,
  getFontFile,
  isAllowedFontPath,
  rewriteFontCss,
} from '../font-proxy'
import { invalidateCacheByPrefix } from '../cache'

afterEach(() => vi.unstubAllGlobals())

const cssFor = (version: number) =>
  [`a.0`, `a.1`]
    .map(
      (f) =>
        `src: url(https://fonts.gstatic.com/s/notosansjp/v${version}/${f}.woff2) format('woff2');`,
    )
    .join('\n')

/** Google: the stylesheet at `version`, and any font file. */
function google(version: { current: number }) {
  const fetchMock = vi.fn(async (url: string | URL | Request) =>
    String(url).includes('css2')
      ? new Response(cssFor(version.current))
      : new Response(new Uint8Array([1, 2, 3])),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const fontFetches = (fetchMock: ReturnType<typeof google>) =>
  fetchMock.mock.calls.filter(([url]) => !String(url).includes('css2')).length

describe('getFontFile', () => {
  it('relays only the slices the stylesheet names, across a version bump', async () => {
    const version = { current: 56 }
    const fetchMock = google(version)
    expect(await getFontFile('s/notosansjp/v56/a.0.woff2')).not.toBeNull()
    // A valid-looking path the stylesheet never named: no upstream request.
    expect(await getFontFile('s/notosansjp/v56/zzz.woff2')).toBeNull()
    expect(await getFontFile('s/roboto/v30/a.0.woff2')).toBeNull()
    expect(fontFetches(fetchMock)).toBe(1)

    // Google moves to v57; readers holding yesterday's stylesheet still ask
    // for v56 slices, which keep working.
    version.current = 57
    invalidateCacheByPrefix('fonts:cjk-css')
    expect(await getFontFile('s/notosansjp/v57/a.1.woff2')).not.toBeNull()
    expect(await getFontFile('s/notosansjp/v56/a.1.woff2')).not.toBeNull()
  })
})

describe('fontFilesIn', () => {
  it('lists the gstatic paths of a stylesheet', () => {
    expect(fontFilesIn(cssFor(56))).toEqual([
      's/notosansjp/v56/a.0.woff2',
      's/notosansjp/v56/a.1.woff2',
    ])
  })
})

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
