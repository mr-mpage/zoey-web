type Props = { open: boolean; onClose: () => void }

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

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">Extra (off-schedule) feeds</h3>
            <p>
              If she has an unscheduled top-up between regular feeds (e.g. extra at 11:00 between the 08:30
              and 11:30 feeds), open the feed modal and toggle <b>Extra (off-schedule)</b>. Extras count
              toward the daily total but don't shift the feed-of-day numbering or pace expectations — so the
              comparison badge for the regular 11:30 still reads as feed #4 vs the historical 11:30 average.
              Extras render with an "EXT" tag in amber instead of a #N index.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">Quick guide</h3>
            <p>
              Tap <span className="bg-pink-300/20 text-pink-200 px-1.5 rounded">+ Feed</span> to log a bottle and{' '}
              <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Pump</span> to log a pumping session.
              Tap any logged feed or pump to edit the amount, time, or notes — or delete it.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">The Today screen</h3>
            <ul className="space-y-1.5 list-disc pl-5">
              <li><b>Progress ring</b> — total fed today vs daily target (weight × ml/kg/day).</li>
              <li><b>Pace chip</b> — whether she's <span className="text-emerald-300">on track</span>, <span className="text-amber-300">behind</span>, or <span className="text-sky-300">ahead</span> at this point in the day.</li>
              <li><b>Status card</b> — plain-language summary of where you are and what to aim for next.</li>
              <li><b>Next feed</b> — the index (#1–#8), expected time, and suggested amount. The amount auto-adjusts: if she's behind it bumps up to catch up, if she's ahead it eases off. The "even pace" line shows the simple daily ÷ 8 baseline.</li>
              <li><b>Today's feeds</b> — each row tap-able to edit. The badge tells you if that feed was unusual.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">The feed badges</h3>
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
            <h3 className="text-pink-200 font-medium mb-1.5">History colours</h3>
            <p className="mb-2">
              Each row's colour reflects the day's intake in <b>ml per kg of body weight</b> — the metric
              neonatologists actually use. Five tiers, defaults shown:
            </p>
            <ul className="space-y-1 list-none pl-0">
              <li><span className="text-rose-400">rose</span> — under 130 ml/kg/day · genuinely low, worth flagging</li>
              <li><span className="text-amber-400">amber</span> — 130–150 · under the target zone</li>
              <li><span className="text-lime-300">lime</span> — 150–165 · at minimum, in zone but no cushion</li>
              <li><span className="text-emerald-300">emerald</span> — 165–180 · solidly in zone</li>
              <li><span className="text-sky-300">sky</span> — above 180 · over zone, often catch-up growth</li>
            </ul>
            <p className="mt-2">
              All four edges are editable in Settings, so you can match what your doctor recommends.
              Today's row stays grey + "in progress" until the day finishes.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">The feeding schedule</h3>
            <p className="mb-2">
              The feeding day runs from the anchor time (default <b>02:30</b>) to the anchor time the next
              morning, divided into <b>8 feeds</b> by default. Both are configurable in
              Settings → Feeding schedule.
            </p>
            <p className="mb-2">
              When the doctor changes her schedule (e.g. moves to every 4h = 6/day, or shifts the start time
              to 03:00), update the two numbers and everything follows: the per-feed target, the
              expected-time on the next-feed card, the history grid columns, the pace calculation.
            </p>
            <p className="text-zinc-400 text-[11px]">
              Don't change feeds-per-day on your own — that's a clinical decision. The setting exists so
              the app can match whatever the doctor recommends.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">Updating her weight</h3>
            <p>
              When you have a fresh weigh-in, go to Settings → Update weight. Enter the new weight in grams
              and (if it changed) the ml/kg/day rate. The daily target recalculates immediately, and history
              rows for past days keep using the weight that was current then. Tap any row in the weight
              history to edit or delete it. If a new weight differs by more than 10% or 100 g/day from the
              previous, you'll get a sanity-check confirmation before it saves.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">Weight gain (g/kg/day)</h3>
            <p>
              The Today screen shows her 7-day average gain rate under the pace chip. Reference for stable
              preterm: <b>15–20 g/kg/day</b>. Each row in the weight history also shows the gain since the
              previous entry. If gain rate falls below ~10 g/kg/day persistently, mention it at her next visit.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">Diaper count</h3>
            <p>
              Tap <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded">+ Wet</span> or
              <span className="bg-zinc-800 text-zinc-100 px-1.5 rounded ml-1">+ Dirty</span> to log a diaper.
              Pediatricians usually ask "how many wet diapers in 24 h?" — six is the rough floor for adequate
              hydration. The minus button next to each counter undoes the most recent entry of that kind.
            </p>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">What to watch for</h3>
            <ul className="space-y-1.5 list-disc pl-5">
              <li>If the status card turns amber ("Behind pace"), the next-feed target bumps up to catch up. Try the suggested amount, but never force feed — let her stop when she's done.</li>
              <li>The same feed slot repeatedly flagged ↓ below avg can be a pattern worth mentioning at her next check-up.</li>
              <li>Two or more amber history days in a row (under 150 ml/kg/day) is a flag for the doctor.</li>
              <li>Use the notes field for anything specific — fortifier added, spit-up, very fussy, slept through, etc.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-pink-200 font-medium mb-1.5">Privacy</h3>
            <p>
              One shared 6-digit passcode. Once you log in on a device you stay logged in for 90 days. Data lives
              only on our private home server and is backed up nightly. Sign out from Settings if you ever lose a device.
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
