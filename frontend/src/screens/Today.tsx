import { useState } from 'react'
import {
  useCreateDiaper,
  useCreateFeed,
  useCreatePump,
  useDashboard,
  useDeleteDiaper,
  useDeleteFeed,
  useDiapers,
  usePatchFeed,
  useWeight,
} from '../api/hooks'
import { AmountModal } from '../components/AmountModal'
import { EncouragementCard } from '../components/EncouragementCard'
import { PaceChip } from '../components/PaceChip'
import { ProgressRing } from '../components/ProgressRing'
import { StatusBadge } from '../components/StatusBadge'
import { ZOEY_BIRTH_ISO } from '../lib/constants'
import { buildEncouragement } from '../lib/encouragement'
import { ageInDays, fmtClock, fmtDateLong, fmtMl, fmtRelative, fmtTime, localDatetimeInput } from '../lib/format'
import { gainTone, rollingGainRate } from '../lib/growth'
import type { Diaper, FeedWithComparison } from '../api/types'

function DiaperCounter({
  label,
  count,
  onAdd,
  onUndo,
  disabled,
}: {
  label: string
  count: number
  onAdd: () => void
  onUndo: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center bg-zinc-800/60 rounded-lg overflow-hidden">
      <button
        onClick={onAdd}
        disabled={disabled}
        className="flex-1 px-2 py-2 text-sm flex items-center justify-between gap-2 active:bg-zinc-700/40 disabled:opacity-50"
      >
        <span className="text-zinc-400">+ {label}</span>
        <span className="tabular-nums text-zinc-100">{count}</span>
      </button>
      <button
        onClick={onUndo}
        disabled={disabled || count === 0}
        aria-label={`Undo last ${label}`}
        className="px-2.5 py-2 text-zinc-500 active:text-zinc-300 border-l border-zinc-900/60 disabled:opacity-30"
      >
        −
      </button>
    </div>
  )
}


type FeedDraft = { id?: number; amount_ml?: number; fed_at?: string; notes?: string; is_extra?: boolean }
type PumpDraft = { amount_ml?: number; pumped_at?: string; notes?: string }

