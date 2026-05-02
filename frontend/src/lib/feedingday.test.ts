import { describe, expect, it } from 'vitest'
import { feedingDayKey, feedingDayKeyOfFeed } from './feedingday'

describe('feedingDayKey', () => {
  it('after the anchor belongs to today', () => {
    const ts = new Date(2026, 4, 2, 2, 30) // 02:30
    expect(feedingDayKey(ts, 2, 30)).toBe('2026-05-02')
  })

  it('before the anchor rolls back to yesterday', () => {
    const ts = new Date(2026, 4, 2, 2, 29)
    expect(feedingDayKey(ts, 2, 30)).toBe('2026-05-01')
  })

  it('late evening stays on the calendar date', () => {
    const ts = new Date(2026, 4, 2, 23, 55)
    expect(feedingDayKey(ts, 2, 30)).toBe('2026-05-02')
  })

  it('early morning before anchor rolls back across day boundary', () => {
    const ts = new Date(2026, 4, 3, 1, 15)
    expect(feedingDayKey(ts, 2, 30)).toBe('2026-05-02')
  })
})

describe('feedingDayKeyOfFeed', () => {
  it('respects an explicit override', () => {
    const f = { fed_at: '2026-05-02T02:20:00+02:00', feeding_day_override: '2026-05-02' }
    expect(feedingDayKeyOfFeed(f, 2, 30)).toBe('2026-05-02')
  })

  it('derives from fed_at when no override', () => {
    const f = { fed_at: '2026-05-02T09:00:00+02:00', feeding_day_override: null }
    expect(feedingDayKeyOfFeed(f, 2, 30)).toBe('2026-05-02')
  })
})
