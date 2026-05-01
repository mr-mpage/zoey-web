import { useState } from 'react'
import { useLogout } from '../api/hooks'
import { useIsReadOnly } from '../lib/authMode'

type Props = { open: boolean; onClose: () => void }

type Tone = 'emerald' | 'pink' | 'amber' | 'sky' | 'lime' | 'violet' | 'rose'

type Section = {
  id: string
  title: string
  blurb: string
  tone: Tone
  icon: React.ReactNode
  body: React.ReactNode
}

function H({ children }: { children: React.ReactNode }) {
  return <div className="text-pink-200 font-medium mb-1.5 mt-3 first:mt-0">{children}</div>
}

/** Per-tone classNames. Tailwind needs the literal class strings to be present
 *  in source for the JIT to keep them, hence this static lookup. */
const TONES: Record<Tone, { iconBg: string; iconFg: string; openBorder: string; openBg: string }> = {
  emerald: { iconBg: 'bg-emerald-300/15', iconFg: 'text-emerald-300', openBorder: 'border-emerald-400/40', openBg: 'bg-emerald-300/[0.04]' },
  pink:    { iconBg: 'bg-pink-300/15',    iconFg: 'text-pink-300',    openBorder: 'border-pink-400/40',    openBg: 'bg-pink-300/[0.04]' },
  amber:   { iconBg: 'bg-amber-300/15',   iconFg: 'text-amber-300',   openBorder: 'border-amber-400/40',   openBg: 'bg-amber-300/[0.04]' },
  sky:     { iconBg: 'bg-sky-300/15',     iconFg: 'text-sky-300',     openBorder: 'border-sky-400/40',     openBg: 'bg-sky-300/[0.04]' },
  lime:    { iconBg: 'bg-lime-300/15',    iconFg: 'text-lime-300',    openBorder: 'border-lime-400/40',    openBg: 'bg-lime-300/[0.04]' },
  violet:  { iconBg: 'bg-violet-300/15',  iconFg: 'text-violet-300',  openBorder: 'border-violet-400/40',  openBg: 'bg-violet-300/[0.04]' },
  rose:    { iconBg: 'bg-rose-300/15',    iconFg: 'text-rose-300',    openBorder: 'border-rose-400/40',    openBg: 'bg-rose-300/[0.04]' },
}

const ICON_PROPS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const Icons = {
  today: (
    <svg {...ICON_PROPS}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  bottle: (
    <svg {...ICON_PROPS}><path d="M9 3h6" /><path d="M10 3v3.5a3 3 0 0 1-.4 1.5l-1.2 2a4 4 0 0 0-.4 1.7V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.3a4 4 0 0 0-.4-1.7l-1.2-2A3 3 0 0 1 14 6.5V3" /><path d="M8 13h8" /></svg>
  ),
  diaper: (
    <svg {...ICON_PROPS}><path d="M3 7c4 6 14 6 18 0" /><path d="M3 7l2 9a3 3 0 0 0 3 2.5h8a3 3 0 0 0 3-2.5l2-9" /><path d="M9 12c1 1 5 1 6 0" /></svg>
  ),
  pump: (
    <svg {...ICON_PROPS}><path d="M12 3c3 4 5 7 5 10a5 5 0 1 1-10 0c0-3 2-6 5-10z" /></svg>
  ),
  growth: (
    <svg {...ICON_PROPS}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M7 16l4-5 3 3 5-7" /></svg>
  ),
  bell: (
    <svg {...ICON_PROPS}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
  ),
  shield: (
    <svg {...ICON_PROPS}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>
  ),
  pill: (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-30 12 12)" />
      <path d="M9.4 7.4l5.2 9" />
    </svg>
  ),
}

