import type { Dashboard } from '../api/types'

export type EncouragementTone = 'celebrate' | 'positive' | 'neutral' | 'concern'

export type Encouragement = {
  tone: EncouragementTone
  text: string
}

/** Stable per-day rotation: same branch+day picks the same phrasing all day. */
function pickStable(dayKey: string, branch: string, options: string[]): string {
  let h = 0
  const seed = `${dayKey}|${branch}`
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return options[Math.abs(h) % options.length]
}

/** Plain-language status line for the Today screen. */
export function buildEncouragement(d: Dashboard): Encouragement {
  const feedsDone = d.feeds_today.length
  const remaining = d.feeds_remaining
  const target = d.daily_target_ml
  const total = d.feeds_total_ml
  const gap = d.gap_ml
  const absGap = Math.abs(gap)
  const nf = d.next_feed
  const next = nf?.target_ml ?? d.per_feed_target_ml
  const last = feedsDone > 0 ? d.feeds_today[feedsDone - 1] : null
  const dayKey = d.today_date

  if (target === 0) {
    return { tone: 'neutral', text: 'Set her current weight in Settings to unlock the daily target.' }
  }

  if (feedsDone === 0) {
    return {
      tone: 'neutral',
      text: pickStable(dayKey, 'start', [
        `Day's just starting. Aim for around ${next.toFixed(0)} ml on her first feed.`,
        `Fresh day. ${next.toFixed(0)} ml is a good first-feed target.`,
        `Morning. Around ${next.toFixed(0)} ml to get going.`,
      ]),
    }
  }

  if (remaining === 0) {
    if (total >= target) {
      return {
        tone: 'celebrate',
        text: pickStable(dayKey, 'done-hit', [
          `All 8 feeds done, target reached. Great work today.`,
          `Target hit, all feeds in. Lovely job.`,
          `Day complete and over the line. Nicely done.`,
        ]),
      }
    }
    if (absGap <= target * 0.05) {
      return {
        tone: 'positive',
        text: pickStable(dayKey, 'done-close', [
          `All feeds done — landed right on target. Nicely paced day.`,
          `Day complete, basically on target. Well paced.`,
        ]),
      }
    }
    return {
      tone: 'neutral',
      text: pickStable(dayKey, 'done-under', [
        `All feeds done. ${absGap.toFixed(0)} ml under target — tomorrow's a fresh start.`,
        `Day's wrapped, ${absGap.toFixed(0)} ml short of target. Reset and go again tomorrow.`,
      ]),
    }
  }

  if (remaining === 1) {
    if (gap < -target * 0.1) {
      return {
        tone: 'concern',
        text: pickStable(dayKey, 'last-behind', [
          `Last feed of the day. She's ${absGap.toFixed(0)} ml short — try ${next.toFixed(0)} ml, but don't force it if she's done.`,
          `One feed left. ${absGap.toFixed(0)} ml behind — aim for ${next.toFixed(0)} ml, ok to let her stop when full.`,
        ]),
      }
    }
    if (gap > target * 0.1) {
      return {
        tone: 'positive',
        text: pickStable(dayKey, 'last-ahead', [
          `Last feed — she's already ahead. ${next.toFixed(0)} ml is plenty to close out.`,
          `One to go and you're already past target. ${next.toFixed(0)} ml will do it.`,
        ]),
      }
    }
    return {
      tone: 'positive',
      text: pickStable(dayKey, 'last-on', [
        `Last feed coming up. About ${next.toFixed(0)} ml will land her on target.`,
        `One to go. ${next.toFixed(0)} ml gets her there.`,
      ]),
    }
  }

  if (gap < -target * 0.15) {
    return {
      tone: 'concern',
      text: pickStable(dayKey, 'behind-big', [
        `Behind by ${absGap.toFixed(0)} ml. Aim for ${next.toFixed(0)} ml on the next feed and see how she takes it — never force.`,
        `${absGap.toFixed(0)} ml short. Try ${next.toFixed(0)} ml next, but only what she'll take comfortably.`,
      ]),
    }
  }

  if (gap < -target * 0.05) {
    return {
      tone: 'neutral',
      text: pickStable(dayKey, 'behind-small', [
        `Slightly under pace, still well within range. About ${next.toFixed(0)} ml next will help close the gap.`,
        `A bit under pace. ${next.toFixed(0)} ml next should bring her back.`,
      ]),
    }
  }

  if (gap > target * 0.15) {
    return {
      tone: 'positive',
      text: pickStable(dayKey, 'ahead-big', [
        `Well ahead of pace — she's eating well today. ${next.toFixed(0)} ml is plenty for the next feed.`,
        `She's eating strongly. ${next.toFixed(0)} ml is fine, no need to push.`,
      ]),
    }
  }

  if (gap > target * 0.05) {
    return {
      tone: 'positive',
      text: pickStable(dayKey, 'ahead-small', [
        `Ahead of pace, doing great. Around ${next.toFixed(0)} ml on the next feed is fine.`,
        `Slightly ahead. ${next.toFixed(0)} ml next is comfortable.`,
      ]),
    }
  }

  if (last && last.comparison && last.comparison.sample_days > 0 && last.status !== 'normal') {
    if (last.status === 'below') {
      return {
        tone: 'neutral',
        text: pickStable(dayKey, 'on-pace-low-last', [
          `On pace overall. Her last feed was a bit small — about ${next.toFixed(0)} ml next would even things out.`,
          `Pace is fine. Last feed was light, so ${next.toFixed(0)} ml next would balance.`,
        ]),
      }
    }
    return {
      tone: 'positive',
      text: pickStable(dayKey, 'on-pace-high-last', [
        `On pace and her last feed was strong. About ${next.toFixed(0)} ml next.`,
        `Solid feed last time and on pace. ${next.toFixed(0)} ml next.`,
      ]),
    }
  }

  return {
    tone: 'positive',
    text: pickStable(dayKey, 'on-pace', [
      `On pace and in her usual rhythm. Around ${next.toFixed(0)} ml on the next feed.`,
      `Right on pace. ${next.toFixed(0)} ml next continues the rhythm.`,
      `Steady progress. ${next.toFixed(0)} ml next.`,
    ]),
  }
}
