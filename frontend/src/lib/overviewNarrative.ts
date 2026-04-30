import type { Overview, OverviewIndicator } from '../api/types'

/** Plain-language paragraph that answers "how is she doing?" — woven from the
 *  same indicators rendered as supporting cards underneath. Status-grouped:
 *  open with a tone-appropriate hook, list the positives, then watches and
 *  concerns. Keeps each indicator's verb specific so it doesn't read like a
 *  template. */
export function buildOverviewNarrative(o: Overview): string {
  const inds = o.indicators
  const concerns = inds.filter((i) => i.status === 'concern')
  const watches = inds.filter((i) => i.status === 'watch')
  const goods = inds.filter((i) => i.status === 'good' || i.status === 'over')
  const known = concerns.length + watches.length + goods.length

  if (known === 0) {
    return o.summary.text
  }

  // Opening sentence
  let opener: string
  if (concerns.length === 0 && watches.length === 0) {
    opener = goods.length >= 3 ? "She's doing brilliantly." : "Things are looking good."
  } else if (concerns.length === 0) {
    opener = goods.length > watches.length ? 'Mostly looking good.' : 'A mixed week so far.'
  } else if (concerns.length >= 2) {
    opener = 'A couple of things worth raising with the doctor this week.'
  } else {
    opener = "Mostly fine, with one thing to flag."
  }

  const sentences: string[] = [opener]

  // Goods
  if (goods.length > 0) {
    const good = listJoin(goods.map(phraseGood))
    sentences.push(capFirst(`${good}.`))
  }

  // Watches
  if (watches.length > 0) {
    const watch = listJoin(watches.map(phraseWatch))
    sentences.push(`Worth watching: ${watch}.`)
  }

  // Concerns
  if (concerns.length > 0) {
    const concern = listJoin(concerns.map(phraseConcern))
    sentences.push(`Flag at her next visit: ${concern}.`)
  }

  return sentences.join(' ')
}

/** Phrasing per (key, status). Verbs vary so the joined paragraph reads as
 *  a sentence rather than a template fill-in. */

function phraseGood(i: OverviewIndicator): string {
  switch (i.key) {
    case 'intake':
      return i.status === 'over'
        ? 'her intake is above target (often catch-up)'
        : 'her intake is comfortably in the target zone'
    case 'growth':
      return i.status === 'over'
        ? 'she is gaining strongly'
        : 'her growth is right where you would want it for her age'
    case 'today_pace':
      return i.status === 'over'
        ? 'she is eating ahead of pace today'
        : 'today is right on rhythm'
    case 'hydration':
      return i.status === 'over'
        ? 'hydration is on the high side'
        : 'hydration looks healthy'
    case 'vitals':
      return 'her heart rate and SpO₂ look comfortable'
    default:
      return i.headline.toLowerCase()
  }
}

function phraseWatch(i: OverviewIndicator): string {
  switch (i.key) {
    case 'intake':
      return 'intake has been trending under target'
    case 'growth':
      return 'gain has slowed a bit'
    case 'today_pace':
      return 'today is running behind'
    case 'hydration':
      return 'wet-diaper count is on the lower side'
    case 'vitals':
      return 'SpO₂ has dipped a little this week'
    default:
      return i.headline.toLowerCase()
  }
}

function phraseConcern(i: OverviewIndicator): string {
  switch (i.key) {
    case 'intake':
      return 'intake is well below the target zone'
    case 'growth':
      return 'gain has slipped below the expected range'
    case 'today_pace':
      return 'today is well behind pace'
    case 'hydration':
      return 'wet-diaper count is low'
    case 'vitals':
      return 'SpO₂ has dipped below 90% on at least one day'
    default:
      return i.headline.toLowerCase()
  }
}

function listJoin(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
