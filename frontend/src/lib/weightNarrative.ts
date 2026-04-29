import type { Weight } from '../api/types'
import { approxPercentile } from './fenton'

export type WeightNarrative = {
  tone: 'celebrate' | 'positive' | 'neutral' | 'concern'
  headline: string
  detail: string
}

type Args = {
  weights: Weight[]
  birthDateIso: string
  gestationalAgeWeeks: number
  birthWeightGrams: number
}

function pmaAt(birthIso: string, gaWeeks: number, when: Date): number {
  const birth = new Date(birthIso + 'T00:00:00').getTime()
  const days = Math.max(0, (when.getTime() - birth) / 86_400_000)
  return gaWeeks + days / 7
}

function daysSinceBirth(birthIso: string, when: Date): number {
  const birth = new Date(birthIso + 'T00:00:00').getTime()
  return Math.max(0, Math.floor((when.getTime() - birth) / 86_400_000))
}

/** Returns the rolling g/kg/day across the last `windowDays` of history. */
function rollingGain(weights: Weight[], windowDays: number): number | null {
  const sorted = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  if (sorted.length < 2) return null
  const latest = sorted[sorted.length - 1]
  const cutoff = new Date(latest.recorded_at).getTime() - windowDays * 86_400_000
  const within = sorted.filter((w) => new Date(w.recorded_at).getTime() >= cutoff)
  const earliest = within.length > 1 ? within[0] : sorted[0]
  if (earliest.id === latest.id) return null
  const days = (new Date(latest.recorded_at).getTime() - new Date(earliest.recorded_at).getTime()) / 86_400_000
  if (days <= 0) return null
  const gPerDay = (latest.weight_grams - earliest.weight_grams) / days
  const kg = latest.weight_grams / 1000
  return gPerDay / kg
}

function expectedRange(pma: number, postnatalDays: number): [number, number] {
  if (postnatalDays < 7) return [0, 12]
  if (postnatalDays < 14) return [8, 16]
  if (pma < 30) return [17, 23]
  if (pma < 34) return [15, 20]
  if (pma < 38) return [12, 17]
  return [10, 15]
}

/** Plain-language read of where the weight data sits right now: birth-weight
 *  recovery phase, current percentile vs Fenton, recent gain rate vs expected. */
