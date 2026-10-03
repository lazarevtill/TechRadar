import { describe, expect, it, vi } from 'vitest'
import { formatCalendarDate, formatUpdatedTime } from '../display-time'

describe('server and browser timestamp text', () => {
  it('renders the same UTC text in the server and reader timezones', () => {
    const date = new Date('2026-09-30T23:05:00.000Z')
    try {
      for (const timezone of [
        'UTC',
        'Europe/Belgrade',
        'America/Los_Angeles',
      ]) {
        vi.stubEnv('TZ', timezone)
        expect(formatUpdatedTime(date)).toBe('23:05 UTC')
        expect(formatCalendarDate(date)).toBe('2026-09-30')
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('pads midnight hours and minutes without depending on locale', () => {
    expect(formatUpdatedTime(new Date('2026-09-30T00:01:00Z'))).toBe(
      '00:01 UTC',
    )
  })
})
