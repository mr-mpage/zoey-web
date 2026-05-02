import { useEffect, useMemo, useState } from 'react'
import {
  useAppSettings,
  useCreateDiaper,
  useCreateFeed,
  useCreatePump,
  useDashboard,
  useDeleteDiaper,
  useDeleteFeed,
  useDiapers,
  useFeeds,
  usePatchFeed,
  useUpdateAppSettings,
  useWeight,
} from '../api/hooks'
import { AmountModal } from '../components/AmountModal'
import { DiaperListModal } from '../components/DiaperListModal'
import { EncouragementCard } from '../components/EncouragementCard'
import { PaceChip } from '../components/PaceChip'
import { ProgressRing } from '../components/ProgressRing'
import { StatusBadge } from '../components/StatusBadge'
import { useIsReadOnly } from '../lib/authMode'
import { buildEncouragement, buildViewerEncouragement } from '../lib/encouragement'
import { fmtClock, fmtDateLong, fmtMl, fmtRelative, fmtTime, friendlyAge, localDatetimeInput } from '../lib/format'
import { feedingDayKey } from '../lib/feedingday'
import { computeMilestones } from '../lib/milestones'
import type { Diaper, FeedWithComparison } from '../api/types'

function DiaperLastLine({ at }: { at: string | null }) {
  if (!at) {
    return <div className="text-[10px] text-zinc-600 text-center mt-1">none today</div>
  }
  return (
    <div className="text-[10px] text-zinc-500 text-center mt-1 tabular-nums">
      last {fmtTime(at)} · {fmtRelative(at)}
    </div>
  )
}