const EDIT_SECTIONS: Section[] = [
  {
    id: 'today',
    title: 'The Today screen',
    blurb: 'Progress ring, pace chip, status card, next feed.',
    tone: 'emerald',
    icon: Icons.today,
    body: (
      <>
        <H>What you see on Today</H>
        <ul className="space-y-1.5 list-disc pl-5">
          <li><b>Progress ring</b> — total fed today vs daily target (weight × ml/kg/day).</li>
          <li>
            <b>Pace chip</b> — seven tiers vs the expected pace so far:{' '}
            <span className="text-rose-300">well behind</span>{' / '}
            <span className="text-amber-300">behind</span>{' / '}
            <span className="text-yellow-300">slightly behind</span>{' / '}
            <span className="text-emerald-300">on track</span>{' / '}
            <span className="text-lime-300">slightly ahead</span>{' / '}
            <span className="text-sky-300">ahead</span>{' / '}
            <span className="text-sky-200">well ahead</span>.
            Boundaries are ±5% (on track), ±10% (slightly), and ±20% (well off) of expected-so-far.
            The on-track chip also shows the exact gap as a soft secondary number.
          </li>
          <li><b>7-day gain chip</b> — her weight gain rate vs what's expected for her current age.</li>
          <li><b>Status card</b> — plain-language summary of where you are and what to aim for next.</li>
          <li><b>Next feed card</b> — index, expected time (adaptive — slides with reality if a feed runs late),
            suggested amount, drift vs the rigid grid, and a day-fit projection so a slipping schedule doesn't
            quietly cost a feed.</li>
          <li><b>Today's feeds list</b> — each row is tap-able to edit. The badge tells you if that feed was
            unusual for that slot.</li>
        </ul>
        <H>Save confirmations & undo</H>
        <p>
          Every save flashes a brief green toast confirming what was logged. Every delete shows a 5-second
          amber toast with an <b>Undo</b> button that re-creates the entry exactly as it was — use it freely
          if you've tapped delete by accident.
        </p>
      </>
    ),
  },
  {
    id: 'feeds',
    title: 'Logging feeds',
    blurb: 'Comparison badges, breastfeeding, extras, day boundary.',
    tone: 'pink',
    icon: Icons.bottle,
    body: (
      <>
        <H>Comparison badges (↓ ≈ ↑)</H>
        <p className="mb-2">
          Each feed is compared against the same feed-of-day across the last 7 days — feed #4 today vs feed
          #4 on previous days, not the daily average.
        </p>
        <ul className="space-y-1 list-none pl-0">
          <li><span className="text-amber-300">↓ below avg</span> — &gt;15% under that slot's 7-day average.</li>
          <li><span className="text-emerald-300">≈ normal</span> — within ±15% of average.</li>
          <li><span className="text-sky-300">↑ above avg</span> — &gt;15% over average.</li>
          <li className="text-zinc-500">"no history" — first time we have data for that slot.</li>
        </ul>

        <H>Breastfeeding</H>
        <p className="mb-2">
          In the feed modal, toggle <b>Breast</b>. The ml field becomes an estimate (0 ml is fine for a
          comfort attempt) and a duration-in-minutes field appears. Breast feeds get a "BREAST · EST" chip,
          no row tint.
        </p>
        <p className="mb-2">
          Breast feeds <b>don't pollute the bottle averages</b> — comparison badges and the next-feed card
          historical avg only count bottle entries. The volume still adds to the daily total (with noted
          uncertainty), so the catch-up math reacts to it.
        </p>
        <p className="text-zinc-400 text-[11px]">
          Tip: if the breastfeed is in addition to a scheduled bottle, also toggle <b>Extra (off-schedule)</b>{' '}
          so it doesn't shift the slot numbering. If breast replaces a bottle, leave Extra off.
        </p>

        <H>Extra (off-schedule) feeds</H>
        <p>
          Top-up between regular feeds? Toggle <b>Extra (off-schedule)</b>. Extras count toward the daily
          total but don't shift feed-of-day numbering or pace expectations — so the comparison badge for the
          regular slot still reads as expected. Extras render with an "EXT" tag in amber.
        </p>

        <H>Starting the next day early</H>
        <p className="mb-2">
          When today's feeds are done, the Today screen shows a <b>Day complete</b> card with a{' '}
          <b>Start new day now</b> button. Tap to shift the day-start to right now.
          Reversible from Settings → Feeding schedule.
        </p>
        <p>
          For a single feed before today's anchor (e.g. 02:20 with a 02:30 anchor), log normally — a small
          dialog asks "first feed of today" or "extra at end of yesterday". Picking "first of today" tags
          only this one feed without touching the anchor.
        </p>
      </>
    ),
  },
  {
    id: 'diapers',
    title: 'Diapers',
    blurb: 'Tap +Wet / +Dirty; tap the count to edit notes.',
    tone: 'amber',
    icon: Icons.diaper,
    body: (
      <p>
        Tap <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Wet</span> or{' '}
        <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Dirty</span> to log instantly.
        The minus button undoes the most recent entry of that kind. Tap the <b>count number</b> to open
        today's list — you can add a note (e.g. "tiny", "explosive", "after fortifier feed") or delete an
        entry from there. Six wet diapers/day is the rough floor for adequate hydration; the Overview tab
        shows the rolling status.
      </p>
    ),
  },
  {
    id: 'meds',
    title: 'Meds',
    blurb: 'Daily checklist for iron, vitamin D, anything else.',
    tone: 'lime',
    icon: Icons.pill,
    body: (
      <>
        <H>Today's checklist</H>
        <p className="mb-2">
          Each med you've configured shows one row per scheduled dose. Tap a{' '}
          <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">pending</span> slot to log it
          at the current time — confirmation toast appears. Tap a completed{' '}
          <span className="text-emerald-300">✓</span> dose to adjust the time, add a note (e.g.
          "spit a bit up"), or delete it (with undo).
        </p>
        <p>
          Doses logged beyond the day's expected count are flagged{' '}
          <span className="text-amber-300">extra</span> in amber so they don't blend into routine
          completions.
        </p>

        <H>Logging extras and one-offs</H>
        <p>
          Below the checklist, <b>+ Log other / extra dose</b> opens a chooser. Pick an existing
          med to log another dose of it (auto-flagged extra once the daily count is reached), or{' '}
          <b>+ One-off</b> to type a free-text name for something not in the regular list (saline
          drops, gripe water, a one-time antibiotic). One-offs show as their own block on the day.
        </p>

        <H>Managing the list</H>
        <p>
          <b>Settings → Meds</b> is where you add, rename, change doses-per-day, or archive items.
          Use <b>0</b> doses-per-day for "as-needed" things — they stay loggable from the tab but
          don't take a checklist slot.  Archiving keeps historical doses readable; nothing is
          permanently deleted just because the routine changes.
        </p>

        <H>What it's for</H>
        <p>
          Forgetting a dose has real consequences (especially iron). The status-aware checklist
          gives you a one-look answer to "did we already give it?" without scanning the day's log.
          Pediatric meds tend to come in routines; this matches that.
        </p>
      </>
    ),
  },
  {
    id: 'pumps',
    title: 'Pumps',
    blurb: 'Supply vs intake balance, 7-day detail, edit on tap.',
    tone: 'sky',
    icon: Icons.pump,
    body: (
      <>
        <H>Supply vs intake balance</H>
        <p className="mb-2">
          Top of the Trends → Pumps tab shows three numbers: today's balance, the 4-day fridge cycle, and the
          rolling 7-day balance. Each is <b>pumped minus bottle-fed</b>: a positive balance (emerald)
          means more was pumped than Zoey drank from a bottle, so the fridge or freezer is building.
          A negative balance (amber) means stored milk is being drawn down.
        </p>
        <p className="mb-2">
          The 4-day window matches how long fresh milk keeps in the fridge: if that tile is positive,
          you're keeping up with day-to-day demand; if it's negative, dip into frozen.
        </p>
        <p className="mb-2">
          Breastfeeds aren't counted on either side, since they don't pass through the bottle supply.
        </p>

        <H>The 7-day chart</H>
        <p className="mb-2">
          One pair of bars per day: <span className="text-sky-300">sky</span> for pumped,{' '}
          <span className="text-pink-300">pink</span> for bottle-fed. Today's bars are full opacity, prior
          days are slightly faded. Visible gap between the two tells you that day's surplus or deficit at
          a glance.
        </p>

        <H>Detail list</H>
        <p>
          Last 7 days grouped by day, with each pump on its own row. Tap any pump to edit the amount,
          time, or notes, or to delete it.
        </p>
      </>
    ),
  },
  {
    id: 'weight',
    title: 'Weight & growth',
    blurb: 'Fenton 2025 chart, PMA-aware bands, trend colours.',
    tone: 'lime',
    icon: Icons.growth,
    body: (
      <>
        <H>Updating her weight</H>
        <p>
          Go to <b>Trends → Weight</b>. Tap <b>+ Add weight</b> to log a new entry, or tap any row to edit
          or delete. Enter the new weight in grams and (if it changed) the ml/kg/day rate. The daily target
          recalculates immediately; past-day rows keep using the weight current at the time.
        </p>

        <H>Fenton 2025 percentile chart</H>
        <p className="mb-2">
          On the Weight tab, the chart plots her weight history against the Fenton 2025 girls reference
          percentiles (3rd, 10th, 50th, 90th). The x-axis is <b>postmenstrual age (PMA)</b> — gestational
          age + how old she is — the standard way preterm growth is tracked.
        </p>
        <p>
          <b>Trajectory matters more than the absolute percentile.</b> The goal is for her line to stay
          roughly parallel to the reference lines (i.e. follow her own curve). It's normal for preemies to
          start at lower percentiles. The "What this chart means" panel under the chart has the full primer.
        </p>

        <H>Weight gain expectations (PMA-aware)</H>
        <p className="mb-2">Velocity decreases as she approaches term:</p>
        <ul className="space-y-1 list-none pl-0">
          <li>First 7 days: <b>0–12 g/kg/day</b> — birth-weight loss/regain</li>
          <li>Days 7–14: <b>8–16 g/kg/day</b> — building up</li>
          <li>PMA &lt; 30 weeks: <b>17–23 g/kg/day</b></li>
          <li>PMA 30–34 weeks: <b>15–20 g/kg/day</b></li>
          <li>PMA 34–38 weeks: <b>12–17 g/kg/day</b></li>
          <li>Term-equivalent (≥ 38 w): <b>10–15 g/kg/day</b></li>
        </ul>
        <p className="mt-2 text-zinc-400 text-[11px]">
          Reference: AAP/ESPGHAN 2022 + Fenton 2025. The Today gain chip and the Overview growth indicator
          both judge her against her current age bucket.
        </p>

        <H>Trend colours (ml/kg/day)</H>
        <ul className="space-y-1 list-none pl-0">
          <li><span className="text-rose-400">rose</span> — under 135 · genuinely low</li>
          <li><span className="text-amber-400">amber</span> — 135–150 · under target</li>
          <li><span className="text-lime-300">lime</span> — 150–160 · at minimum</li>
          <li><span className="text-emerald-300">emerald</span> — 160–180 · solidly in zone</li>
          <li><span className="text-sky-300">sky</span> — above 180 · often catch-up</li>
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500">
          All four edges editable in Settings → Colour bands. Today's row stays grey + "in progress" until
          the day ends.
        </p>
      </>
    ),
  },
  {
    id: 'vitals',
    title: 'Vitals',
    blurb: 'Heart rate and SpO₂ from the Owlet sock, and how to read them.',
    tone: 'rose',
    icon: Icons.shield,
    body: (
      <>
        <H>What the tab shows</H>
        <p>
          Per-day summaries of Zoey's heart rate and oxygen saturation while the Owlet sock is on.
          The top card is today, the week chart shows seven days at a glance, the per-day list is the
          detail. Owlet handles real-time alerting on its own; this view is for trends and patterns.
        </p>

        <H>The week chart</H>
        <p>
          One column per day. The thin grey bar is that day's heart-rate min–max range; the dot is
          the daily average. The faint green band across the chart marks the typical preterm/newborn
          range so you can see at a glance which days fell inside it.
        </p>

        <H>The SpO₂ sparkline</H>
        <p>
          Below the heart-rate chart, one bar per day showing the lowest sustained SpO₂ that day.
          The sock smooths short oxygen blips out of its own published value, so only persistent
          dips register. The lowest that <b>smoothed value</b> reached is what matters; the bar's colour reflects
          where it landed (see ranges below).
        </p>

        <H>Sessions and monitoring hours</H>
        <p>
          A session is a contiguous stretch of monitoring; "3 sessions, 14 h" means the sock was on
          for most of the day across three on-and-off periods. More monitoring hours = more reliable
          numbers. A day with 30 minutes of data is too thin to read into.
        </p>

        <H>Reference ranges</H>
        <ul className="space-y-1 list-none pl-0">
          <li><span className="text-emerald-300">HR avg 120–160 BPM</span> — typical preterm/newborn band</li>
          <li><span className="text-yellow-300">HR avg outside that</span> — context-dependent (sleep, crying, illness)</li>
          <li><span className="text-emerald-300">SpO₂ ≥ 92%</span> — in target window (CHOP consensus floor for ≥32w PMA)</li>
          <li><span className="text-yellow-300">SpO₂ 90–91%</span> — just below target, normal occasional dip</li>
          <li><span className="text-amber-300">SpO₂ 88–89%</span> — near standard alarm threshold, worth attention</li>
          <li><span className="text-rose-300">SpO₂ &lt; 88%</span> — at or below alarm threshold, worth raising at the next visit</li>
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500">
          Bands reflect general AAP newborn / NICU preterm guidance, not a clinical protocol. The
          doctor's thresholds always take precedence.
        </p>

        <H>The narrative card</H>
        <p>
          A short paragraph above the chart picks one read of the week and matches its tone — calm
          when nothing's off, watchful when SpO₂ has dipped, soft flag when it's persistently low.
          It's just the same numbers in plain English.
        </p>
      </>
    ),
  },
  {
    id: 'schedule',
    title: 'Schedule, reminders, reports',
    blurb: 'Anchor time, push notifications, doctor PDF.',
    tone: 'violet',
    icon: Icons.bell,
    body: (
      <>
        <H>Feeding schedule</H>
        <p className="mb-2">
          The feeding day runs from the anchor time (default <b>02:30</b>) to the same time the next morning,
          divided into <b>8 feeds</b> by default. Both are configurable in Settings → Feeding schedule.
          Feed #1 is the first feed at or after the anchor; the daily total resets at the anchor, not midnight.
        </p>
        <p className="text-zinc-400 text-[11px]">
          Don't change feeds-per-day unilaterally — that's a clinical decision. The setting exists so the
          app matches whatever the doctor recommends.
        </p>

        <H>Reminders</H>
        <p>
          Settings → Reminders enables push notifications 15 min before each scheduled feed, adapted to her
          actual rhythm. On iOS the app must be added to your Home Screen first. Treat as supplemental;
          phone alarms are still your primary safety net.
        </p>

        <H>Doctor visit report</H>
        <p>
          <b>Settings → Open report (last 14 days)</b> generates a printable summary: weight history with
          gains, daily intake (ml + ml/kg/day, breast attempts, diaper counts), and every feed note from
          the period. The page has Print / Save PDF and Close buttons. Tap Print on iOS to bring up the
          system share sheet for "Save to Files → PDF".
        </p>
      </>
    ),
  },
  {
    id: 'flags',
    title: 'What to watch for & privacy',
    blurb: 'Patterns worth raising; backup model.',
    tone: 'rose',
    icon: Icons.shield,
    body: (
      <>
        <H>What to watch for</H>
        <ul className="space-y-1.5 list-disc pl-5">
          <li>Status card amber ("Behind pace") → next-feed target bumps up. Try the suggested amount, but
            never force feed — let her stop when she's done.</li>
          <li>Same feed slot repeatedly flagged ↓ below avg → pattern worth mentioning at her next visit.</li>
          <li>Two or more amber days in a row on the trend (under 150 ml/kg/day) → flag for the doctor.</li>
          <li>Growth indicator showing concern for several weigh-ins → worth raising, especially past day 14.</li>
          <li>Use the notes field for anything specific — fortifier added, spit-up, very fussy, etc.</li>
        </ul>

        <H>Privacy</H>
        <p>
          One shared 6-digit passcode. Once you log in on a device you stay logged in for 90 days. Data lives
          on our private home server, is backed up nightly to a separate storage box, and a daily JSON+CSV
          snapshot is committed to a private GitHub repo as off-site backup. Sign out from Settings if you
          ever lose a device.
        </p>
      </>
    ),
  },
]

