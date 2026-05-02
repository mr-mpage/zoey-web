import type { Dashboard } from '../api/types'
import { PARENT_NAMES } from './branding'

export type EncouragementTone = 'celebrate' | 'positive' | 'neutral' | 'concern'

export type Encouragement = {
  tone: EncouragementTone
  text: string
}

export type Audience = 'self' | 'viewer'

/** Stable per (day + branch + recent activity) rotation. Including feedsDone
 *  and the last feed's id means the phrase changes after every new feed,
 *  giving variety without flicker mid-glance. */
function pickStable(seed: string, options: string[]): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return options[Math.abs(h) % options.length]
}

/** Plain language status line for the Today screen. Tone calibrated by
 *  pace tier so it matches the chip below: warm and celebratory when on
 *  track or ahead, gently encouraging when slightly under, firm but kind
 *  when well behind, and never punitive at end of day. */
export function buildEncouragement(d: Dashboard): Encouragement {
  const feedsDone = d.feeds_today.filter((f) => !f.is_extra).length
  const remaining = d.feeds_remaining
  const target = d.daily_target_ml
  const total = d.feeds_total_ml
  const gap = d.gap_ml
  const absGap = Math.abs(gap)
  const pace = d.pace_status
  const nf = d.next_feed
  const next = nf?.target_ml ?? d.per_feed_target_ml
  const last = feedsDone > 0 ? d.feeds_today[feedsDone - 1] : null
  const lastId = last?.id ?? 0

  const seedBase = `${d.today_date}|${feedsDone}|${lastId}`
  const seedFor = (branch: string) => `${seedBase}|${branch}`

  if (target === 0) {
    return { tone: 'neutral', text: 'Add her current weight in Settings to unlock the daily target.' }
  }

  if (feedsDone === 0) {
    return {
      tone: 'neutral',
      text: pickStable(seedFor('start'), [
        `Fresh start. About ${next.toFixed(0)} ml is a nice first feed.`,
        `Good morning. Aim for around ${next.toFixed(0)} ml to kick things off.`,
        `New day, new feeds. ${next.toFixed(0)} ml is a good opener.`,
        `Hello, day! ${next.toFixed(0)} ml or so on her first bottle.`,
        `Let's go. Around ${next.toFixed(0)} ml to start the rhythm.`,
        `Off we go. ${next.toFixed(0)} ml is a comfortable first target.`,
      ]),
    }
  }

  if (remaining === 0) {
    if (total >= target) {
      return {
        tone: 'celebrate',
        text: pickStable(seedFor('done-hit'), [
          `All ${feedsDone} feeds done and target hit. Beautiful work today.`,
          `Day complete and over the line. Great job, both of you.`,
          `Target reached, every feed in. Lovely day.`,
          `Done and dusted, comfortably past target. Well done.`,
          `${feedsDone} feeds, target met. She did brilliantly.`,
          `Closing the day strong. Well fed, well done.`,
        ]),
      }
    }
    if (absGap <= target * 0.05) {
      return {
        tone: 'positive',
        text: pickStable(seedFor('done-close'), [
          `All feeds in and basically right on target. Lovely paced day.`,
          `Day's wrapped, landed almost exactly on target. Nicely done.`,
          `Done, and within a whisker of target. Great pacing.`,
          `Final feed in. Within a few ml of target, that counts.`,
        ]),
      }
    }
    return {
      tone: 'neutral',
      text: pickStable(seedFor('done-under'), [
        `That's the day done. ${absGap.toFixed(0)} ml shy of target, fresh start tomorrow.`,
        `All feeds in. ${absGap.toFixed(0)} ml under, but she ate what she could.`,
        `Day's wrapped. A little under today, no drama, reset tomorrow.`,
        `Done. ${absGap.toFixed(0)} ml short, but every feed counted. Onward.`,
      ]),
    }
  }

  // Pace tier buckets
  const isWellBehind = pace === 'well_behind'
  const isBehind = pace === 'behind'
  const isSlightlyBehind = pace === 'slightly_behind'
  const isWellAhead = pace === 'well_ahead'
  const isAhead = pace === 'ahead'
  const isSlightlyAhead = pace === 'slightly_ahead'

  // Last feed of the day
  if (remaining === 1) {
    if (isWellBehind) {
      return {
        tone: 'concern',
        text: pickStable(seedFor('last-well-behind'), [
          `Last feed and ${absGap.toFixed(0)} ml short. Aim for ${next.toFixed(0)} ml, gently. Never force her.`,
          `One feed to go, ${absGap.toFixed(0)} ml under. Try ${next.toFixed(0)} ml, but only what she'll take.`,
          `Closing feed. She's well behind today. ${next.toFixed(0)} ml is the goal, ease into it.`,
        ]),
      }
    }
    if (isBehind || isSlightlyBehind) {
      return {
        tone: isBehind ? 'concern' : 'neutral',
        text: pickStable(seedFor('last-behind'), [
          `Last feed of the day. She's ${absGap.toFixed(0)} ml short, ${next.toFixed(0)} ml would be lovely if she'll take it.`,
          `One to go. ${absGap.toFixed(0)} ml behind, try ${next.toFixed(0)} ml and let her tell you when she's done.`,
          `Final feed. Aim for around ${next.toFixed(0)} ml, no pressure if she stops earlier.`,
          `Almost there. ${next.toFixed(0)} ml on this last one, she'll do what she can.`,
        ]),
      }
    }
    if (isWellAhead || isAhead || isSlightlyAhead) {
      return {
        tone: 'positive',
        text: pickStable(seedFor('last-ahead'), [
          `Last feed and she's already ahead! ${next.toFixed(0)} ml is plenty to close out.`,
          `One to go and target's already in the bag. ${next.toFixed(0)} ml is fine.`,
          `Final feed of a strong day. ${next.toFixed(0)} ml will do it nicely.`,
          `Closing feed. She crushed today, ${next.toFixed(0)} ml is comfortable.`,
        ]),
      }
    }
    return {
      tone: 'positive',
      text: pickStable(seedFor('last-on'), [
        `Last feed coming up. About ${next.toFixed(0)} ml lands her right on target.`,
        `One to go. ${next.toFixed(0)} ml gets her there.`,
        `Final feed of a well paced day. Around ${next.toFixed(0)} ml.`,
        `Almost done. ${next.toFixed(0)} ml on this one closes it out.`,
      ]),
    }
  }

  // Mid day, by pace tier
  if (isWellBehind) {
    return {
      tone: 'concern',
      text: pickStable(seedFor('mid-well-behind'), [
        `She's ${absGap.toFixed(0)} ml behind right now. Let's nudge the next feed up to ${next.toFixed(0)} ml if she'll take it. Never force.`,
        `Quite a gap today, ${absGap.toFixed(0)} ml short. Aim for ${next.toFixed(0)} ml next and watch how she handles it.`,
        `${absGap.toFixed(0)} ml under pace. Try ${next.toFixed(0)} ml on the next bottle, but only what's comfortable.`,
        `She needs to catch up a bit. ${next.toFixed(0)} ml on the next feed if she's willing.`,
      ]),
    }
  }
  if (isBehind) {
    return {
      tone: 'concern',
      text: pickStable(seedFor('mid-behind'), [
        `A bit behind, ${absGap.toFixed(0)} ml under. ${next.toFixed(0)} ml next will start to bring her back.`,
        `She's ${absGap.toFixed(0)} ml short of pace. Aim for ${next.toFixed(0)} ml and see how it goes.`,
        `Falling slightly behind. ${next.toFixed(0)} ml on the next one should help.`,
        `${absGap.toFixed(0)} ml under, totally fine to make up. Try ${next.toFixed(0)} ml next.`,
      ]),
    }
  }
  if (isSlightlyBehind) {
    return {
      tone: 'neutral',
      text: pickStable(seedFor('mid-slight-behind'), [
        `Just a touch behind, no worries. ${next.toFixed(0)} ml next should sort it.`,
        `Tiny gap, easy to close. Around ${next.toFixed(0)} ml next.`,
        `Slightly under pace, well within range. ${next.toFixed(0)} ml will balance things.`,
        `A whisker behind. ${next.toFixed(0)} ml next keeps her in rhythm.`,
      ]),
    }
  }

  if (isWellAhead) {
    return {
      tone: 'positive',
      text: pickStable(seedFor('mid-well-ahead'), [
        `She's eating brilliantly today, well ahead. ${next.toFixed(0)} ml is plenty next.`,
        `Going strong, ${absGap.toFixed(0)} ml past pace. ${next.toFixed(0)} ml on the next, no need to push.`,
        `Big appetite today. ${next.toFixed(0)} ml is more than enough next.`,
        `Way ahead of pace. ${next.toFixed(0)} ml comfortably gets her to the finish.`,
      ]),
    }
  }
  if (isAhead) {
    return {
      tone: 'positive',
      text: pickStable(seedFor('mid-ahead'), [
        `Nicely ahead of pace today. ${next.toFixed(0)} ml is fine next.`,
        `Eating well, ${absGap.toFixed(0)} ml past target so far. ${next.toFixed(0)} ml next.`,
        `She's having a strong day. ${next.toFixed(0)} ml on the next is plenty.`,
        `Ahead and rolling. About ${next.toFixed(0)} ml next.`,
      ]),
    }
  }
  if (isSlightlyAhead) {
    return {
      tone: 'positive',
      text: pickStable(seedFor('mid-slight-ahead'), [
        `Just ahead of pace, doing great. Around ${next.toFixed(0)} ml next.`,
        `Slightly past pace, lovely rhythm. ${next.toFixed(0)} ml next is comfortable.`,
        `She's a touch ahead. ${next.toFixed(0)} ml next keeps the flow.`,
        `Right where you'd want her. ${next.toFixed(0)} ml on the next.`,
      ]),
    }
  }

  // pace === 'on_track': nuance off the last feed badge if available
  if (last && last.comparison && last.comparison.sample_days > 0 && last.status !== 'normal') {
    if (last.status === 'below') {
      return {
        tone: 'neutral',
        text: pickStable(seedFor('on-pace-low-last'), [
          `On pace, last feed was a bit light. ${next.toFixed(0)} ml next would even things out.`,
          `Pace is fine. Last bottle was small for that slot, ${next.toFixed(0)} ml next would balance.`,
          `Holding pace. Last feed was on the low side, ${next.toFixed(0)} ml will sort it.`,
          `Steady so far. Last one was light, around ${next.toFixed(0)} ml next.`,
        ]),
      }
    }
    return {
      tone: 'positive',
      text: pickStable(seedFor('on-pace-high-last'), [
        `On pace and her last feed was lovely. About ${next.toFixed(0)} ml next.`,
        `Solid bottle last time, right on pace. ${next.toFixed(0)} ml on the next.`,
        `Strong last feed and pace is right. ${next.toFixed(0)} ml next.`,
        `Pace is good, last feed was strong. Around ${next.toFixed(0)} ml next.`,
      ]),
    }
  }

  return {
    tone: 'positive',
    text: pickStable(seedFor('on-pace'), [
      `Right on pace and in her rhythm. About ${next.toFixed(0)} ml next.`,
      `Steady as she goes. ${next.toFixed(0)} ml on the next feed.`,
      `Lovely pacing today. Around ${next.toFixed(0)} ml next.`,
      `Right where she should be. ${next.toFixed(0)} ml next continues it.`,
      `On track and looking comfortable. ${next.toFixed(0)} ml next.`,
      `Smooth rhythm today. ${next.toFixed(0)} ml on the next.`,
    ]),
  }
}