function DiaperCounter({
  label,
  count,
  onAdd,
  onUndo,
  onOpenList,
  disabled,
}: {
  label: string
  count: number
  onAdd: () => void
  onUndo: () => void
  onOpenList: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center bg-zinc-800/60 rounded-lg overflow-hidden">
      <button
        onClick={onAdd}
        disabled={disabled}
        className="flex-1 px-2 py-2 text-sm active:bg-zinc-700/40 disabled:opacity-50 text-left"
      >
        <span className="text-zinc-400">+ {label}</span>
      </button>
      <button
        onClick={onOpenList}
        disabled={disabled || count === 0}
        aria-label={`Edit today's ${label.toLowerCase()} diapers`}
        className="px-3 py-2 text-sm tabular-nums text-zinc-100 border-l border-zinc-900/60 active:bg-zinc-700/40 disabled:opacity-30"
      >
        {count}
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


type FeedDraft = {
  id?: number
  amount_ml?: number
  fed_at?: string
  notes?: string
  is_extra?: boolean
  method?: 'bottle' | 'breast'
  duration_min?: number | null
  feeding_day_override?: string | null
  /** When editing, the original Feed — used as the snapshot for the
   *  delete-undo toast. New drafts (from +Feed) leave this undefined. */
  original?: FeedWithComparison
}

type FeedSaveInput = {
  amount_ml: number
  at: string
  notes: string
  is_extra: boolean
  method: 'bottle' | 'breast'
  duration_min: number | null
}

type BoundaryPrompt = {
  input: FeedSaveInput
  impliedDay: string
  currentDay: string
}
type PumpDraft = { amount_ml?: number; pumped_at?: string; notes?: string }

export function TodayScreen() {
  const readOnly = useIsReadOnly()
  const { data, isLoading } = useDashboard()
  const { data: weight } = useWeight()
  const { data: appSettings } = useAppSettings()
  // Fetch 2 days, not 1: today's feeding day starts at the anchor (02:30),
  // so a diaper logged between calendar midnight and the anchor belongs to
  // today's feeding day even though it's "yesterday" by date. The window
  // filter below trims to the actual feeding-day bounds.
  const { data: diapers } = useDiapers(2)
  const { data: feedHistory } = useFeeds(180)
  const createFeed = useCreateFeed()
  const patchFeed = usePatchFeed()
  const deleteFeed = useDeleteFeed()
  const createPump = useCreatePump()
  const createDiaper = useCreateDiaper()
  const deleteDiaper = useDeleteDiaper()
  const updateSettings = useUpdateAppSettings()

  const [feedDraft, setFeedDraft] = useState<FeedDraft | null>(null)
  const [pumpDraft, setPumpDraft] = useState<PumpDraft | null>(null)
  const [boundaryPrompt, setBoundaryPrompt] = useState<BoundaryPrompt | null>(null)
  const [diaperList, setDiaperList] = useState<'wet' | 'dirty' | null>(null)

  // Re-render once a minute so the "expected now" tick on the progress ring
  // advances continuously through the day instead of only when feeds are logged.
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const milestone = useMemo(() => {
    if (!data || !appSettings) return null
    const todayMaxFeedMl = data.feeds_today
      .filter((f) => f.method !== 'breast')
      .reduce((m, f) => Math.max(m, f.amount_ml), 0)
    const list = computeMilestones({
      birthDateIso: appSettings.birth_date,
      gestationalAgeWeeks: appSettings.gestational_age_weeks,
      birthWeightGrams: appSettings.birth_weight_grams,
      feeds: feedHistory ?? [],
      weights: weight?.history ?? [],
      todayMaxFeedMl: todayMaxFeedMl > 0 ? todayMaxFeedMl : null,
    })
    return list[0] ?? null
  }, [data, appSettings, feedHistory, weight?.history])

  if (isLoading || !data) {
    return <div className="p-8 text-center text-zinc-500">Loading…</div>
  }

  const dailyTarget = data.daily_target_ml
  const pct = dailyTarget > 0 ? data.feeds_total_ml / dailyTarget : 0
  // Live "next feed" pace line — moves smoothly at a fixed speed of one
  // feed-worth per scheduled interval, sitting exactly at scheduled-feed
  // N's target at scheduled-feed N's due time. Read as: pink hits white
  // each time a bottle is logged on schedule; pink falls behind by up to
  // one feed's worth between feeds, then catches up. Pink past white =
  // banked ahead. Recomputed each minute via the nowMs timer above.
  const dayStartMs = new Date(data.feeding_day_start).getTime()
  const dayEndMs = new Date(data.feeding_day_end).getTime()
  const dayLenMs = dayEndMs - dayStartMs
  const feedsPerDay = appSettings?.feeds_per_day ?? 8
  const intervalMs = feedsPerDay > 0 ? dayLenMs / feedsPerDay : 0
  const elapsedMs = nowMs - dayStartMs
  const expectedAtNextFeedMl =
    intervalMs > 0 && elapsedMs >= 0
      ? Math.min(dailyTarget, (1 + elapsedMs / intervalMs) * data.per_feed_target_ml)
      : 0
  const paceTickPct =
    dailyTarget > 0 && expectedAtNextFeedMl > 0
      ? Math.min(1, expectedAtNextFeedMl / dailyTarget)
      : null

  const todayDiapers = (diapers ?? []).filter((d) => {
    const start = data.feeding_day_start
    const end = data.feeding_day_end
    return d.recorded_at >= start && d.recorded_at < end
  })

  const removeLatestDiaper = (kind: 'wet' | 'dirty') => {
    const latest = [...todayDiapers]
      .filter((d) => d.kind === kind)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] as Diaper | undefined
    if (latest) deleteDiaper.mutate(latest)
  }

  const openEditFeed = (f: FeedWithComparison) =>
    setFeedDraft({
      id: f.id,
      amount_ml: f.amount_ml,
      fed_at: localDatetimeInput(new Date(f.fed_at)),
      notes: f.notes ?? '',
      is_extra: f.is_extra,
      method: f.method,
      duration_min: f.duration_min,
      original: f,
    })

  const saveFeedActual = (
    input: FeedSaveInput,
    overrides?: { is_extra?: boolean; feeding_day_override?: string | null },
  ) => {
    // Always send notes (even ""): on PATCH, an empty string is how the user
    // clears a previously set note. Coercing to undefined hid the field from
    // the JSON, leaving the old note in place.
    const body = {
      amount_ml: input.amount_ml,
      fed_at: input.at,
      notes: input.notes,
      is_extra: overrides?.is_extra ?? input.is_extra,
      method: input.method,
      duration_min: input.duration_min,
      ...(overrides?.feeding_day_override !== undefined
        ? { feeding_day_override: overrides.feeding_day_override }
        : {}),
    }
    if (feedDraft?.id) {
      patchFeed.mutate({ id: feedDraft.id, ...body }, { onSuccess: () => setFeedDraft(null) })
    } else {
      createFeed.mutate(body, { onSuccess: () => setFeedDraft(null) })
    }
  }

  const anchorH = appSettings?.day_start_hour ?? 2
  const anchorM = appSettings?.day_start_minute ?? 30

  const onSaveFeed = (input: FeedSaveInput) => {
    // For brand-new feeds (no existing id), check whether the timestamp lands
    // in a past feeding day. If so, the intent is ambiguous: the user may
    // have meant 'extra at end of yesterday' OR 'first feed of the new day'.
    // Pop a small picker to resolve.
    if (!feedDraft?.id) {
      const ts = new Date(input.at)
      const impliedDay = feedingDayKey(ts, anchorH, anchorM)
      const currentDay = data.today_date
      if (impliedDay < currentDay) {
        setBoundaryPrompt({ input, impliedDay, currentDay })
        return
      }
    }
    saveFeedActual(input)
  }

  const resolveBoundary = (choice: 'extra-yesterday' | 'first-today') => {
    if (!boundaryPrompt) return
    const { input, currentDay } = boundaryPrompt
    if (choice === 'first-today') {
      saveFeedActual(input, { feeding_day_override: currentDay })
    } else {
      saveFeedActual(input, { is_extra: true })
    }
    setBoundaryPrompt(null)
  }

  const onSavePump = (input: { amount_ml: number; at: string; notes: string }) => {
    // The shared AmountModal returns method/duration/is_extra fields too;
    // pumps just ignore them.
    createPump.mutate(
      { amount_ml: input.amount_ml, pumped_at: input.at, notes: input.notes },
      { onSuccess: () => setPumpDraft(null) },
    )
  }

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <div className="text-center">
        <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-zinc-100 text-base">
          <span className="inline-flex items-center gap-1.5">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="rgb(244 175 195)" aria-hidden>
              <path d="M12 21s-7.5-4.6-7.5-10.3a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
            </svg>
            Zoey{appSettings?.birth_date ? ` · ${friendlyAge(appSettings.birth_date)}` : ''}
          </span>
          {milestone && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-300/15 border border-pink-300/25 text-pink-100 text-[12px] px-2.5 py-0.5">
              <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 21s-7.5-4.6-7.5-10.3a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
              </svg>
              {milestone.text}
            </span>
          )}
        </div>
      </div>

      <div className="relative flex justify-center mt-4">
        {pct >= 0.95 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex justify-center"
          >
            <div
              className="w-56 h-56 rounded-full opacity-60 blur-2xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(244,175,195,0.35) 0%, rgba(251,191,36,0.18) 45%, rgba(0,0,0,0) 70%)',
              }}
            />
          </div>
        )}
        <ProgressRing pct={pct} paceTickPct={paceTickPct}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(244 175 195)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="opacity-80"
          >
            <path d="M9 3h6" />
            <path d="M10 3v3.5a3 3 0 0 1-.4 1.5l-1.2 2a4 4 0 0 0-.4 1.7V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.3a4 4 0 0 0-.4-1.7l-1.2-2A3 3 0 0 1 14 6.5V3" />
            <path d="M8 13h8" />
          </svg>
          <div className="text-3xl font-light tabular-nums mt-1">
            {data.feeds_total_ml.toFixed(0)}
            <span className="text-zinc-500 text-base"> / {dailyTarget.toFixed(0)}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">ml today</div>
        </ProgressRing>
      </div>

      <div className="flex justify-center mt-3">
        <PaceChip pace={data.pace_status} gap={data.gap_ml} hasFeeds={data.feeds_today.length > 0} />
      </div>

      <EncouragementCard enc={readOnly ? buildViewerEncouragement(data) : buildEncouragement(data)} />

      {!readOnly && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => setPumpDraft({})}
            className="col-span-1 py-3.5 rounded-xl bg-zinc-800 text-zinc-100 font-medium active:scale-[.98]"
          >
            + Pump
          </button>
          <button
            onClick={() => setFeedDraft({})}
            className="col-span-2 py-3.5 rounded-xl bg-pink-300 text-zinc-900 font-medium active:scale-[.98] flex items-center justify-center gap-2"
          >
            <span>+ Feed</span>
            {(() => {
              const suggest = data.next_feed?.target_ml ?? (data.daily_target_ml > 0 ? data.per_feed_target_ml : null)
              return suggest !== null && suggest > 0 ? (
                <span className="text-zinc-900/60 font-normal tabular-nums">
                  · suggest {suggest.toFixed(0)} ml
                </span>
              ) : null
            })()}
          </button>
        </div>
      )}

      {(() => {
        const lastOf = (kind: 'wet' | 'dirty') => {
          const last = todayDiapers
            .filter((d) => d.kind === kind)
            .sort((a, b) => +new Date(b.recorded_at) - +new Date(a.recorded_at))[0]
          return last ? last.recorded_at : null
        }
        if (readOnly) {
          return (
            <div className="mt-3 rounded-lg bg-zinc-900/50 p-3 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Wet</div>
                <div className="tabular-nums text-zinc-100">{data.diapers_today.wet}</div>
                <DiaperLastLine at={lastOf('wet')} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Dirty</div>
                <div className="tabular-nums text-zinc-100">{data.diapers_today.dirty}</div>
                <DiaperLastLine at={lastOf('dirty')} />
              </div>
            </div>
          )
        }
        return (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <DiaperCounter
                label="Wet"
                count={data.diapers_today.wet}
                onAdd={() => createDiaper.mutate({ kind: 'wet' })}
                onUndo={() => removeLatestDiaper('wet')}
                onOpenList={() => setDiaperList('wet')}
                disabled={createDiaper.isPending || deleteDiaper.isPending}
              />
              <DiaperLastLine at={lastOf('wet')} />
            </div>
            <div>
              <DiaperCounter
                label="Dirty"
                count={data.diapers_today.dirty}
                onAdd={() => createDiaper.mutate({ kind: 'dirty' })}
                onUndo={() => removeLatestDiaper('dirty')}
                onOpenList={() => setDiaperList('dirty')}
                disabled={createDiaper.isPending || deleteDiaper.isPending}
              />
              <DiaperLastLine at={lastOf('dirty')} />
            </div>
          </div>
        )
      })()}

      <DiaperListModal
        open={diaperList !== null}
        kind={diaperList ?? 'wet'}
        entries={todayDiapers.filter((d) => d.kind === (diaperList ?? 'wet'))}
        onClose={() => setDiaperList(null)}
      />

      {data.breastfeeds_today_count > 0 && (
        <div className="mt-2 text-[11px] text-zinc-500 text-center">
          {data.breastfeeds_today_count} breastfeed{data.breastfeeds_today_count === 1 ? '' : 's'} today
          {data.breastfeeds_today_ml_est > 0 && <> · ~{data.breastfeeds_today_ml_est.toFixed(0)} ml estimated</>}
          {data.breastfeeds_today_minutes > 0 && <> · {data.breastfeeds_today_minutes} min total</>}
        </div>
      )}

      {!data.next_feed && data.feeds_remaining === 0 && data.daily_target_ml > 0 && (() => {
        const totalDelta = data.feeds_total_ml - data.daily_target_ml
        const onTarget = Math.abs(totalDelta) <= data.daily_target_ml * 0.05
        const dayRolloverRel = fmtRelative(data.feeding_day_end)
        const dayRolloverClock = fmtClock(data.feeding_day_end)
        const tone = onTarget
          ? { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', accent: 'text-emerald-300', word: 'On target' }
          : totalDelta > 0
            ? { border: 'border-sky-500/30', bg: 'bg-sky-500/5', accent: 'text-sky-300', word: `${totalDelta.toFixed(0)} ml above` }
            : { border: 'border-amber-500/30', bg: 'bg-amber-500/5', accent: 'text-amber-300', word: `${Math.abs(totalDelta).toFixed(0)} ml under` }
        const scheduledCount = data.feeds_today.filter((f) => !f.is_extra).length
        const nextSuggest = data.per_feed_target_ml
        const startNewDayNow = () => {
          const now = new Date()
          updateSettings.mutate({
            day_start_hour: now.getHours(),
            day_start_minute: now.getMinutes(),
          })
        }
        return (
          <div className={`mt-5 rounded-2xl border ${tone.border} ${tone.bg} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-wider ${tone.accent}`}>Day complete</div>
                <div className="text-xl font-light mt-0.5 tabular-nums">
                  {data.feeds_total_ml.toFixed(0)} ml
                  <span className="text-zinc-500 text-base"> / {data.daily_target_ml.toFixed(0)} ml</span>
                </div>
                <div className={`text-[11px] mt-0.5 ${tone.accent}`}>{tone.word}</div>
              </div>
              <div className="text-right text-xs text-zinc-400">
                <div>{scheduledCount} feeds done</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-current/10 flex items-baseline justify-between gap-2 text-[12px]">
              <div className="text-zinc-500">
                Next feed <span className="text-pink-200">#1</span> at{' '}
                <span className="text-zinc-200 tabular-nums">{dayRolloverClock}</span>{' '}
                <span className="text-zinc-500">· {dayRolloverRel}</span>
              </div>
              <div className="text-zinc-500">
                suggest <span className="text-zinc-100 tabular-nums">{nextSuggest.toFixed(0)} ml</span>
              </div>
            </div>
            {!readOnly && (
              <>
                <button
                  onClick={startNewDayNow}
                  disabled={updateSettings.isPending}
                  className="mt-3 w-full py-2.5 rounded-lg bg-zinc-800 text-zinc-200 text-sm active:scale-[.98] disabled:opacity-40"
                >
                  {updateSettings.isPending ? 'Rolling over…' : 'Start new day now'}
                </button>
                <div className="mt-1.5 text-[10px] text-zinc-600 text-center">
                  Shifts the day-start time to now. Reversible in Settings → Feeding schedule.
                </div>
              </>
            )}
          </div>
        )
      })()}

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

        const fitMap = {
          fits: { tone: 'text-zinc-500', word: 'fits the day' },
          tight: { tone: 'text-amber-300', word: 'tight — last feed close to day-end' },
          overflow: { tone: 'text-rose-300', word: "won't fit — consider one extra or shorter intervals" },
        } as const
        const fit = data.day_fit !== 'n/a' ? fitMap[data.day_fit] : null

        const driftLabel = (() => {
          if (data.schedule_drift_min === null || data.feeds_today.filter((f) => !f.is_extra).length === 0) return null
          const m = data.schedule_drift_min
          if (m === 0) return 'on schedule'
          if (m > 0) return `running ${m} min late`
          return `running ${-m} min ahead`
        })()

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
            {(driftLabel || fit) && (
              <div className="mt-3 pt-3 border-t border-pink-300/10 text-[11px] flex items-baseline justify-between gap-2">
                {driftLabel && <span className="text-zinc-500">{driftLabel}</span>}
                {fit && data.projected_last_feed_at && (
                  <span className={fit.tone}>
                    last #{data.weight.feeds_per_day} ~{fmtClock(data.projected_last_feed_at)} · {fit.word}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })()}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-zinc-900/50 px-2 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Avg</div>
          <div className="tabular-nums text-[13px] text-zinc-200 leading-tight mt-0.5">{fmtMl(data.feeds_avg_ml)}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/50 px-2 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Per feed</div>
          <div className="tabular-nums text-[13px] text-zinc-200 leading-tight mt-0.5">{fmtMl(data.per_feed_target_ml)}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/50 px-2 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Left</div>
          <div className="tabular-nums text-[13px] text-zinc-200 leading-tight mt-0.5">{data.feeds_remaining}</div>
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
            {[...data.feeds_today].reverse().map((f, i) => {
              const isBreast = f.method === 'breast'
              return (
                <li
                  key={f.id}
                  onClick={readOnly ? undefined : () => openEditFeed(f)}
                  className={`rounded-xl p-3 flex items-center gap-3 ${
                    readOnly ? '' : 'active:bg-zinc-900'
                  } ${
                    f.is_extra ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-zinc-900/60'
                  } ${i === 0 ? 'animate-feed-fade-in' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] ${
                    f.is_extra ? 'bg-amber-500/15 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {f.is_extra ? 'EXT' : `#${f.feed_index}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="tabular-nums text-lg">
                        {f.amount_ml.toFixed(0)} ml
                      </span>
                      {isBreast && (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                          breast · est
                        </span>
                      )}
                      {f.is_extra && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-300/80">extra · off-schedule</span>
                      )}
                      {!f.is_extra && !isBreast && f.comparison && (
                        <StatusBadge status={f.status} sampleDays={f.comparison.sample_days} />
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {fmtTime(f.fed_at)}
                      {isBreast && f.duration_min != null && f.duration_min > 0 && (
                        <> · {f.duration_min} min</>
                      )}
                      {!f.is_extra && !isBreast && f.comparison && f.comparison.avg_ml !== null && (
                        <> · 7d avg {f.comparison.avg_ml.toFixed(0)} ml ({f.comparison.min_ml?.toFixed(0)}–{f.comparison.max_ml?.toFixed(0)})</>
                      )}
                      {f.notes && <> · {f.notes}</>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AmountModal
        open={feedDraft !== null}
        title={feedDraft?.id ? 'Edit feed' : 'Log feed'}
        initialAmount={feedDraft?.amount_ml ?? data.next_feed?.target_ml ?? data.per_feed_target_ml ?? 0}
        initialTime={feedDraft?.fed_at}
        initialNotes={feedDraft?.notes}
        initialIsExtra={feedDraft?.is_extra}
        initialMethod={feedDraft?.method}
        initialDurationMin={feedDraft?.duration_min}
        showExtraToggle
        showMethodToggle
        hint={
          !feedDraft?.id && data.next_feed
            ? `Suggested ${data.next_feed.target_ml.toFixed(0)} ml${
                data.next_feed.historical_avg_ml !== null && data.next_feed.historical_avg_ml !== undefined
                  ? ` · 7d avg for #${data.next_feed.feed_index}: ${data.next_feed.historical_avg_ml.toFixed(0)} ml`
                  : ''
              }`
            : null
        }
        onClose={() => setFeedDraft(null)}
        onSave={onSaveFeed}
        onDelete={feedDraft?.original ? () => deleteFeed.mutate(feedDraft.original!, { onSuccess: () => setFeedDraft(null) }) : undefined}
        saving={createFeed.isPending || patchFeed.isPending || deleteFeed.isPending}
      />

      <AmountModal
        open={pumpDraft !== null}
        title="Log pump"
        initialAmount={80}
        defaultSliderMax={300}
        onClose={() => setPumpDraft(null)}
        onSave={onSavePump}
        saving={createPump.isPending}
      />

      {boundaryPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setBoundaryPrompt(null)}>
          <div
            className="w-full sm:max-w-sm bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-medium mb-1.5">Which day is this feed?</div>
            <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
              {fmtClock(boundaryPrompt.input.at)} on {fmtDateLong(boundaryPrompt.input.at)} sits before today's
              anchor — it could be the last feed of yesterday's day, or the first of today's.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => resolveBoundary('first-today')}
                className="w-full py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium active:scale-[.98]"
              >
                First feed of today ({boundaryPrompt.currentDay})
              </button>
              <button
                onClick={() => resolveBoundary('extra-yesterday')}
                className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-200 active:scale-[.98]"
              >
                Extra at end of {boundaryPrompt.impliedDay}
              </button>
              <button
                onClick={() => setBoundaryPrompt(null)}
                className="w-full py-2.5 rounded-xl text-zinc-500 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
