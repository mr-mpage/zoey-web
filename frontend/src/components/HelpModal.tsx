type Props = { open: boolean; onClose: () => void }

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-pink-200 font-medium mb-1.5">{children}</h3>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-6 mb-2 first:mt-0">
      {children}
    </div>
  )
}

export function HelpModal({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[90dvh] bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="text-lg font-medium">How to use this app</div>
          <button onClick={onClose} className="text-zinc-400 text-3xl leading-none w-8 h-8">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 text-sm leading-relaxed text-zinc-200">

          {/* ───── GETTING STARTED ───── */}
          <GroupTitle>Getting started</GroupTitle>

          <section>
            <SectionHeader>Quick guide</SectionHeader>
            <p>
              Tap <span className="bg-pink-300/20 text-pink-200 px-1.5 rounded">+ Feed</span> to log a bottle and{' '}
              <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Pump</span> to log a pumping session.
              The +Feed button shows the suggested ml right on it. Tap any logged feed or pump to edit the amount,
              time, or notes — or delete it.
            </p>
          </section>

          <section>
            <SectionHeader>Overview tab</SectionHeader>
            <p>
              At-a-glance "how is she doing?" view. Four indicators — <b>Intake</b>, <b>Growth</b>,{' '}
              <b>Today's pace</b>, <b>Hydration</b> — each with a colour dot
              (<span className="text-emerald-300">emerald</span> = on track,{' '}
              <span className="text-amber-300">amber</span> = watch,{' '}
              <span className="text-rose-300">rose</span> = flag,{' '}
              <span className="text-sky-300">sky</span> = above target) and a one-line plain-English verdict.
              Use it for quick check-ins or to share status with the doctor.
            </p>
          </section>

          {/* ───── TODAY SCREEN ───── */}
          <GroupTitle>The Today screen</GroupTitle>

          <section>
            <SectionHeader>What you see on Today</SectionHeader>
            <ul className="space-y-1.5 list-disc pl-5">
              <li><b>Progress ring</b> — total fed today vs daily target (weight × ml/kg/day).</li>
              <li><b>Pace chip</b> — <span className="text-emerald-300">on track</span>,{' '}
                <span className="text-amber-300">behind</span>, or <span className="text-sky-300">ahead</span>{' '}
                at this point in the day. Tolerance is ±10% of expected-so-far (tighter than per-feed
                comparisons because pace deviations stack up across feeds).</li>
              <li><b>7-day gain chip</b> — her weight gain rate vs what's expected for her current age.</li>
              <li><b>Status card</b> — plain-language summary of where you are and what to aim for next.</li>
              <li><b>Next feed card</b> — index, expected time (adaptive — slides with reality if a feed runs late),
                suggested amount, drift vs the rigid grid, and a day-fit projection so a slipping schedule doesn't
                quietly cost a feed.</li>
              <li><b>Today's feeds list</b> — each row is tap-able to edit. The badge tells you if that feed was
                unusual for that slot.</li>
            </ul>
          </section>

          <section>
            <SectionHeader>Feed comparison badges (↓ ≈ ↑)</SectionHeader>
            <p className="mb-2">
              Each feed is compared against the same feed-of-day across the last 7 days — so feed #4 today is
              compared to feed #4 on previous days, not the daily average.
            </p>
            <ul className="space-y-1 list-none pl-0">
              <li><span className="text-amber-300">↓ below avg</span> — more than 15% under that slot's 7-day average.</li>
              <li><span className="text-emerald-300">≈ normal</span> — within ±15% of average.</li>
              <li><span className="text-sky-300">↑ above avg</span> — more than 15% over average.</li>
              <li className="text-zinc-500">"no history" — first time we have data for that slot.</li>
            </ul>
          </section>

          <section>
            <SectionHeader>Breastfeeding</SectionHeader>
            <p className="mb-2">
              In the feed modal, toggle <b>Breast</b> to log a direct breastfeeding session. The ml field
              becomes an estimate (0 ml is fine for a comfort attempt — Zoey at the breast but not really
              feeding) and a duration-in-minutes field appears. Breast feeds get a small "BREAST · EST"
              chip next to the ml, no row tint.
            </p>
            <p className="mb-2">
              Breast feeds <b>don't pollute the bottle averages</b> — comparison badges and the historical
              avg on the next-feed card only count bottle entries from past days. The volume still adds to
              the daily total (with the noted uncertainty), so the catch-up math reacts to it. Today and
              History both show a daily breastfeed tally ("1 breastfeed today · ~5 ml estimated · 5 min").
            </p>
            <p className="text-zinc-400 text-[11px]">
              Tip: if the breastfeed is in addition to a scheduled bottle, also toggle <b>Extra
              (off-schedule)</b> so it doesn't shift the bottle slot numbering. If the breast is replacing
              a bottle in the rotation, leave Extra off.
            </p>
          </section>

          <section>
            <SectionHeader>Extra (off-schedule) feeds</SectionHeader>
            <p>
              If she has an unscheduled top-up between regular feeds (e.g. extra at 11:00 between the 08:30
              and 11:30 feeds), open the feed modal and toggle <b>Extra (off-schedule)</b>. Extras count
              toward the daily total but don't shift the feed-of-day numbering or pace expectations — so the
              comparison badge for the regular 11:30 still reads as feed #4 vs the historical 11:30 average.
              Extras render with an "EXT" tag in amber instead of a #N index.
            </p>
          </section>

          <section>
            <SectionHeader>Diaper count</SectionHeader>
            <p>
              Tap <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Wet</span> or
              <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded ml-1">+ Dirty</span> to log a diaper.
              Pediatricians usually ask "how many wet diapers in 24 h?" — six is the rough floor for adequate
              hydration. The minus button next to each counter undoes the most recent entry of that kind.
            </p>
          </section>

          {/* ───── SCHEDULE & RHYTHM ───── */}
          <GroupTitle>The schedule & rhythm</GroupTitle>

          <section>
            <SectionHeader>Starting the next day early</SectionHeader>
            <p className="mb-2">
              When today's feeds are all done, the Today screen shows a <b>Day complete</b> card with a
              <b> Start new day now</b> button. Tap it to shift the day-start time to right now — useful
              if Zoey's rhythm is genuinely drifting earlier and you want the schedule to follow.
              Reversible any time from Settings → Feeding schedule.
            </p>
            <p>
              If you instead just want a single feed to count toward the new day without shifting the
              schedule, log the feed normally — when the timestamp lands before today's anchor, a small
              dialog asks "first feed of today" or "extra at end of yesterday". Picking "first of today"
              tags only this one feed without touching the anchor.
            </p>
          </section>

          <section>
            <SectionHeader>Feeding schedule</SectionHeader>
            <p className="mb-2">
              The feeding day runs from the anchor time (default <b>02:30</b>) to the anchor time the next
              morning, divided into <b>8 feeds</b> by default. Both are configurable in
              Settings → Feeding schedule. Feed #1 is the first feed at or after the anchor; the daily total
              resets at the anchor, not at midnight.
            </p>
            <p className="mb-2">
              When the doctor changes her schedule (e.g. moves to every 4h = 6/day, or shifts the start time
              to 03:00), update the two numbers and everything follows: per-feed target, expected times,
              history grid columns, pace calculation.
            </p>
            <p className="text-zinc-400 text-[11px]">
              Don't change feeds-per-day on your own — that's a clinical decision. The setting exists so the
              app matches whatever the doctor recommends.
            </p>
          </section>

          {/* ───── GROWTH & HISTORY ───── */}
          <GroupTitle>Growth & history</GroupTitle>

          <section>
            <SectionHeader>Updating her weight</SectionHeader>
            <p>
              Go to Settings → Update weight, enter the new weight in grams and (if it changed) the
              ml/kg/day rate. The daily target recalculates immediately, and history rows for past days keep
              using the weight that was current then. Tap any row in the weight history to edit or delete it.
              If a new weight differs by more than 10% or 100 g/day from the previous, you'll get a sanity-check
              confirmation before it saves.
            </p>
          </section>

          <section>
            <SectionHeader>Weight gain expectations (PMA-aware)</SectionHeader>
            <p className="mb-2">
              Expected gain depends on her postmenstrual age (PMA = gestational age at birth + days postnatal).
              Velocity decreases as she approaches term:
            </p>
            <ul className="space-y-1 list-none pl-0">
              <li>First 7 days: <b>0–12 g/kg/day</b> — birth-weight loss/regain phase</li>
              <li>Days 7–14: <b>8–16 g/kg/day</b> — building up</li>
              <li>PMA &lt; 30 weeks: <b>17–23 g/kg/day</b></li>
              <li>PMA 30–34 weeks: <b>15–20 g/kg/day</b></li>
              <li>PMA 34–38 weeks: <b>12–17 g/kg/day</b></li>
              <li>Term-equivalent (≥ 38 w): <b>10–15 g/kg/day</b></li>
            </ul>
            <p className="mt-2 text-zinc-400 text-[11px]">
              Reference: AAP/ESPGHAN 2022 + Fenton growth charts. The Today gain chip and the Overview growth
              indicator both judge her against her current age bucket — so a 9 g/kg/day reading reads as "good"
              during postnatal recovery and as "watch" once she's past day 14.
            </p>
          </section>

          <section>
            <SectionHeader>History colours</SectionHeader>
            <p className="mb-2">
              Each row's colour reflects the day's intake in <b>ml per kg of body weight</b> — the metric
              neonatologists actually use. Five tiers, defaults shown:
            </p>
            <ul className="space-y-1 list-none pl-0">
              <li><span className="text-rose-400">rose</span> — under 135 ml/kg/day · genuinely low</li>
              <li><span className="text-amber-400">amber</span> — 135–150 · under the target zone</li>
              <li><span className="text-lime-300">lime</span> — 150–160 · at minimum, in zone but no cushion</li>
              <li><span className="text-emerald-300">emerald</span> — 160–180 · solidly in zone</li>
              <li><span className="text-sky-300">sky</span> — above 180 · above zone (often catch-up)</li>
            </ul>
            <p className="mt-2">
              All four edges are editable in Settings → Colour bands. Today's row stays grey + "in progress"
              until the day finishes.
            </p>
          </section>

          {/* ───── REMINDERS, FLAGS, PRIVACY ───── */}
          <GroupTitle>Reminders, flags & privacy</GroupTitle>

          <section>
            <SectionHeader>Reminders</SectionHeader>
            <p>
              Settings → Reminders enables push notifications 15 min before each scheduled feed. They're
              adapted to her actual rhythm — if a feed runs late, the reminder for the next slot slides too.
              On iOS the app must be added to your Home Screen first. Treat these as supplemental; phone alarms
              are still your primary safety net.
            </p>
          </section>

          <section>
            <SectionHeader>What to watch for</SectionHeader>
            <ul className="space-y-1.5 list-disc pl-5">
              <li>If the status card turns amber ("Behind pace"), the next-feed target bumps up to catch up.
                Try the suggested amount, but never force feed — let her stop when she's done.</li>
              <li>The same feed slot repeatedly flagged ↓ below avg can be a pattern worth mentioning at her
                next check-up.</li>
              <li>Two or more amber history days in a row (under 150 ml/kg/day) is a flag for the doctor.</li>
              <li>Growth indicator showing concern for several weigh-ins is worth raising — especially once
                she's past day 14.</li>
              <li>Use the notes field for anything specific — fortifier added, spit-up, very fussy, slept
                through, etc.</li>
            </ul>
          </section>

          <section>
            <SectionHeader>Privacy</SectionHeader>
            <p>
              One shared 6-digit passcode. Once you log in on a device you stay logged in for 90 days. Data
              lives only on our private home server, is backed up nightly to a separate storage box, and a
              daily JSON+CSV snapshot is committed to a private GitHub repo as off-site backup. Sign out from
              Settings if you ever lose a device.
            </p>
          </section>

          <div className="pt-2 pb-1 text-center">
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