/** Warm third-person line for read-only viewers (grandparents, doctors).
 *  Same branching as buildEncouragement but no clinical pace numbers, no
 *  next-feed targets, no "aim for" coaching. Honest about lighter-eating
 *  days without being alarming. */
export function buildViewerEncouragement(d: Dashboard): Encouragement {
  const feedsDone = d.feeds_today.filter((f) => !f.is_extra).length
  const remaining = d.feeds_remaining
  const target = d.daily_target_ml
  const total = d.feeds_total_ml
  const absGap = Math.abs(d.gap_ml)
  const pace = d.pace_status
  const last = feedsDone > 0 ? d.feeds_today[feedsDone - 1] : null
  const lastId = last?.id ?? 0

  const seedBase = `${d.today_date}|${feedsDone}|${lastId}|view`
  const seedFor = (branch: string) => `${seedBase}|${branch}`

  if (target === 0) {
    return { tone: 'neutral', text: 'Just getting set up for today.' }
  }

  if (feedsDone === 0) {
    return {
      tone: 'neutral',
      text: pickStable(seedFor('start'), [
        'A fresh day for Zoey is just getting started.',
        "Today's just beginning for Zoey.",
        'Quiet morning so far. The day is just starting.',
      ]),
    }
  }

  if (remaining === 0) {
    if (total >= target) {
      return {
        tone: 'celebrate',
        text: pickStable(seedFor('done-hit'), [
          'A lovely eating day for Zoey. All her feeds are done.',
          'Zoey ate beautifully today and is all done.',
          'A strong day for Zoey, comfortably through all her feeds.',
        ]),
      }
    }
    if (absGap <= target * 0.05) {
      return {
        tone: 'positive',
        text: pickStable(seedFor('done-close'), [
          "Zoey's done for the day, right where she should be.",
          'A nicely paced day. All her feeds in.',
          "All wrapped up for today, right on her usual.",
        ]),
      }
    }
    return {
      tone: 'neutral',
      text: pickStable(seedFor('done-under'), [
        'A lighter eating day for Zoey today. She is settled now, fresh start tomorrow.',
        "Zoey's done for today. A quieter day for her appetite, but every feed counts.",
        'All her feeds in, just a quieter day at the bottle. Tomorrow is a new one.',
      ]),
    }
  }

  const isWellBehind = pace === 'well_behind'
  const isBehind = pace === 'behind'
  const isSlightlyBehind = pace === 'slightly_behind'
  const isWellAhead = pace === 'well_ahead'
  const isAhead = pace === 'ahead'
  const isSlightlyAhead = pace === 'slightly_ahead'

  if (remaining === 1) {
    if (isWellBehind || isBehind) {
      return {
        tone: 'concern',
        text: pickStable(seedFor('last-behind'), [
          `Zoey's last feed of the day coming up. A quieter eating day than usual, ${PARENT_NAMES} are watching how she takes it.`,
          "One feed left for Zoey today. She's been a bit lighter than her usual.",
          "Last feed coming up. Today has been a slower one for her appetite.",
        ]),
      }
    }
    if (isSlightlyBehind) {
      return {
        tone: 'neutral',
        text: pickStable(seedFor('last-slight-behind'), [
          'One feed to go for Zoey. Just a touch under her usual today.',
          "Last feed coming up. Zoey is a small bit behind her rhythm, easy to round out.",
        ]),
      }
    }
    if (isWellAhead || isAhead || isSlightlyAhead) {
      return {
        tone: 'positive',
        text: pickStable(seedFor('last-ahead'), [
          "Last feed coming up, and Zoey has already met her target. A strong day at the bottle.",
          "One to go for Zoey. She's eaten well today, comfortably past target.",
          "Last feed of the day. Zoey has been tucking in beautifully.",
        ]),
      }
    }
    return {
      tone: 'positive',
      text: pickStable(seedFor('last-on'), [
        "Zoey's last feed of the day is on its way. She's been right in her rhythm.",
        'Almost done for the day. Zoey has been eating just as expected.',
      ]),
    }
  }

  if (isWellBehind) {
    return {
      tone: 'concern',
      text: pickStable(seedFor('mid-well-behind'), [
        `A quieter eating day for Zoey so far. ${PARENT_NAMES} are keeping a close eye on it.`,
        "Zoey has been lighter than usual at the bottle today. Plenty of time still to come.",
        "Today is a slower one for Zoey's appetite. The day isn't over yet.",
      ]),
    }
  }
  if (isBehind) {
    return {
      tone: 'concern',
      text: pickStable(seedFor('mid-behind'), [
        "A slightly slower start to the day for Zoey. Plenty of feeds still to come.",
        "Zoey is a bit under her usual rhythm today, but the day is still young.",
        "A quieter eating day so far for Zoey. No drama, just a slower start.",
      ]),
    }
  }
  if (isSlightlyBehind) {
    return {
      tone: 'neutral',
      text: pickStable(seedFor('mid-slight-behind'), [
        "Zoey's just a touch under her usual today. Nothing unusual.",
        "A slightly quieter day so far. Easy for Zoey to round out.",
        "Just a small bit under her rhythm today, no concern.",
      ]),
    }
  }
  if (isWellAhead) {
    return {
      tone: 'positive',
      text: pickStable(seedFor('mid-well-ahead'), [
        "Zoey is having a hungry day! Eating beautifully.",
        "A big appetite today. Zoey is tucking in well past her usual.",
        "Strong eating day for Zoey, well ahead of her rhythm.",
      ]),
    }
  }
  if (isAhead) {
    return {
      tone: 'positive',
      text: pickStable(seedFor('mid-ahead'), [
        "Zoey is having a strong day at the bottle.",
        "A nice eating day for Zoey, ahead of her usual.",
        "Tucking in well today, comfortably ahead of her rhythm.",
      ]),
    }
  }
  if (isSlightlyAhead) {
    return {
      tone: 'positive',
      text: pickStable(seedFor('mid-slight-ahead'), [
        "Zoey is eating just a touch ahead of her usual today. Lovely rhythm.",
        "A small bit ahead of her rhythm. Eating well.",
        "Zoey is right where you'd want her, with a touch extra.",
      ]),
    }
  }

  return {
    tone: 'positive',
    text: pickStable(seedFor('on-pace'), [
      "Zoey is right in her rhythm today. Eating just as expected.",
      "A steady day for Zoey at the bottle.",
      "Zoey is doing nicely today, right on her usual.",
      "Smooth day so far. Zoey is eating well.",
    ]),
  }
}
