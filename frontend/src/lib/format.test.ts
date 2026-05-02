import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ageInDays, fmtMl, fmtRelative, friendlyAge } from './format'

describe('fmtMl', () => {
  it('renders with the given digits', () => {
    expect(fmtMl(60)).toBe('60 ml')
    expect(fmtMl(60.5, 1)).toBe('60.5 ml')
  })

  it('shows em-dash for null/undefined', () => {
    expect(fmtMl(null)).toBe('—')
    expect(fmtMl(undefined)).toBe('—')
  })
})

describe('fmtRelative', () => {
  const NOW = new Date('2026-05-02T12:00:00Z').getTime()

  it('returns "now" within a 1-minute window', () => {
    expect(fmtRelative(new Date(NOW - 30_000).toISOString(), NOW)).toBe('now')
    expect(fmtRelative(new Date(NOW + 30_000).toISOString(), NOW)).toBe('now')
  })

  it('formats past minutes', () => {
    expect(fmtRelative(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5 min ago')
  })

  it('formats past hours and minutes', () => {
    expect(fmtRelative(new Date(NOW - (2 * 60 + 15) * 60_000).toISOString(), NOW)).toBe('2 h 15 min ago')
  })

  it('formats future minutes', () => {
    expect(fmtRelative(new Date(NOW + 30 * 60_000).toISOString(), NOW)).toBe('in 30 min')
  })
})

describe('ageInDays / friendlyAge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when birth is today', () => {
    expect(ageInDays('2026-05-02')).toBe(0)
    expect(friendlyAge('2026-05-02')).toBe('Born today')
  })

  it('returns whole days for short stretches', () => {
    expect(ageInDays('2026-04-30')).toBe(2)
    expect(friendlyAge('2026-04-30')).toBe('2 days old')
  })

  it('says "weeks old today" when the day count divides evenly into 7', () => {
    /* 14 days exactly → 2 weeks, rest=0 → friendly form. */
    expect(friendlyAge('2026-04-18')).toBe('2 weeks old today')
  })

  it('uses compact weeks/days form when not evenly weeks', () => {
    /* 16 days = 2w 2d. */
    expect(friendlyAge('2026-04-16')).toBe('2w 2d')
  })

  it('uses compact months/days form past 60 days', () => {
    /* 62 days → 2m 2d (not the friendly "X months old today" since rest != 0). */
    expect(friendlyAge('2026-03-01')).toBe('2m 2d')
  })

  it('says "months old today" when day count divides evenly into 30', () => {
    /* 60 days exactly → 2 months, rest=0. */
    expect(friendlyAge('2026-03-03')).toBe('2 months old today')
  })
})
