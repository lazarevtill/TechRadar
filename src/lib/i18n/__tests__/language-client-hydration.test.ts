// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider, useLanguage } from '../language-context'

function LanguageControls() {
  const { language, setLanguage } = useLanguage()
  return createElement(
    'div',
    null,
    createElement('span', { 'data-language': true }, language),
    createElement('button', { onClick: () => setLanguage('ru') }, 'Russian'),
    createElement('button', { onClick: () => setLanguage('en') }, 'English'),
  )
}

const app = () =>
  createElement(LanguageProvider, null, createElement(LanguageControls))

let root: Root | null = null

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
})

afterEach(async () => {
  if (root) await act(() => root!.unmount())
  root = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  document.body.replaceChildren()
})

async function hydrate() {
  const container = document.createElement('div')
  container.innerHTML = renderToString(app())
  document.body.appendChild(container)
  const serverNode = container.querySelector('[data-language]')!
  expect(serverNode.textContent).toBe('en')
  const errors: unknown[] = []
  await act(() => {
    root = hydrateRoot(container, app(), {
      onRecoverableError: (error) => errors.push(error),
    })
  })
  // A hydration mismatch can replace the SSR tree instead of attaching to it.
  expect(container.querySelector('[data-language]')).toBe(serverNode)
  return { container, errors }
}

async function select(container: HTMLElement, language: 'ru' | 'en') {
  const buttons = container.querySelectorAll('button')
  await act(() => buttons[language === 'ru' ? 0 : 1].click())
}

describe('client language hydration', () => {
  it('hydrates the server tree, restores saved Russian, and persists a subsequent switch', async () => {
    localStorage.setItem('tech-radar-language', 'ru')
    const consoleErrors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const { container, errors } = await hydrate()
    expect(container.querySelector('[data-language]')?.textContent).toBe('ru')
    expect(errors).toEqual([])
    expect(consoleErrors).not.toHaveBeenCalled()

    await select(container, 'en')
    expect(container.querySelector('[data-language]')?.textContent).toBe('en')
    expect(localStorage.getItem('tech-radar-language')).toBe('en')
  })

  it('keeps the default language when restoration is denied and still allows switching', async () => {
    const storage = localStorage
    const getItem = vi.fn(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })
    vi.stubGlobal('localStorage', {
      getItem,
      setItem: (key: string, value: string) => storage.setItem(key, value),
    })
    const consoleErrors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const { container, errors } = await hydrate()
    expect(container.querySelector('[data-language]')?.textContent).toBe('en')
    expect(errors).toEqual([])
    expect(getItem).toHaveBeenCalledWith('tech-radar-language')
    await select(container, 'ru')
    expect(container.querySelector('[data-language]')?.textContent).toBe('ru')
    expect(consoleErrors).not.toHaveBeenCalled()
  })

  it('keeps switching in memory when saving the preference is denied', async () => {
    const storage = localStorage
    const setItem = vi.fn(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.getItem(key),
      setItem,
    })
    const consoleErrors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const { container, errors } = await hydrate()
    await select(container, 'ru')
    expect(container.querySelector('[data-language]')?.textContent).toBe('ru')
    await select(container, 'en')
    expect(container.querySelector('[data-language]')?.textContent).toBe('en')
    expect(errors).toEqual([])
    expect(consoleErrors).not.toHaveBeenCalled()
    expect(setItem).toHaveBeenCalledWith('tech-radar-language', 'ru')
    expect(setItem).toHaveBeenCalledWith('tech-radar-language', 'en')
    expect(localStorage.getItem('tech-radar-language')).toBeNull()
  })
})
