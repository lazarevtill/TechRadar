import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS,
  normalizeBackendUrl,
  sanitizeSettings,
} from '../settings.js'

describe('normalizeBackendUrl', () => {
  it('adds http:// for local and LAN hosts, https:// otherwise', () => {
    expect(normalizeBackendUrl('localhost:3000')).toEqual({
      ok: true,
      url: 'http://localhost:3000',
    })
    expect(normalizeBackendUrl('192.168.1.20:3000').url).toBe(
      'http://192.168.1.20:3000',
    )
    expect(normalizeBackendUrl('radar.example.com').url).toBe(
      'https://radar.example.com',
    )
  })
  it('keeps an explicit scheme and path, drops slash, query and hash', () => {
    expect(
      normalizeBackendUrl(' https://example.com/radar/?x=1#top ').url,
    ).toBe('https://example.com/radar')
    expect(normalizeBackendUrl('http://10.0.0.5:8080/').url).toBe(
      'http://10.0.0.5:8080',
    )
  })
  it('rejects empty, malformed and non-http input', () => {
    expect(normalizeBackendUrl('   ').error).toBe('empty')
    expect(normalizeBackendUrl('http://').error).toBe('invalid')
    expect(normalizeBackendUrl('ftp://example.com').error).toBe('scheme')
    expect(normalizeBackendUrl('javascript:alert(1)').error).toBe('invalid')
  })
})

describe('sanitizeSettings', () => {
  it('returns defaults for nothing stored', () => {
    expect(sanitizeSettings(undefined)).toEqual({
      ...DEFAULT_SETTINGS,
      panels: { ...DEFAULT_SETTINGS.panels },
    })
  })
  it('keeps valid values and replaces invalid ones with defaults', () => {
    const s = sanitizeSettings({
      backendUrl: 'radar.example.com/',
      refreshMinutes: 7,
      feedSize: 80,
      openLinksInNewTab: 'yes',
      panels: { radar: false, digest: 'no' },
    })
    expect(s.backendUrl).toBe('https://radar.example.com')
    expect(s.refreshMinutes).toBe(DEFAULT_SETTINGS.refreshMinutes)
    expect(s.feedSize).toBe(80)
    expect(s.openLinksInNewTab).toBe(true)
    expect(s.panels.radar).toBe(false)
    expect(s.panels.digest).toBe(true)
  })
})
