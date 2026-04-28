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

/** Colour bands for g/kg/day gain rate (preterm reference: 15–20 g/kg/day). */
export function gainTone(gpkpd: number): string {
  if (gpkpd >= 25) return 'text-sky-300'
  if (gpkpd >= 15) return 'text-emerald-300'
  if (gpkpd >= 10) return 'text-lime-300'
  if (gpkpd >= 5) return 'text-amber-400'
  return 'text-rose-400'
}
