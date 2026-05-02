import { describe, expect, it } from 'vitest'
import type { Weight } from '../api/types'
import {
  expectedGainRange,
  gainTone,
  gainsBetweenEntries,
  pmaAndPostnatal,
  rollingGainRate,
  weightForDay,
} from './growth'

const w = (id: number, recorded_at: string, weight_grams: number, is_auto = false): Weight => ({
  id,
  recorded_at,
  weight_grams,
  ml_per_kg_per_day: 160,
  notes: null,
  is_auto,
})

describe('weightForDay', () => {
  it('prefers an entry on the same calendar date', () => {
    const weights = [
      w(1, '2026-04-25T09:00:00+02:00', 2280),
      w(2, '2026-04-26T09:00:00+02:00', 2305),
      w(3, '2026-04-27T09:00:00+02:00', 2330),
    ]
    expect(weightForDay(new Date(2026, 3, 26), weights)?.id).toBe(2)
  })

  it('falls back to the most recent earlier entry', () => {
    const weights = [
      w(1, '2026-04-23T09:00:00+02:00', 2240),
      w(2, '2026-04-25T09:00:00+02:00', 2280),
    ]
    expect(weightForDay(new Date(2026, 3, 27), weights)?.id).toBe(2)
  })

  it('falls back to the earliest known entry when target predates history', () => {
    const weights = [
      w(1, '2026-05-01T09:00:00+02:00', 2400),
      w(2, '2026-05-02T09:00:00+02:00', 2425),
    ]
    expect(weightForDay(new Date(2026, 3, 15), weights)?.id).toBe(1)
  })

  it('returns null for an empty history', () => {
    expect(weightForDay(new Date(), [])).toBeNull()
  })
})

describe('rollingGainRate', () => {
  it('returns null with fewer than two entries', () => {
    expect(rollingGainRate([])).toBeNull()
    expect(rollingGainRate([w(1, '2026-04-25T09:00:00+02:00', 2280)])).toBeNull()
  })

  it('computes the slope between window endpoints', () => {
    const weights = [
      w(1, '2026-04-25T09:00:00+02:00', 2280),
      w(2, '2026-04-28T09:00:00+02:00', 2370), // +90g over 3 days
    ]
    const rate = rollingGainRate(weights, 7)
    // 30 g/day on 2.37 kg latest = 30 / 2.37 = 12.6582… g/kg/day
    expect(rate).toBeCloseTo(12.658, 2)
  })

  it('ignores entries outside the rolling window', () => {
    const weights = [
      w(1, '2026-04-14T09:00:00+02:00', 2200), // 14 days before latest
      w(2, '2026-04-25T09:00:00+02:00', 2280),
      w(3, '2026-04-28T09:00:00+02:00', 2370),
    ]
    const rate = rollingGainRate(weights, 7)
    expect(rate).toBeCloseTo(12.658, 2)
  })
})

describe('expectedGainRange', () => {
  it('tolerates birth-weight loss in week 1', () => {
    expect(expectedGainRange(35, 3)).toEqual([0, 12])
  })

  it('uses the regain band in week 2', () => {
    expect(expectedGainRange(36, 10)).toEqual([8, 16])
  })

  it('strata by PMA after day 14', () => {
    expect(expectedGainRange(28, 30)).toEqual([17, 23])
    expect(expectedGainRange(31, 30)).toEqual([15, 20])
    expect(expectedGainRange(35, 30)).toEqual([12, 17])
    expect(expectedGainRange(40, 30)).toEqual([10, 15])
  })

  it('mirrors the backend table exactly', () => {
    /* If this drifts, see backend/growth.py expected_gain_range. */
    expect(expectedGainRange(36, 6)).toEqual([0, 12])
    expect(expectedGainRange(36, 13)).toEqual([8, 16])
    expect(expectedGainRange(33.9, 30)).toEqual([15, 20])
    expect(expectedGainRange(34.0, 30)).toEqual([12, 17])
  })
})

describe('gainTone', () => {
  it('uses the PMA-aware band when both context fields supplied', () => {
    // 35w PMA, day 30 → expected 12-17 g/kg/day
    expect(gainTone(13, 35, 30)).toBe('text-emerald-300') // in band
    expect(gainTone(10, 35, 30)).toBe('text-lime-300') // just under
    expect(gainTone(2, 35, 30)).toBe('text-rose-400') // way under
  })

  it('falls back to PMA-agnostic thresholds without context', () => {
    expect(gainTone(20)).toBe('text-emerald-300')
    expect(gainTone(0)).toBe('text-rose-400')
  })
})

describe('gainsBetweenEntries', () => {
  it('returns an empty array with fewer than two entries', () => {
    expect(gainsBetweenEntries([])).toEqual([])
    expect(gainsBetweenEntries([w(1, '2026-04-25T09:00:00+02:00', 2280)])).toEqual([])
  })

  it('pairs consecutive entries with computed gain', () => {
    const weights = [
      w(1, '2026-04-25T09:00:00+02:00', 2280),
      w(2, '2026-04-28T09:00:00+02:00', 2370),
    ]
    const gains = gainsBetweenEntries(weights)
    expect(gains).toHaveLength(1)
    expect(gains[0].g_per_day).toBe(30)
    expect(gains[0].days).toBe(3)
  })
})

describe('pmaAndPostnatal', () => {
  it('returns ga + days/7 from the birth date to the supplied "today"', () => {
    /* 21 days from birth → +3 weeks of PMA on top of 35w GA. */
    const r = pmaAndPostnatal('2026-04-15', 35, new Date('2026-05-06T12:00:00+02:00'))
    expect(r.postnatalDays).toBe(21)
    expect(r.pma).toBeCloseTo(38, 5)
  })

  it('clamps negative ages (today before birth) to 0 days / GA', () => {
    const r = pmaAndPostnatal('2026-04-15', 35, new Date('2026-04-10T12:00:00+02:00'))
    expect(r.postnatalDays).toBe(0)
    expect(r.pma).toBe(35)
  })
})