const VIEW_SECTIONS: Section[] = [
  {
    id: 'today',
    title: 'The Today screen',
    blurb: 'Today\'s feeding progress at a glance.',
    tone: 'emerald',
    icon: Icons.today,
    body: (
      <>
        <H>The progress ring</H>
        <p className="mb-2">
          The big circle in the middle shows how much milk Zoey has had today out of her daily target.
          The pink fill grows with each feed. A small light tick on the circle marks where she should be
          right now if she's keeping pace with the day, so you can see ahead/behind at a glance: pink fill
          past the tick = ahead, fill stops short of the tick = behind.
        </p>
        <p>
          When the day's total reaches the goal, a soft warm glow appears behind the ring as a quiet
          celebration.
        </p>

        <H>Pace chip + plain-language line</H>
        <p>
          Just below the ring, a coloured chip names today's pace in seven tiers, from{' '}
          <span className="text-rose-300">well behind</span> to <span className="text-sky-200">well ahead</span>,
          with the exact gap. Underneath, a one-sentence note says where things stand and what's expected
          next.
        </p>

        <H>Today's feeds list</H>
        <p>
          The feeds Zoey has had today, with time, amount, and a small comparison badge that compares each
          feed to the same slot from the past week:{' '}
          <span className="text-amber-300">↓ below</span>,{' '}
          <span className="text-emerald-300">≈ normal</span>,{' '}
          <span className="text-sky-300">↑ above</span>. Breast feeds get a "BREAST · EST" tag and don't
          pollute the bottle averages.
        </p>

        <H>Diaper count</H>
        <p>
          Wet and dirty diaper totals for today, with the time of the most recent change. Pediatricians
          usually look for at least six wet diapers in 24 hours.
        </p>

        <H>Milestones</H>
        <p>
          A small pink chip near the top celebrates one-time events when they happen: birth weight regained,
          term-equivalent age reached, first 60 ml feed, doubled birth weight, and so on.
        </p>
      </>
    ),
  },
  {
    id: 'meds',
    title: 'The Meds tab',
    blurb: 'Daily checklist for iron, vitamin D, and anything else.',
    tone: 'lime',
    icon: Icons.pill,
    body: (
      <>
        <H>What you see</H>
        <p className="mb-2">
          The top section shows today's medication checklist. Each med (iron, vitamin D, etc.) has
          one row per scheduled dose — completed doses show as <span className="text-emerald-300">✓</span>{' '}
          with the time given; not-yet-given doses show as a dashed pending row. Doses given
          beyond the day's expected count are flagged <span className="text-amber-300">extra</span>{' '}
          in amber.
        </p>
        <p className="mb-2">
          Below the checklist, "one-offs" (free-text things like saline drops or a single
          antibiotic) get their own block when present.
        </p>
        <p>
          Below today, the last 14 days of doses are listed by date so you can see the routine
          history.
        </p>

        <H>What you can do</H>
        <p>
          Read-only — you can see everything but can't log or change doses. The active parent on
          their edit-mode session does the logging from here.
        </p>
      </>
    ),
  },
  {
    id: 'overview',
    title: 'The Overview tab',
    blurb: 'Weekly health-check answer in plain English.',
    tone: 'rose',
    icon: Icons.shield,
    body: (
      <>
        <H>The headline paragraph</H>
        <p>
          Opens with a paragraph in plain language that answers "how is she doing?" — woven from the four
          indicators below. If everything is fine it celebrates; if something is worth watching it names it
          directly; if something has slipped it flags it for the next doctor visit.
        </p>

        <H>The four indicators</H>
        <ul className="space-y-1.5 list-disc pl-5">
          <li><b>Intake</b> — average ml/kg/day across the last completed week.</li>
          <li><b>Growth</b> — weight-gain rate vs the band expected for her current age.</li>
          <li><b>Today's pace</b> — where she stands against today's target.</li>
          <li><b>Hydration</b> — wet-diaper count, the rough indicator of fluid balance.</li>
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500">
          Each card carries a coloured dot:{' '}
          <span className="text-emerald-300">emerald</span> = on track,{' '}
          <span className="text-amber-300">amber</span> = watch,{' '}
          <span className="text-rose-300">rose</span> = flag for the doctor,{' '}
          <span className="text-sky-300">sky</span> = above target.
        </p>
      </>
    ),
  },
  {
    id: 'pumps',
    title: 'Pumps (Trends)',
    blurb: 'Supply vs intake balance over the last week.',
    tone: 'sky',
    icon: Icons.pump,
    body: (
      <>
        <H>Three balance numbers</H>
        <p className="mb-2">
          Today's, the 4-day fridge cycle, and the rolling 7-day balance. Each number is{' '}
          <b>pumped minus bottle-fed</b>:
        </p>
        <ul className="space-y-1 list-none pl-0 mb-2">
          <li><span className="text-emerald-300">positive (emerald)</span> — pumping is ahead of intake, so stored milk is building.</li>
          <li><span className="text-amber-300">negative (amber)</span> — drawing down on stored milk.</li>
        </ul>
        <p>
          The 4-day window matches roughly how long fresh milk keeps in the fridge. Breast feeds aren't
          counted on either side since they don't pass through the bottle supply.
        </p>

        <H>The dual-bar chart</H>
        <p>
          One pair of bars per day for the last 7 days: <span className="text-sky-300">sky</span> for pumped,
          <span className="text-pink-300"> pink</span> for bottle-fed. The visible gap between the two pairs
          tells you that day's surplus or deficit at a glance.
        </p>
      </>
    ),
  },
  {
    id: 'weight',
    title: 'Weight & growth',
    blurb: 'Fenton percentile chart and what to read into it.',
    tone: 'lime',
    icon: Icons.growth,
    body: (
      <>
        <H>The Fenton 2025 chart</H>
        <p className="mb-2">
          On the Trends tab → Weight, Zoey's weight history is plotted against the Fenton 2025 girls
          reference percentiles (3rd, 10th, 50th, 90th). The x-axis is{' '}
          <b>postmenstrual age (PMA)</b> — gestational age at birth plus how old she is — which is the
          standard way preterm babies are tracked.
        </p>
        <p>
          <b>Trajectory matters more than the absolute percentile.</b> The goal is for her line to stay
          roughly parallel to the reference lines, i.e. follow her own curve. It's normal for preemies to
          start at lower percentiles. Crossing percentiles upward over weeks is catch-up growth; crossing
          downward repeatedly is what doctors flag.
        </p>

        <H>The narrative card</H>
        <p>
          Below the chart, a short paragraph in plain English summarises what the chart shows: birth-weight
          recovery progress, current Fenton percentile, week-over-week percentile shifts, and the recent
          gain rate vs the expected band. Tone (emerald/amber/sky) tracks the data.
        </p>

        <H>Per-row gain colours</H>
        <p>
          In the weight history list, each row shows how much was gained since the previous entry, both as
          g/day and the more clinically meaningful g/kg/day. The colour grades the gain against the band
          expected for that age bracket.
        </p>
      </>
    ),
  },
  {
    id: 'vitals',
    title: 'Vitals',
    blurb: 'Heart rate and SpO₂ from the Owlet sock.',
    tone: 'rose',
    icon: Icons.shield,
    body: (
      <>
        <H>What you're seeing</H>
        <p className="mb-2">
          The Vitals sub-tab shows daily summaries of Zoey's heart rate and oxygen levels from her
          Owlet Dream Sock. Each day shows the heart-rate range (with the average dot), the lowest
          sustained oxygen reading, and how many monitoring sessions there were.
        </p>

        <H>Why the lowest oxygen is what matters</H>
        <p>
          Single-second oxygen dips happen and don't worry doctors. The number shown is the sock's
          own sustained reading — it filters out brief blips, so only oxygen levels that lasted
          several minutes register. The CHOP consensus target window for ≥32w PMA preterm is
          92–98%, so the floor is 92%. A sustained dip below 88% is at or below the standard
          alarm threshold and worth raising at a check-up.
        </p>

        <H>Owlet does the alerting</H>
        <p>
          This view is for trends and patterns, not real-time safety. The sock itself alarms the
          parents if oxygen or heart rate cross safe thresholds — that's its job. What you see here
          is just the historical picture.
        </p>
      </>
    ),
  },
  {
    id: 'preterm',
    title: 'Why this is preterm-specific',
    blurb: 'A short primer on PMA and gain bands.',
    tone: 'violet',
    icon: Icons.bell,
    body: (
      <>
        <H>Postmenstrual age (PMA)</H>
        <p className="mb-2">
          PMA is gestational age at birth plus how old the baby is, in weeks. So a baby born at 35 weeks
          and now 14 days old is at 35 + 2 = 37 weeks PMA. Almost every preterm growth metric is reported
          against PMA rather than calendar age, because a baby's biology is still catching up to the
          gestational timeline.
        </p>
        <p>
          A "term-equivalent" baby has reached PMA 40 weeks — the moment a full-term baby would have been
          born — which is when growth velocity starts to slow toward the term curve.
        </p>

        <H>Why the gain bands change</H>
        <p>
          Expected weight gain in g/kg/day decreases as PMA approaches term: faster at younger PMA, slower
          near term. The app uses these bands (from Fenton 2025 + AAP/ESPGHAN 2022) to colour the daily
          gain so a number like +12 g/kg/day reads as "lovely" at 36w PMA and "watch" at 40w+.
        </p>

        <H>Why the first two weeks are different</H>
        <p>
          Preemies almost always lose weight in the first 5–7 days, then start regaining around day 7 and
          recover their birth weight by roughly day 14–21. So gain expectations during this period are
          much lower than later — a "good" reading is anything climbing back toward birth weight.
        </p>
      </>
    ),
  },
  {
    id: 'session',
    title: 'Your session & sign out',
    blurb: 'Read-only access, 7 days, sign-out at the bottom of this page.',
    tone: 'pink',
    icon: Icons.bottle,
    body: (
      <>
        <H>Read-only by design</H>
        <p>
          Your passcode opens a viewer session: you can see everything Max and Sabrina see, but you can't
          add, edit, or delete entries. That's intentional. The app's underlying log is their record, and
          view sessions can't accidentally change it.
        </p>

        <H>How long the session lasts</H>
        <p>
          Viewer sessions last 7 days before they expire. After that you'll be asked for the passcode
          again. (Max and Sabrina stay logged in for 90 days.)
        </p>

        <H>Signing out</H>
        <p>
          Scroll to the bottom of this help page and tap <b>Sign out</b> to end the session on this device.
        </p>

        <H>Privacy</H>
        <p>
          Data lives on the family's private home server, backed up to a separate storage box and a
          private GitHub repository.
        </p>
      </>
    ),
  },
]