export function TodayScreen() {
  const { data, isLoading } = useDashboard()
  const { data: weight } = useWeight()
  const { data: diapers } = useDiapers(1)
  const createFeed = useCreateFeed()
  const patchFeed = usePatchFeed()
  const deleteFeed = useDeleteFeed()
  const createPump = useCreatePump()
  const createDiaper = useCreateDiaper()
  const deleteDiaper = useDeleteDiaper()

  const [feedDraft, setFeedDraft] = useState<FeedDraft | null>(null)
  const [pumpDraft, setPumpDraft] = useState<PumpDraft | null>(null)

  if (isLoading || !data) {
    return <div className="p-8 text-center text-zinc-500">Loading…</div>
  }

  const dailyTarget = data.daily_target_ml
  const pct = dailyTarget > 0 ? data.feeds_total_ml / dailyTarget : 0
  const day = ageInDays(ZOEY_BIRTH_ISO)
  const gain = rollingGainRate(weight?.history ?? [], 7)

  const todayDiapers = (diapers ?? []).filter((d) => {
    const start = data.feeding_day_start
    const end = data.feeding_day_end
    return d.recorded_at >= start && d.recorded_at < end
  })

  const removeLatestDiaper = (kind: 'wet' | 'dirty') => {
    const latest = [...todayDiapers]
      .filter((d) => d.kind === kind)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] as Diaper | undefined
    if (latest) deleteDiaper.mutate(latest.id)
  }

  const openEditFeed = (f: FeedWithComparison) =>
    setFeedDraft({
      id: f.id,
      amount_ml: f.amount_ml,
      fed_at: localDatetimeInput(new Date(f.fed_at)),
      notes: f.notes ?? '',
      is_extra: f.is_extra,
    })

  const onSaveFeed = (input: { amount_ml: number; at: string; notes: string; is_extra: boolean }) => {
    const body = {
      amount_ml: input.amount_ml,
      fed_at: input.at,
      notes: input.notes || undefined,
      is_extra: input.is_extra,
    }
    if (feedDraft?.id) {
      patchFeed.mutate({ id: feedDraft.id, ...body }, { onSuccess: () => setFeedDraft(null) })
    } else {
      createFeed.mutate(body, { onSuccess: () => setFeedDraft(null) })
    }
  }

  const onSavePump = (input: { amount_ml: number; at: string; notes: string }) => {
    createPump.mutate(
      { amount_ml: input.amount_ml, pumped_at: input.at, notes: input.notes || undefined },
      { onSuccess: () => setPumpDraft(null) },
    )
  }

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-1">
        Day {day} · {fmtDateLong(data.today_date)}
      </div>

      <div className="flex justify-center mt-4">
        <ProgressRing pct={pct}>
          <div className="text-3xl font-light tabular-nums">
            {data.feeds_total_ml.toFixed(0)}
            <span className="text-zinc-500 text-base"> / {dailyTarget.toFixed(0)}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">ml today</div>
        </ProgressRing>
      </div>

      <div className="flex flex-col items-center gap-1.5 mt-3">
        <PaceChip pace={data.pace_status} gap={data.gap_ml} hasFeeds={data.feeds_today.length > 0} />
        {gain !== null && (
          <div className="text-xs">
            <span className="text-zinc-500">7-day gain </span>
            <span className={`tabular-nums ${gainTone(gain)}`}>
              {gain >= 0 ? '+' : ''}{gain.toFixed(1)} g/kg/day
            </span>
          </div>
        )}
      </div>

      <EncouragementCard enc={buildEncouragement(data)} />

      <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
        <div className="rounded-xl bg-zinc-900/60 py-3">
          <div className="text-zinc-500 text-[11px] uppercase tracking-wider">Avg</div>
          <div className="tabular-nums">{fmtMl(data.feeds_avg_ml)}</div>
        </div>
        <div className="rounded-xl bg-zinc-900/60 py-3">
          <div className="text-zinc-500 text-[11px] uppercase tracking-wider">Per feed</div>
          <div className="tabular-nums">{fmtMl(data.per_feed_target_ml)}</div>
        </div>
        <div className="rounded-xl bg-zinc-900/60 py-3">
          <div className="text-zinc-500 text-[11px] uppercase tracking-wider">Left</div>
          <div className="tabular-nums">{data.feeds_remaining}</div>
        </div>
      </div>

      {data.next_feed && (() => {
        const nf = data.next_feed
        const delta = Math.round(nf.target_ml - nf.base_target_ml)
        const expectedClock = fmtClock(nf.expected_at)
        const expectedRel = fmtRelative(nf.expected_at)
        const subline =
          delta > 0
            ? `${delta} ml extra to catch up · even pace ${nf.base_target_ml.toFixed(0)} ml`
            : delta < 0
              ? `${Math.abs(delta)} ml less, she's ahead · even pace ${nf.base_target_ml.toFixed(0)} ml`
              : `at even pace · ${nf.base_target_ml.toFixed(0)} ml`
        const overdue = expectedRel.includes('ago')
        return (
          <div className="mt-5 rounded-2xl border border-pink-300/20 bg-pink-300/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-pink-300/80 uppercase tracking-wider">
                  Next feed · #{nf.feed_index}
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-light tabular-nums">{expectedClock}</span>
                  <span className={`text-[11px] ${overdue ? 'text-amber-300' : 'text-zinc-500'}`}>{expectedRel}</span>
                </div>
                <div className="text-base text-zinc-200 mt-1.5 tabular-nums">{nf.target_ml.toFixed(0)} ml</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{subline}</div>
              </div>
              <div className="text-right text-xs text-zinc-400">
                {nf.historical_avg_ml !== null ? (
                  <>last 7d avg<br /><span className="text-zinc-200 text-base tabular-nums">{nf.historical_avg_ml.toFixed(0)} ml</span></>
                ) : (
                  <span className="text-zinc-600">no history yet</span>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => setPumpDraft({})}
          className="col-span-1 py-3.5 rounded-xl bg-zinc-800 text-zinc-100 font-medium active:scale-[.98]"
        >
          + Pump
        </button>
        <button
          onClick={() => setFeedDraft({})}
          className="col-span-2 py-3.5 rounded-xl bg-pink-300 text-zinc-900 font-medium active:scale-[.98]"
        >
          + Feed
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-zinc-900/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Diapers today</span>
          <span className="text-xs text-zinc-400 tabular-nums">{data.diapers_today.wet} wet · {data.diapers_today.dirty} dirty</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <DiaperCounter
            label="Wet"
            count={data.diapers_today.wet}
            onAdd={() => createDiaper.mutate({ kind: 'wet' })}
            onUndo={() => removeLatestDiaper('wet')}
            disabled={createDiaper.isPending || deleteDiaper.isPending}
          />
          <DiaperCounter
            label="Dirty"
            count={data.diapers_today.dirty}
            onAdd={() => createDiaper.mutate({ kind: 'dirty' })}
            onUndo={() => removeLatestDiaper('dirty')}
            disabled={createDiaper.isPending || deleteDiaper.isPending}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2 px-1">Today's feeds</div>
        {data.feeds_today.length === 0 ? (
          <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">
            No feeds yet today.
          </div>
        ) : (
          <ul className="space-y-2">
            {[...data.feeds_today].reverse().map((f) => (
              <li
                key={f.id}
                onClick={() => openEditFeed(f)}
                className={`rounded-xl p-3 flex items-center gap-3 active:bg-zinc-900 ${
                  f.is_extra ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-zinc-900/60'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] ${
                  f.is_extra ? 'bg-amber-500/15 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {f.is_extra ? 'EXT' : `#${f.feed_index}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-lg">{f.amount_ml.toFixed(0)} ml</span>
                    {f.is_extra ? (
                      <span className="text-[10px] uppercase tracking-wider text-amber-300/80">extra · off-schedule</span>
                    ) : (
                      f.comparison && <StatusBadge status={f.status} sampleDays={f.comparison.sample_days} />
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {fmtTime(f.fed_at)}
                    {!f.is_extra && f.comparison && f.comparison.avg_ml !== null && (
                      <> · 7d avg {f.comparison.avg_ml.toFixed(0)} ml ({f.comparison.min_ml?.toFixed(0)}–{f.comparison.max_ml?.toFixed(0)})</>
                    )}
                    {f.notes && <> · {f.notes}</>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AmountModal
        open={feedDraft !== null}
        title={feedDraft?.id ? 'Edit feed' : 'Log feed'}
        initialAmount={feedDraft?.amount_ml ?? data.next_feed?.target_ml ?? data.per_feed_target_ml}
        initialTime={feedDraft?.fed_at}
        initialNotes={feedDraft?.notes}
        initialIsExtra={feedDraft?.is_extra}
        showExtraToggle
        hint={
          !feedDraft?.id && data.next_feed?.historical_avg_ml !== null && data.next_feed?.historical_avg_ml !== undefined
            ? `7-day avg for feed #${data.next_feed.feed_index}: ${data.next_feed.historical_avg_ml.toFixed(0)} ml`
            : null
        }
        onClose={() => setFeedDraft(null)}
        onSave={onSaveFeed}
        onDelete={feedDraft?.id ? () => deleteFeed.mutate(feedDraft.id!, { onSuccess: () => setFeedDraft(null) }) : undefined}
        saving={createFeed.isPending || patchFeed.isPending || deleteFeed.isPending}
      />

      <AmountModal
        open={pumpDraft !== null}
        title="Log pump"
        initialAmount={80}
        onClose={() => setPumpDraft(null)}
        onSave={onSavePump}
        saving={createPump.isPending}
      />
    </div>
  )
}
