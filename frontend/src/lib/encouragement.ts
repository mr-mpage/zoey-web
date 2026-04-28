import type { Dashboard } from '../api/types'

export type EncouragementTone = 'celebrate' | 'positive' | 'neutral' | 'concern'

export type Encouragement = {
  tone: EncouragementTone
  text: string
}

/** Plain-language status line for the Today screen.
 *  Aim: 1–2 sentences, conversational, action-oriented. */
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

  // No daily target set yet
  if (target === 0) {
    return {
      tone: 'neutral',
      text: 'Set her current weight in Settings to unlock the daily target.',
    }
  }

  // Day not started
  if (feedsDone === 0) {
    return {
      tone: 'neutral',
      text: `Day's just starting. Aim for around ${next.toFixed(0)} ml on her first feed.`,
    }
  }

  // Day complete
  if (remaining === 0) {
    if (total >= target) {
      return {
        tone: 'celebrate',
        text: `All 8 feeds done, target reached. Great work today.`,
      }
    }
    if (absGap <= target * 0.05) {
      return {
        tone: 'positive',
        text: `All feeds done — landed right on target. Nicely paced day.`,
      }
    }
    return {
      tone: 'neutral',
      text: `All feeds done. ${absGap.toFixed(0)} ml under target — tomorrow's a fresh start.`,
    }
  }

  // Last feed of the day
  if (remaining === 1) {
    if (gap < -target * 0.1) {
      return {
        tone: 'concern',
        text: `Last feed of the day. She's ${absGap.toFixed(0)} ml short — try ${next.toFixed(0)} ml, but don't force it if she's done.`,
      }
    }
    if (gap > target * 0.1) {
      return {
        tone: 'positive',
        text: `Last feed — she's already ahead. ${next.toFixed(0)} ml is plenty to close out.`,
      }
    }
    return {
      tone: 'positive',
      text: `Last feed coming up. About ${next.toFixed(0)} ml will land her on target.`,
    }
  }

  // Mid-day, behind significantly (>15% of daily target)
  if (gap < -target * 0.15) {
    return {
      tone: 'concern',
      text: `Behind by ${absGap.toFixed(0)} ml. Aim for ${next.toFixed(0)} ml on the next feed and see how she takes it — never force.`,
    }
  }

  // Mid-day, slightly behind
  if (gap < -target * 0.05) {
    return {
      tone: 'neutral',
      text: `Slightly under pace, still well within range. About ${next.toFixed(0)} ml next will help close the gap.`,
    }
  }

  // Mid-day, well ahead
  if (gap > target * 0.15) {
    return {
      tone: 'positive',
      text: `Well ahead of pace — she's eating well today. ${next.toFixed(0)} ml is plenty for the next feed.`,
    }
  }

  // Mid-day, slightly ahead
  if (gap > target * 0.05) {
    return {
      tone: 'positive',
      text: `Ahead of pace, doing great. Around ${next.toFixed(0)} ml on the next feed is fine.`,
    }
  }

  // Right on pace — sometimes mention if last feed was unusual
  if (last && last.comparison.sample_days > 0 && last.status !== 'normal') {
    if (last.status === 'below') {
      return {
        tone: 'neutral',
        text: `On pace overall. Her last feed was a bit small — about ${next.toFixed(0)} ml next would even things out.`,
      }
    }
    return {
      tone: 'positive',
      text: `On pace and her last feed was strong. About ${next.toFixed(0)} ml next.`,
    }
  }

  return {
    tone: 'positive',
    text: `On pace and in her usual rhythm. Around ${next.toFixed(0)} ml on the next feed.`,
  }
}