export function HelpModal({ open, onClose }: Props) {
  const readOnly = useIsReadOnly()
  const logout = useLogout()
  const sections = readOnly ? VIEW_SECTIONS : EDIT_SECTIONS
  const [openId, setOpenId] = useState<string | null>(null)

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[90dvh] bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="text-lg font-medium">How to use this app</div>
          <button onClick={onClose} className="text-zinc-400 text-3xl leading-none w-8 h-8" aria-label="Close">
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-zinc-200">

          {/* Quick start — always visible. Branches on auth mode. */}
          <div className="rounded-2xl bg-pink-300/10 border border-pink-300/20 p-4 mb-5">
            <div className="text-pink-200 font-medium mb-2">Quick start</div>
            {readOnly ? (
              <ul className="space-y-1.5 list-disc pl-5 text-zinc-200">
                <li>
                  This is a live view of how Zoey is doing. The data updates as soon as Max or Sabrina log
                  feeds, weights, and diapers.
                </li>
                <li>
                  Use the tabs at the bottom: <b>Today</b> for the live picture, <b>Overview</b> for a
                  weekly health-check paragraph, <b>Trends</b> for the full
                  feed grid and the weight chart.
                </li>
                <li>
                  Everything is read-only. You can't change anything by tapping, so explore freely.
                </li>
                <li>
                  Sign out from the bottom of this help page. Sessions last 7 days.
                </li>
                <li>
                  Tap a section below to learn what each view is showing.
                </li>
              </ul>
            ) : (
              <ul className="space-y-1.5 list-disc pl-5 text-zinc-200">
                <li>
                  Tap <span className="bg-pink-300/20 text-pink-200 px-1.5 rounded">+ Feed</span> to log a
                  bottle. The button shows the suggested ml.
                </li>
                <li>
                  Tap <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Pump</span>,{' '}
                  <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Wet</span>, or{' '}
                  <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Dirty</span> for the rest.
                </li>
                <li>
                  <b>Tap any logged item</b> to edit amount, time, notes, or delete. Deletes have a 5-second
                  Undo.
                </li>
                <li>
                  Watch the <b>progress ring</b> + <b>pace chip</b> on Today for "are we on track right now?"
                  The <b>Overview</b> tab is the at-a-glance status if you only have a second.
                </li>
                <li>
                  Open the section below that matches what you're looking for — tap to expand.
                </li>
              </ul>
            )}
          </div>

          {/* Sections — accordion */}
          <div className="space-y-2">
            {sections.map((s) => {
              const isOpen = openId === s.id
              const t = TONES[s.tone]
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border ${isOpen ? `${t.openBorder} ${t.openBg}` : 'bg-zinc-900/50 border-zinc-800'}`}
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : s.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-zinc-800/60 rounded-xl"
                    aria-expanded={isOpen}
                  >
                    <div className={`w-9 h-9 rounded-lg ${t.iconBg} ${t.iconFg} flex items-center justify-center shrink-0`}>
                      {s.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-100">{s.title}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{s.blurb}</div>
                    </div>
                    <span className={`text-zinc-400 text-lg shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-[13px] leading-relaxed border-t border-zinc-800/60">
                      {s.body}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {readOnly && (
            <div className="mt-6 pt-4 border-t border-zinc-800">
              <button
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="w-full py-3 rounded-xl bg-rose-950/50 border border-rose-900/50 text-rose-200 text-sm font-medium disabled:opacity-40"
              >
                {logout.isPending ? 'Signing out…' : 'Sign out'}
              </button>
              <div className="mt-2 text-[11px] text-zinc-500 text-center">
                Ends this session on this device. You can sign back in any time with your passcode.
              </div>
            </div>
          )}

          <div className="pt-5 pb-1 text-center">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm"
            >
              Got it
            </button>
            <div className="mt-3 text-[10px] text-zinc-600">© {new Date().getFullYear()} The Page Family</div>
          </div>
        </div>
      </div>
    </div>
  )
}
