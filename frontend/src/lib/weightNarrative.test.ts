import { describe, expect, it } from 'vitest'
import type { Weight } from '../api/types'
import { buildWeightNarrative } from './weightNarrative'

const w = (id: number, recorded_at: string, weight_grams: number, is_auto = false): Weight => ({
  id,
  recorded_at,
  weight_grams,
  ml_per_kg_per_day: 160,
  notes: null,
  is_auto,
})

const args = (weights: Weight[]) => ({
  weights,
  birthDateIso: '2026-04-15',
  gestationalAgeWeeks: 35,
  birthWeightGrams: 2455,
})

describe('buildWeightNarrative', () => {
  it('returns the empty-state narrative when no manual entries exist', () => {
    const out = buildWeightNarrative(args([]))
    expect(out?.headline).toMatch(/no weights/i)
  })

  it('still treats it as empty when only auto entries exist', () => {
    /* The auto-fill regenerator could only produce these by extrapolating
     * from a manual; in tests we can construct the case directly. The
     * narrative should not pretend to describe real data. */
    const out = buildWeightNarrative(args([w(1, '2026-04-20T12:00:00+02:00', 2400, true)]))
    expect(out?.headline).toMatch(/no weights/i)
  })

  it('drops the gram number from headlines (no conflict with page header)', () => {
    /* See the audit fix: the page already shows current weight at top of
     * the tab; the narrative speaks in deltas/labels only. */
    const weights = [
      w(1, '2026-04-20T09:00:00+02:00', 2200),
      w(2, '2026-04-22T09:00:00+02:00', 2240),
    ]
    const out = buildWeightNarrative(args(weights))
    /* Should NOT mention the explicit gram number 2240 in the headline. */
    expect(out?.headline).not.toMatch(/\b2240\b/)
  })
})