export function buildWeightNarrative({
  weights,
  birthDateIso,
  gestationalAgeWeeks,
  birthWeightGrams,
}: Args): WeightNarrative | null {
  if (weights.length === 0) {
    return {
      tone: 'neutral',
      headline: 'No weights logged yet',
      detail: 'Add her first weight from Trends → Weight to start tracking the trend.',
    }
  }

  const sorted = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const latest = sorted[sorted.length - 1]
  const latestDate = new Date(latest.recorded_at)
  const day = daysSinceBirth(birthDateIso, latestDate)
  const pma = pmaAt(birthDateIso, gestationalAgeWeeks, latestDate)
  const grams = latest.weight_grams
  const deltaFromBirth = grams - birthWeightGrams

  // ─── Birth-weight recovery phase ────────────────────────────────────
  const everRegained = sorted.some((w) => w.weight_grams >= birthWeightGrams && w.id !== sorted[0].id)
  if (!everRegained && day < 21) {
    const lossPct = ((birthWeightGrams - grams) / birthWeightGrams) * 100
    if (day < 7) {
      return {
        tone: 'neutral',
        headline: `Day ${day} · ${Math.abs(deltaFromBirth)} g below birth weight`,
        detail:
          `Some birth-weight loss in the first week is normal (around 5–10%). ` +
          `She's down about ${lossPct.toFixed(1)}%. The recovery curve usually starts around day 5–7.`,
      }
    }
    if (day < 14) {
      const recent = rollingGain(sorted, 4)
      const gainingNow = recent !== null && recent > 0
      return {
        tone: gainingNow ? 'positive' : 'neutral',
        headline: gainingNow
          ? `Day ${day} · climbing back, ${Math.abs(deltaFromBirth)} g to go`
          : `Day ${day} · still ${Math.abs(deltaFromBirth)} g below birth weight`,
        detail: gainingNow
          ? `Gaining steadily over the last few days. Most preemies recover their birth weight by day 14–21.`
          : `She's in the regain phase. Most preemies recover their birth weight by day 14–21, with the curve usually picking up around day 7.`,
      }
    }
    return {
      tone: 'concern',
      headline: `Day ${day} · still ${Math.abs(deltaFromBirth)} g below birth weight`,
      detail:
        `Most preemies have recovered their birth weight by day 14–21. Worth flagging at her next visit ` +
        `if the regain hasn't picked up by then.`,
    }
  }

  // ─── Past birth weight — describe trajectory + percentile ─────────────
  const pct = approxPercentile(pma, grams)
  const gain7 = rollingGain(sorted, 7)
  const [gMin, gMax] = expectedRange(pma, day)

  // Find percentile a week ago for trajectory comparison
  const weekAgo = sorted.find((w) => {
    const d = (latestDate.getTime() - new Date(w.recorded_at).getTime()) / 86_400_000
    return d >= 5 && d <= 9
  })
  const weekAgoPct = weekAgo
    ? approxPercentile(pmaAt(birthDateIso, gestationalAgeWeeks, new Date(weekAgo.recorded_at)), weekAgo.weight_grams)
    : null

  const sinceBirthDays = day
  const sinceBirthGain = sinceBirthDays > 0 ? Math.round(deltaFromBirth) : 0

  // Headline picks the "biggest news"
  let headline: string
  if (deltaFromBirth >= 0 && deltaFromBirth < 100) {
    headline = `Just past birth weight · ${grams} g`
  } else if (deltaFromBirth > 0) {
    headline = `${grams} g · ${sinceBirthGain >= 0 ? '+' : ''}${sinceBirthGain} g since birth`
  } else {
    headline = `${grams} g`
  }

  // Detail: describe percentile + trajectory + recent gain rate
  const parts: string[] = []

  if (pct !== null) {
    if (weekAgoPct !== null && Math.abs(pct - weekAgoPct) >= 5) {
      if (pct > weekAgoPct) {
        parts.push(`Climbed from about the ${weekAgoPct}th to the ${pct}th percentile over the last week — strong catch-up growth.`)
      } else {
        parts.push(`Slipped from the ${weekAgoPct}th to about the ${pct}th percentile over the last week. Worth a closer look at the next weigh-in.`)
      }
    } else {
      parts.push(
        `Tracking around the ${pct}th percentile of preterm girls her PMA. ` +
          (pct < 25
            ? `Common for preemies, especially those born smaller.`
            : pct < 75
              ? `Comfortably in the typical range.`
              : `In the upper range for her age.`),
      )
    }
  }

  if (gain7 !== null) {
    const formatted = gain7 >= 0 ? `+${gain7.toFixed(1)}` : gain7.toFixed(1)
    if (gain7 >= gMin && gain7 <= gMax) {
      parts.push(`Last 7 days: ${formatted} g/kg/day, right in the ${gMin}–${gMax} range expected for her age.`)
    } else if (gain7 > gMax) {
      parts.push(`Last 7 days: ${formatted} g/kg/day, above the ${gMin}–${gMax} expected band — often catch-up growth.`)
    } else if (gain7 >= gMin - 3) {
      parts.push(`Last 7 days: ${formatted} g/kg/day, just under the ${gMin}–${gMax} expected band.`)
    } else {
      parts.push(`Last 7 days: ${formatted} g/kg/day, below the ${gMin}–${gMax} expected band. Worth flagging at her next visit if the trend persists.`)
    }
  }

  // Tone from gain vs band, biased positive when in or above
  const tone: WeightNarrative['tone'] =
    gain7 === null
      ? 'neutral'
      : gain7 >= gMax + 5
        ? 'celebrate'
        : gain7 >= gMin
          ? 'positive'
          : gain7 >= gMin - 3
            ? 'neutral'
            : 'concern'

  return { tone, headline, detail: parts.join(' ') }
}
