import { describe, it, expect } from 'vitest'
import {
  collectExtensionFiles,
  manifestEntries,
  planBuild,
  referencesIn,
} from '../build-extension'

const tree = (files: Record<string, string>) => (p: string) => files[p] ?? null

const manifest = JSON.stringify({
  icons: { '16': 'icons/i16.png' },
  chrome_url_overrides: { newtab: 'newtab.html' },
})

describe('referencesIn', () => {
  it('finds local html src/href and skips remote and data urls', () => {
    const html =
      '<link href="a.css"><script src="app.js"></script><a href="https://x.dev"></a><img src="data:image/png;base64,">'
    expect(referencesIn('newtab.html', html)).toEqual(['a.css', 'app.js'])
  })
  it('resolves css url() relative to the stylesheet', () => {
    expect(
      referencesIn(
        'css/f.css',
        "src: url('../fonts/a.woff2?v=1') format('woff2')",
      ),
    ).toEqual(['fonts/a.woff2'])
  })
  it('finds static, bare and dynamic relative js imports only', () => {
    const js =
      "import { a } from './lib/a.js'\nimport './side.js'\nconst b = await import('./lazy.js')\nimport c from 'pkg'"
    expect(referencesIn('app.js', js)).toEqual([
      'lib/a.js',
      'side.js',
      'lazy.js',
    ])
  })
})

describe('manifestEntries', () => {
  it('collects icons, overrides, popup and service worker', () => {
    expect(
      manifestEntries({
        icons: { '16': 'i.png' },
        chrome_url_overrides: { newtab: 'n.html' },
        action: { default_popup: 'p.html', default_icon: { '16': 'a.png' } },
        background: { service_worker: 'sw.js' },
      }).sort(),
    ).toEqual(['a.png', 'i.png', 'n.html', 'p.html', 'sw.js'])
  })
})

describe('collectExtensionFiles', () => {
  const files = {
    'manifest.json': manifest,
    'icons/i16.png': 'png',
    'newtab.html': '<link href="s.css"><script src="app.js"></script>',
    's.css': "@font-face{src:url('fonts/f.woff2')}",
    'fonts/f.woff2': 'woff',
    'app.js': "import './lib/x.js'",
    'lib/x.js': 'export {}',
    'lib/__tests__/x.test.js': 'never shipped',
    'README.md': 'never shipped',
  }

  it('returns exactly the reachable files', () => {
    expect(collectExtensionFiles(tree(files))).toEqual([
      'app.js',
      'fonts/f.woff2',
      'icons/i16.png',
      'lib/x.js',
      'manifest.json',
      'newtab.html',
      's.css',
    ])
  })

  it('fails on a missing reference, naming the referrer', () => {
    const broken = { ...files, 'app.js': "import './lib/gone.js'" }
    expect(() => collectExtensionFiles(tree(broken))).toThrow(
      /lib\/gone\.js \(referenced by app\.js\)/,
    )
  })

  it('plans page scripts as bundle entries and inlines their imports', () => {
    const read = tree(files)
    expect(planBuild(collectExtensionFiles(read), read)).toEqual({
      scripts: ['app.js'],
      styles: ['s.css'],
      copies: [
        'fonts/f.woff2',
        'icons/i16.png',
        'manifest.json',
        'newtab.html',
      ],
    })
  })
})
