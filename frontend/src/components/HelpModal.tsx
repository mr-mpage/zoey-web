import { useState } from 'react'

type Props = { open: boolean; onClose: () => void }

type Section = {
  id: string
  title: string
  blurb: string
  body: React.ReactNode
}

function H({ children }: { children: React.ReactNode }) {
  return <div className="text-pink-200 font-medium mb-1.5 mt-3 first:mt-0">{children}</div>
}

const SECTIONS: Section[] = [
  {
    id: 'today',
    title: 'The Today screen',
    blurb: 'Progress ring, pace chip, status card, next feed.',
    body: (
      <>
        <H>What you see on Today</H>
        <ul className="space-y-1.5 list-disc pl-5">
          <li><b>Progress ring</b> — total fed today vs daily target (weight × ml/kg/day).</li>
          <li>
            <b>Pace chip</b> — seven tiers vs the expected mid-day pace:{' '}
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
    id: 'pumps',
    title: 'Pumps',
    blurb: '30-day supply chart + 7-day detail, edit on tap.',
    body: (
      <p>
        The Pumps tab opens with a 30-day daily-totals chart. Today's bar is highlighted; a dashed line
        marks the rolling 7-day average. Underneath, the caption shows peak day, 7-day average, and active-day
        count. The detail list shows the last 7 days grouped by day — tap any pump to edit amount, time,
        or notes.
      </p>
    ),
  },
  {
    id: 'weight',
    title: 'Weight & growth',
    blurb: 'Fenton 2025 chart, PMA-aware bands, history colours.',
    body: (
      <>
        <H>Updating her weight</H>
        <p>
          Go to <b>History → Weight</b>. Tap <b>+ Add weight</b> to log a new entry, or tap any row to edit
          or delete. Enter the new weight in grams and (if it changed) the ml/kg/day rate. The daily target
          recalculates immediately; past-day history rows keep using the weight current at the time.
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

        <H>History colours (ml/kg/day)</H>
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
    id: 'schedule',
    title: 'Schedule, reminders, reports',
    blurb: 'Anchor time, push notifications, doctor PDF.',
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
    body: (
      <>
        <H>What to watch for</H>
        <ul className="space-y-1.5 list-disc pl-5">
          <li>Status card amber ("Behind pace") → next-feed target bumps up. Try the suggested amount, but
            never force feed — let her stop when she's done.</li>
          <li>Same feed slot repeatedly flagged ↓ below avg → pattern worth mentioning at her next visit.</li>
          <li>Two or more amber history days in a row (under 150 ml/kg/day) → flag for the doctor.</li>
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

export function HelpModal({ open, onClose }: Props) {
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

          {/* Quick start — always visible */}
          <div className="rounded-2xl bg-pink-300/10 border border-pink-300/20 p-4 mb-5">
            <div className="text-pink-200 font-medium mb-2">Quick start</div>
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
          </div>

          {/* Sections — accordion */}
          <div className="space-y-2">
            {SECTIONS.map((s) => {
              const isOpen = openId === s.id
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border ${isOpen ? 'bg-zinc-800/40 border-zinc-700' : 'bg-zinc-900/50 border-zinc-800'}`}
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : s.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left active:bg-zinc-800/60 rounded-xl"
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-100">{s.title}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{s.blurb}</div>
                    </div>
                    <span className={`text-zinc-400 text-lg shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-[13px] leading-relaxed border-t border-zinc-800">
                      {s.body}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="pt-5 pb-1 text-center">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
