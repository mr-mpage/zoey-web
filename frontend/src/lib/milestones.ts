import type { Feed, Weight } from '../api/types'
import { ageInDays } from './format'

export type Milestone = {
  id: string
  text: string
  /** Sort tiebreaker — earlier = more recently achieved (or more relevant). */
  rank: number
}

type Args = {
  birthDateIso: string
  gestationalAgeWeeks: number
  feeds: Feed[]
  weights: Weight[]
  todayFeedTotalMl: number
  todayMaxFeedMl: number | null
}

/** Soft milestones derived from existing tracking data — meant for a single
 *  encouraging chip on Today. Returns the most recently achieved or
 *  currently-active set; the caller picks one. */
export function computeMilestones({
  birthDateIso,
  gestationalAgeWeeks,
  feeds,
  weights,
  todayFeedTotalMl,
  todayMaxFeedMl,
}: Args): Milestone[] {
  const out: Milestone[] = []
  const days = ageInDays(birthDateIso)

  // (Round-number ages are already announced by the header — we don't
  //  duplicate them as a milestone chip.)

  // Term-equivalent (PMA = 40 weeks)
  const pma = gestationalAgeWeeks + days / 7
  if (pma >= 40 && pma < 40 + 1 / 7) {
    out.push({ id: 'term', text: 'Term-equivalent age reached', rank: 1 })
  } else if (pma >= 40 && pma < 41) {
    out.push({ id: 'term-week', text: 'Past term-equivalent — full preterm course done', rank: 5 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const sortedW = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))

  // Birth weight regained — first weight ≥ first recorded weight that wasn't a loss
  if (sortedW.length >= 2) {
    const first = sortedW[0].weight_grams
    const idxRegained = sortedW.findIndex((w, i) => i > 0 && w.weight_grams >= first)
    if (idxRegained > 0 && sortedW[idxRegained].recorded_at.slice(0, 10) === today) {
      out.push({ id: 'regained-bw', text: 'Back to birth weight', rank: 1 })
    }
  }

  // Birth weight doubled — typical ~4–5 months
  if (sortedW.length >= 2) {
    const first = sortedW[0].weight_grams
    const idxDoubled = sortedW.findIndex((w, i) => i > 0 && w.weight_grams >= first * 2)
    if (idxDoubled > 0 && sortedW[idxDoubled].recorded_at.slice(0, 10) === today) {
      out.push({ id: 'doubled-bw', text: 'Doubled birth weight!', rank: 1 })
    }
  }

  // Crossed a round-number weight threshold for the first time
  if (sortedW.length >= 2) {
    const latest = sortedW[sortedW.length - 1]
    const prior = sortedW[sortedW.length - 2]
    if (latest.recorded_at.slice(0, 10) === today) {
      for (const threshold of [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000]) {
        if (prior.weight_grams < threshold && latest.weight_grams >= threshold) {
          out.push({ id: `crossed-${threshold}`, text: `Crossed ${threshold} g`, rank: 2 })
          break
        }
      }
    }
  }

  // First feed of a round amount — happens once per threshold per lifetime
  if (todayMaxFeedMl !== null) {
    const bottleHistory = feeds.filter((f) => f.method !== 'breast')
    const priorMax = bottleHistory
      .filter((f) => f.fed_at.slice(0, 10) < today)
      .reduce((m, f) => Math.max(m, f.amount_ml), 0)
    for (const target of [40, 50, 60, 70, 80, 90, 100, 120, 150]) {
      if (priorMax < target && todayMaxFeedMl >= target) {
        out.push({
          id: `first-${target}`,
          text: `First ${target} ml feed!`,
          rank: 3,
        })
        break
      }
    }
  }

  return out.sort((a, b) => a.rank - b.rank)
}
