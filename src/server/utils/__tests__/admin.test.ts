import { afterEach, describe, it, expect } from 'vitest'
import { bearerToken, isAuthorized } from '../admin'
import { scheduleMinutes } from '../../scheduler'

describe('operator token', () => {
  afterEach(() => {
    delete process.env.ADMIN_TOKEN
  })

  it('is open when no ADMIN_TOKEN is configured', () => {
    expect(isAuthorized(undefined)).toBe(true)
  })

  it('requires the exact token when configured', () => {
    process.env.ADMIN_TOKEN = 'XXXX-test'
    expect(isAuthorized(undefined)).toBe(false)
    expect(isAuthorized('XXXX-tes')).toBe(false)
    expect(isAuthorized('XXXX-test')).toBe(true)
  })

  it('reads a bearer token', () => {
    const req = new Request('http://x/', {
      headers: { Authorization: 'Bearer abc ' },
    })
    expect(bearerToken(req)).toBe('abc')
    expect(bearerToken(new Request('http://x/'))).toBeNull()
  })
})

describe('scheduleMinutes', () => {
  it('defaults to 5, allows 0 (off), rejects nonsense', () => {
    expect(scheduleMinutes(undefined)).toBe(5)
    expect(scheduleMinutes('')).toBe(5)
    expect(scheduleMinutes('0')).toBe(0)
    expect(scheduleMinutes('15')).toBe(15)
    expect(scheduleMinutes('-3')).toBe(5)
    expect(scheduleMinutes('soon')).toBe(5)
  })
})
