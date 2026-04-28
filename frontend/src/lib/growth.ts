import type { Weight } from '../api/types'

export type GainBetween = {
  from: Weight
  to: Weight
  days: number
  g_per_day: number
  g_per_kg_per_day: number
}

/** Pairs each weight entry with the previous one and computes gain rate. */
export function gainsBetweenEntries(weights: Weight[]): GainBetween[] {
  if (weights.length < 2) return []
  const sorted = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const out: GainBetween[] = []
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    const days = (new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()) / 86_400_000
    if (days <= 0) continue
    const g_per_day = (b.weight_grams - a.weight_grams) / days
    const g_per_kg_per_day = g_per_day / (b.weight_grams / 1000)
    out.push({ from: a, to: b, days, g_per_day, g_per_kg_per_day })
  }
  return out
}

/** Rolling gain rate: (latest - earliest within last `windowDays`) / days_between, in g/kg/day. */
export function rollingGainRate(weights: Weight[], windowDays = 7): number | null {
  if (weights.length < 2) return null
  const sorted = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const latest = sorted[sorted.length - 1]
  const cutoff = new Date(latest.recorded_at).getTime() - windowDays * 86_400_000
  const within = sorted.filter((w) => new Date(w.recorded_at).getTime() >= cutoff)
  const earliest = within.length > 1 ? within[0] : sorted[0]
  if (earliest.id === latest.id) return null
  const days = (new Date(latest.recorded_at).getTime() - new Date(earliest.recorded_at).getTime()) / 86_400_000
  if (days <= 0) return null
  const g_per_day = (latest.weight_grams - earliest.weight_grams) / days
  return g_per_day / (latest.weight_grams / 1000)
}

/** PMA-aware expected gain range (g/kg/day), mirrors the backend in services.py.
 * References: Fenton 2013/2025, AAP/ESPGHAN 2022. */
export function expectedGainRange(pmaWeeks: number, postnatalDays: number): [number, number] {
  if (postnatalDays < 7) return [0, 12]
  if (postnatalDays < 14) return [8, 16]
  if (pmaWeeks < 30) return [17, 23]
  if (pmaWeeks < 34) return [15, 20]
  if (pmaWeeks < 38) return [12, 17]
  return [10, 15]
}

/** Colour for a g/kg/day reading. When PMA + postnatal age are known, uses
 * the PMA-aware expected range so a 9 g/kg/day reading on day 13 is judged
 * against 8–16 (not the term target of 17–20). */
export function gainTone(gpkpd: number, pmaWeeks?: number, postnatalDays?: number): string {
  if (pmaWeeks !== undefined && postnatalDays !== undefined) {
    const [gMin, gMax] = expectedGainRange(pmaWeeks, postnatalDays)
    if (gpkpd >= gMax + 8) return 'text-sky-300'
    if (gpkpd >= gMin) return 'text-emerald-300'
    if (gpkpd >= gMin - 3) return 'text-lime-300'
    if (gpkpd >= Math.max(0, gMin - 8)) return 'text-amber-400'
    return 'text-rose-400'
  }
  // PMA-agnostic fallback
  if (gpkpd >= 22) return 'text-sky-300'
  if (gpkpd >= 15) return 'text-emerald-300'
  if (gpkpd >= 10) return 'text-lime-300'
  if (gpkpd >= 5) return 'text-amber-400'
  return 'text-rose-400'
}

/** Helper to compute PMA + postnatal days from birth date and GA at birth. */
export function pmaAndPostnatal(birthDateIso: string, gestationalAgeWeeks: number): { pma: number; postnatalDays: number } {
  const birth = new Date(birthDateIso + 'T00:00:00')
  const now = new Date()
  const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86_400_000))
  return { pma: gestationalAgeWeeks + days / 7, postnatalDays: days }
}
