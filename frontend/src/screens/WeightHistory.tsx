import { useMemo, useState } from 'react'
import {
  useAppSettings,
  useDeleteWeight,
  usePatchWeight,
  useSetWeight,
  useWeight,
} from '../api/hooks'
import { GrowthChart } from '../components/GrowthChart'
import { WeightModal } from '../components/WeightModal'
import { WeightNarrativeCard } from '../components/WeightNarrativeCard'
import { WeightSparkline } from '../components/WeightSparkline'
import { useIsReadOnly } from '../lib/authMode'
import { buildWeightNarrative } from '../lib/weightNarrative'
import { fmtDate } from '../lib/format'
import { expectedGainRange, gainTone, gainsBetweenEntries, rollingGainRate } from '../lib/growth'
import type { Weight } from '../api/types'

function pmaAtDate(dateIso: string, birthDateIso: string, gaWeeks: number): { pma: number; postnatalDays: number } {
  const birth = new Date(birthDateIso + 'T00:00:00').getTime()
  const at = new Date(dateIso).getTime()
  const days = Math.max(0, Math.floor((at - birth) / 86_400_000))
  return { pma: gaWeeks + days / 7, postnatalDays: days }
}

export function WeightHistorySection() {
  const readOnly = useIsReadOnly()
  const { data: weight } = useWeight()
  const { data: appSettings } = useAppSettings()
  const setWeight = useSetWeight()
  const patchWeight = usePatchWeight()
  const deleteWeight = useDeleteWeight()

  const [editing, setEditing] = useState<Weight | null>(null)
  const [adding, setAdding] = useState(false)

  const weights = weight?.history ?? []
  // Per-entry gains and the headline 7-day rate are computed from manual
  // entries only — auto rows are derived from that rate, so including them
  // would be circular and flatten the displayed gain to itself.
  const manuals = useMemo(() => weights.filter((w) => !w.is_auto), [weights])
  const gains = useMemo(() => gainsBetweenEntries(manuals), [manuals])
  const latest = weights[0] ?? null
  const latestIsAuto = !!latest?.is_auto

  const sevenDayGain = rollingGainRate(manuals, 7)

  // For auto rows we want to show the daily gain *that was actually applied*
  // when the row was generated — i.e. weight minus the previous chronological
  // row's weight (manual or auto). This makes the rate visible per-row, so a
  // change in the underlying manuals (which retroactively shifts auto rows)
  // is legible after the fact.
  const dailyDeltaById = useMemo(() => {
    const sortedAsc = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    const map = new Map<number, number>()
    for (let i = 1; i < sortedAsc.length; i++) {
      map.set(sortedAsc[i].id, sortedAsc[i].weight_grams - sortedAsc[i - 1].weight_grams)
    }
    return map
  }, [weights])

  // Forward auto-fill rate currently in effect: the gain applied to the most
  // recent auto row. This is what's being added to the daily ml target each
  // day until a fresh manual lands.
  const forwardFillRateGPerDay = useMemo(() => {
    if (!latestIsAuto || !latest) return null
    return dailyDeltaById.get(latest.id) ?? null
  }, [latestIsAuto, latest, dailyDeltaById])

  const ctxToday = appSettings
    ? pmaAtDate(new Date().toISOString(), appSettings.birth_date, appSettings.gestational_age_weeks)
    : null
  const expectedRange = ctxToday ? expectedGainRange(ctxToday.pma, ctxToday.postnatalDays) : null

  return (
    <>
      {/* Headline summary */}
      <div className="rounded-xl bg-zinc-900/60 p-4 mb-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Current weight
              {latestIsAuto && (
                <span className="ml-2 text-amber-300/80 normal-case tracking-normal">· estimated</span>
              )}
            </div>
            <div className={`text-3xl font-light tabular-nums leading-none mt-1 ${latestIsAuto ? 'text-zinc-300' : ''}`}>
              {latest ? latest.weight_grams : '—'}
              <span className="text-base text-zinc-500 font-normal ml-1">g</span>
            </div>
            {latest && (
              <div className="text-[11px] text-zinc-500 mt-1">
                {latestIsAuto
                  ? `extrapolated · last weighed ${manuals[0] ? fmtDate(manuals[0].recorded_at) : '—'}`
                  : `weighed ${fmtDate(latest.recorded_at)}`}
              </div>
            )}
            {latestIsAuto && forwardFillRateGPerDay !== null && (
              <div className="text-[11px] text-amber-300/80 tabular-nums mt-0.5">
                auto-fill rate · {forwardFillRateGPerDay >= 0 ? '+' : ''}{forwardFillRateGPerDay.toFixed(0)} g/day
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">7-day gain</div>
            {sevenDayGain !== null ? (
              <>
                <div className={`text-2xl font-light tabular-nums ${gainTone(sevenDayGain, ctxToday?.pma, ctxToday?.postnatalDays)}`}>
                  {sevenDayGain >= 0 ? '+' : ''}{sevenDayGain.toFixed(1)}
                </div>
                <div className="text-[10px] text-zinc-500">g/kg/day</div>
              </>
            ) : (
              <div className="text-sm text-zinc-500">need 2+ entries</div>
            )}
          </div>
        </div>
        {expectedRange && (
          <div className="text-[11px] text-zinc-500 mt-3 pt-3 border-t border-zinc-800/60">
            Expected for her age: <span className="text-zinc-300 tabular-nums">{expectedRange[0]}–{expectedRange[1]} g/kg/day</span>
            {ctxToday && (
              <>
                {' · '}
                <span className="text-zinc-400">
                  PMA {ctxToday.pma.toFixed(1)}w, day {ctxToday.postnatalDays} postnatal
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sparkline */}
      {weights.length >= 2 && (
        <div className="rounded-xl bg-zinc-900/60 p-3 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
            Weight trend · {weights.length} entries
          </div>
          <WeightSparkline weights={weights} />
        </div>
      )}

      {/* Preterm percentile chart */}
      {weights.length >= 1 && appSettings && (
        <div className="rounded-xl bg-zinc-900/60 p-3 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
            Weight by PMA · preterm girls reference
          </div>
          <GrowthChart
            weights={weights}
            birthDateIso={appSettings.birth_date}
            gestationalAgeWeeks={appSettings.gestational_age_weeks}
            babyName={appSettings.baby_name}
          />
        </div>
      )}

      {/* Plain-language narrative of the weight history */}
      {appSettings && (() => {
        const narrative = buildWeightNarrative({
          weights,
          birthDateIso: appSettings.birth_date,
          gestationalAgeWeeks: appSettings.gestational_age_weeks,
          birthWeightGrams: appSettings.birth_weight_grams,
        })
        return narrative ? <WeightNarrativeCard narrative={narrative} /> : null
      })()}

      {/* Add weight button */}
      {!readOnly && (
        <button
          onClick={() => setAdding(true)}
          className="w-full mb-4 py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium active:scale-[.98]"
        >
          + Add weight
        </button>
      )}

      {/* History list */}
      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Weight history</div>
        {weights.length === 0 ? (
          <div className="text-zinc-500 text-sm">No weights logged yet.</div>
        ) : (
          <ul className="space-y-1">
            {weights.map((w) => {
              const gain = gains.find((g) => g.to.id === w.id)
              const ctx = appSettings ? pmaAtDate(w.recorded_at, appSettings.birth_date, appSettings.gestational_age_weeks) : null
              const isAuto = w.is_auto
              const tappable = !readOnly && !isAuto
              return (
                <li
                  key={w.id}
                  onClick={tappable ? () => setEditing(w) : undefined}
                  className={`rounded-lg p-2 -mx-2 ${tappable ? 'active:bg-zinc-800/60' : ''}`}
                >
                  <div className="flex justify-between items-baseline text-sm">
                    <span className={`flex items-baseline gap-2 ${isAuto ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {fmtDate(w.recorded_at)}
                      {isAuto && (
                        <span className="text-[9px] uppercase tracking-wider text-amber-300/70 bg-amber-300/10 px-1 py-px rounded">est</span>
                      )}
                    </span>
                    <span className={`tabular-nums ${isAuto ? 'text-zinc-500' : ''}`}>
                      {w.weight_grams} g
                    </span>
                  </div>
                  {gain && !isAuto && (
                    <div className={`text-[11px] tabular-nums text-right ${gainTone(gain.g_per_kg_per_day, ctx?.pma, ctx?.postnatalDays)}`}>
                      {gain.g_per_day >= 0 ? '+' : ''}{gain.g_per_day.toFixed(0)} g/day · {gain.g_per_kg_per_day >= 0 ? '+' : ''}{gain.g_per_kg_per_day.toFixed(1)} g/kg/day
                    </div>
                  )}
                  {isAuto && dailyDeltaById.has(w.id) && (
                    <div className="text-[11px] tabular-nums text-right text-zinc-500">
                      {(dailyDeltaById.get(w.id) ?? 0) >= 0 ? '+' : ''}{(dailyDeltaById.get(w.id) ?? 0).toFixed(0)} g · est rate
                    </div>
                  )}
                  {w.notes && <div className="text-[11px] text-zinc-500 mt-0.5">{w.notes}</div>}
                </li>
              )
            })}
          </ul>
        )}
        {appSettings && ctxToday && expectedRange && (
          <div className="text-[11px] text-zinc-500 mt-4 pt-3 border-t border-zinc-800/60 leading-relaxed">
            <div className="text-zinc-300 mb-1">How the gain colours work</div>
            <p>
              Each row's gain colour is judged against the range expected for her age at that point.
              Today (day {ctxToday.postnatalDays}, PMA {ctxToday.pma.toFixed(1)}w): expected{' '}
              <span className="tabular-nums text-zinc-300">{expectedRange[0]}–{expectedRange[1]} g/kg/day</span>.
            </p>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-zinc-400">Full reference</summary>
              <ul className="mt-1 space-y-0.5 list-none pl-3 text-zinc-500 tabular-nums">
                <li>First week: 0–12 g/kg/day (loss/regain phase)</li>
                <li>Days 7–14: 8–16 (rebuilding birth weight)</li>
                <li>PMA &lt; 30 weeks: 17–23</li>
                <li>PMA 30–34 weeks: 15–20</li>
                <li>PMA 34–38 weeks: 12–17</li>
                <li>Term-equivalent (≥ 38 w): 10–15</li>
              </ul>
            </details>
          </div>
        )}
      </div>

      <WeightModal
        open={adding}
        mode="add"
        defaultRate={latest?.ml_per_kg_per_day}
        onClose={() => setAdding(false)}
        onSave={(input) =>
          setWeight.mutate(
            {
              weight_grams: input.weight_grams,
              ml_per_kg_per_day: input.ml_per_kg_per_day,
              notes: input.notes || undefined,
            },
            { onSuccess: () => setAdding(false) },
          )
        }
        saving={setWeight.isPending}
      />

      {editing && (
        <WeightModal
          open
          mode="edit"
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            patchWeight.mutate({ id: editing.id, ...patch }, { onSuccess: () => setEditing(null) })
          }
          onDelete={() => deleteWeight.mutate(editing, { onSuccess: () => setEditing(null) })}
          saving={patchWeight.isPending || deleteWeight.isPending}
        />
      )}
    </>
  )
}
