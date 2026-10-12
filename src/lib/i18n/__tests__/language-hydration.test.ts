import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider, useLanguage } from '../language-context'

function CurrentLanguage() {
  return createElement('span', null, useLanguage().language)
}

const render = () =>
  renderToString(
    createElement(LanguageProvider, null, createElement(CurrentLanguage)),
  )

afterEach(() => vi.unstubAllGlobals())

describe('language hydration', () => {
  it('starts with the same language even when the browser has saved Russian', () => {
    const server = render()
    const storage = { getItem: () => 'ru' }
    vi.stubGlobal('window', { localStorage: storage })
    vi.stubGlobal('localStorage', storage)
    expect(render()).toBe(server)
    expect(server).toBe('<span>en</span>')
  })

  it('does not read denied storage during the initial render', () => {
    const storage = {
      getItem: () => {
        throw new Error('Storage denied')
      },
    }
    vi.stubGlobal('window', { localStorage: storage })
    vi.stubGlobal('localStorage', storage)
    expect(render()).toBe('<span>en</span>')
  })
})
