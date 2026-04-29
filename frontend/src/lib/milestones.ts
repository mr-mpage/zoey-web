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

  // Birth weight regained — first weight ≥ first recorded weight that wasn't a loss
  const sortedW = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  if (sortedW.length >= 2) {
    const first = sortedW[0].weight_grams
    const idxRegained = sortedW.findIndex((w) => w.weight_grams >= first && w !== sortedW[0])
    if (idxRegained > 0) {
      const recorded = sortedW[idxRegained].recorded_at.slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      if (recorded === today) {
        out.push({ id: 'regained-bw', text: 'Back to birth weight', rank: 1 })
      }
    }
  }

  // Heaviest weight ever — surfaces on every weigh-in past the first
  if (sortedW.length >= 2) {
    const latest = sortedW[sortedW.length - 1]
    const isHeaviest = sortedW.slice(0, -1).every((w) => latest.weight_grams > w.weight_grams)
    const recordedToday = latest.recorded_at.slice(0, 10) === new Date().toISOString().slice(0, 10)
    if (isHeaviest && recordedToday) {
      out.push({
        id: 'new-max-weight',
        text: `New high: ${latest.weight_grams} g`,
        rank: 2,
      })
    }
  }

  // First feed of a round amount — 50/60/70/80/90/100 ml
  if (todayMaxFeedMl !== null) {
    const bottleHistory = feeds.filter((f) => f.method !== 'breast')
    const todayDate = new Date().toISOString().slice(0, 10)
    const priorMax = bottleHistory
      .filter((f) => f.fed_at.slice(0, 10) < todayDate)
      .reduce((m, f) => Math.max(m, f.amount_ml), 0)
    for (const target of [40, 50, 60, 70, 80, 90, 100, 120]) {
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

  // Best single-day intake
  if (feeds.length > 1) {
    const totalsByDay = new Map<string, number>()
    for (const f of feeds) {
      if (f.method === 'breast') continue
      const day = f.fed_at.slice(0, 10)
      totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + f.amount_ml)
    }
    const today = new Date().toISOString().slice(0, 10)
    const todayTotal = todayFeedTotalMl
    const priorBest = [...totalsByDay.entries()]
      .filter(([d]) => d < today)
      .reduce((m, [, v]) => Math.max(m, v), 0)
    if (priorBest > 0 && todayTotal > priorBest) {
      out.push({
        id: 'best-day',
        text: `Best day so far · ${todayTotal.toFixed(0)} ml`,
        rank: 4,
      })
    }
  }

  return out.sort((a, b) => a.rank - b.rank)
}
