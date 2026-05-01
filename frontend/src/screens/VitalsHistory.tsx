import { useVitalsSummary, type VitalsDay } from '../api/hooks'
import {
  HR_AVG_TYPICAL_HIGH,
  HR_AVG_TYPICAL_LOW,
  SPO2_FLAG,
  SPO2_HEALTHY,
  SPO2_WATCH,
  buildVitalsNarrative,
} from '../lib/vitalsNarrative'

function fmtHours(min: number): string {
  if (min < 60) return `${min} min`
  return `${(min / 60).toFixed(1)} h`
}

function fmtHr(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}`
}

function fmtSpo2(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today'
  const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86_400_000)
  const d = new Date(iso + 'T00:00:00')
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function spo2ColorClass(v: number | null): string {
  if (v == null) return 'text-zinc-500'
  if (v >= SPO2_HEALTHY) return 'text-emerald-300'
  if (v >= SPO2_WATCH) return 'text-yellow-300'
  if (v >= SPO2_FLAG) return 'text-amber-300'
  return 'text-rose-300'
}

function spo2BgFill(v: number | null): string {
  if (v == null) return 'bg-zinc-700'
  if (v >= SPO2_HEALTHY) return 'bg-emerald-300'
  if (v >= SPO2_WATCH) return 'bg-yellow-300'
  if (v >= SPO2_FLAG) return 'bg-amber-300'
  return 'bg-rose-300'
}

function hrAvgColorClass(v: number | null): string {
  if (v == null) return 'text-zinc-500'
  if (v >= HR_AVG_TYPICAL_LOW && v <= HR_AVG_TYPICAL_HIGH) return 'text-emerald-300'
  return 'text-yellow-300'
}

function hrAvgBgClass(v: number | null, isToday: boolean): string {
  if (v == null) return 'bg-zinc-700'
  const inRange = v >= HR_AVG_TYPICAL_LOW && v <= HR_AVG_TYPICAL_HIGH
  if (inRange) return isToday ? 'bg-emerald-200' : 'bg-emerald-300'
  return isToday ? 'bg-yellow-200' : 'bg-yellow-300'
}

function NotConfiguredCard() {
  return (
    <div className="rounded-xl bg-zinc-900/40 p-6 text-center">
      <div className="text-zinc-300 mb-1">Vitals integration not configured</div>
      <p className="text-[12px] text-zinc-500 leading-relaxed">
        Add Owlet credentials to <code className="text-zinc-400">.env</code> and restart the
        container. The poller will pick up readings automatically.
      </p>
    </div>
  )
}

function NoDataYetCard() {
  return (
    <div className="rounded-xl bg-zinc-900/40 p-6 text-center">
      <div className="text-zinc-300 mb-1">Waiting for first readings</div>
      <p className="text-[12px] text-zinc-500 leading-relaxed">
        The Owlet poller is connected. Readings appear here as soon as the sock is on
        and reporting.
      </p>
    </div>
  )
}

function TodayCard({ row }: { row: VitalsDay }) {
  if (row.monitoring_minutes === 0) {
    return (
      <div className="rounded-xl bg-zinc-900/60 p-4 mb-4">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Today</div>
        <div className="text-[12px] text-zinc-500 italic">No monitoring data for today yet.</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-zinc-900/60 p-4 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Today</div>
        <div className="text-[11px] text-zinc-500 tabular-nums">
          {fmtHours(row.monitoring_minutes)} · {row.session_count} session{row.session_count === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Heart rate</div>
          <div className={`text-2xl font-light tabular-nums leading-none mt-1 ${hrAvgColorClass(row.hr_avg)}`}>
            {fmtHr(row.hr_avg)}
            <span className="text-zinc-500 text-base font-normal ml-1">avg</span>
          </div>
          {row.hr_min != null && row.hr_max != null && (
            <div className="text-[11px] text-zinc-500 tabular-nums mt-1">
              {fmtHr(row.hr_min)}–{fmtHr(row.hr_max)} BPM range
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Lowest SpO₂</div>
          <div className={`text-2xl font-light tabular-nums leading-none mt-1 ${spo2ColorClass(row.spo2_min_avg10)}`}>
            {fmtSpo2(row.spo2_min_avg10)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">sustained reading (brief blips are filtered out)</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-800/60 text-[11px]">
        <div className="text-zinc-500">
          {row.sample_count} sample{row.sample_count === 1 ? '' : 's'}
        </div>
        {row.spo2_avg != null && (
          <div className="text-zinc-500">
            avg SpO₂ <span className="text-zinc-300 tabular-nums">{fmtSpo2(row.spo2_avg)}</span>
          </div>
        )}
        {row.low_spo2_alert_count > 0 ? (
          <div className="ml-auto text-amber-300">
            {row.low_spo2_alert_count} low-SpO₂ alert{row.low_spo2_alert_count === 1 ? '' : 's'}
          </div>
        ) : (
          <div className="ml-auto text-zinc-500">No alerts</div>
        )}
      </div>
    </div>
  )
}

function WeekChartCard({ days, today }: { days: VitalsDay[]; today: string }) {
  const recent = days.filter((d) => d.monitoring_minutes >= 30)
  if (recent.length === 0) return null

  const hrAvgs = recent.map((d) => d.hr_avg).filter((v): v is number => v != null)
  const hrMaxes = recent.map((d) => d.hr_max).filter((v): v is number => v != null)
  const hrMins = recent.map((d) => d.hr_min).filter((v): v is number => v != null)
  const totalAlerts = recent.reduce((s, d) => s + d.low_spo2_alert_count, 0)
  const minSpo2 = recent
    .map((d) => d.spo2_min_avg10)
    .filter((v): v is number => v != null)
    .reduce((m, v) => Math.min(m, v), Infinity)
  const minSpo2Day = recent.find((d) => d.spo2_min_avg10 === minSpo2)?.feeding_day

  // Y-axis: include the entire min-max range across the week
  const barMax = Math.max(170, ...hrMaxes)
  const barMin = Math.min(120, ...hrMins)
  const barRange = Math.max(barMax - barMin, 1)

  return (
    <div className="rounded-xl bg-zinc-900/60 p-4 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Past {days.length} days</div>
        {totalAlerts > 0 && (
          <div className="text-[11px] text-amber-300 tabular-nums">
            {totalAlerts} alert{totalAlerts === 1 ? '' : 's'} total
          </div>
        )}
      </div>

      {/* HR range bars: vertical bar = day's min-max, dot = day's average.
          Y-axis = BPM (high at top), X-axis = days (left = oldest).
          Y-axis labels live on the LEFT edge so they read as a vertical
          scale, not as horizontal endpoints. */}
      <div className="flex gap-2 mb-2">
        <div className="relative w-8 h-24 text-[9px] text-zinc-500 tabular-nums">
          <span className="absolute top-0 right-0">{barMax.toFixed(0)}</span>
          <span className="absolute bottom-0 right-0">{barMin.toFixed(0)}</span>
          <span className="absolute top-1/2 -translate-y-1/2 right-0 text-[8px] text-zinc-600">BPM</span>
        </div>
        <div className="relative h-24 flex-1">
          {(() => {
            const lowPct = ((HR_AVG_TYPICAL_LOW - barMin) / barRange) * 100
            const highPct = ((HR_AVG_TYPICAL_HIGH - barMin) / barRange) * 100
            if (highPct <= 0 || lowPct >= 100) return null
            const top = Math.min(highPct, 100)
            const bottom = Math.max(lowPct, 0)
            return (
              <div
                className="absolute inset-x-0 bg-emerald-500/[0.07] border-y border-emerald-500/15 pointer-events-none"
                style={{ bottom: `${bottom}%`, height: `${top - bottom}%` }}
              />
            )
          })()}
          <div className="flex items-end gap-1.5 h-full">
            {days.map((d) => {
              const isToday = d.feeding_day === today
              if (d.hr_avg == null || d.hr_min == null || d.hr_max == null) {
                return <div key={d.feeding_day} className="flex-1 h-full" />
              }
              const rangeBottom = ((d.hr_min - barMin) / barRange) * 100
              const rangeTop = ((d.hr_max - barMin) / barRange) * 100
              const avgPos = ((d.hr_avg - barMin) / barRange) * 100
              return (
                <div
                  key={d.feeding_day}
                  className="flex-1 relative h-full"
                  title={`${dayLabel(d.feeding_day, today)}: ${fmtHr(d.hr_min)}–${fmtHr(d.hr_max)}, avg ${fmtHr(d.hr_avg)}`}
                >
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-1 rounded-sm bg-zinc-500/50"
                    style={{ bottom: `${rangeBottom}%`, height: `${rangeTop - rangeBottom}%` }}
                  />
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ${hrAvgBgClass(d.hr_avg, isToday)}`}
                    style={{ bottom: `calc(${avgPos}% - 5px)` }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="text-[9px] text-emerald-400/60 text-center mb-3">
        green band: typical {HR_AVG_TYPICAL_LOW}–{HR_AVG_TYPICAL_HIGH} BPM (preterm/newborn)
      </div>

      {/* SpO2 sparkline: lowest smoothed value per day, coloured by band.
          Y-axis = SpO2 % (high at top), X-axis = days. Same layout pattern
          as the HR chart so the axes read consistently. */}
      {(() => {
        const spo2s = days.map((d) => d.spo2_min_avg10)
        const validSpo2s = spo2s.filter((v): v is number => v != null)
        if (validSpo2s.length === 0) return null
        const sMin = Math.min(85, Math.floor(Math.min(...validSpo2s)))
        const sMax = 100
        const sRange = sMax - sMin
        return (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
              Lowest sustained SpO₂ per day
            </div>
            <div className="flex gap-2">
              <div className="relative w-8 h-12 text-[9px] text-zinc-500 tabular-nums">
                <span className="absolute top-0 right-0">{sMax}</span>
                <span className="absolute bottom-0 right-0">{sMin}</span>
                <span className="absolute top-1/2 -translate-y-1/2 right-0 text-[8px] text-zinc-600">%</span>
              </div>
              <div className="flex items-end gap-1.5 h-12 flex-1">
                {days.map((d) => {
                  const v = d.spo2_min_avg10
                  if (v == null) return <div key={d.feeding_day} className="flex-1 h-full" />
                  const h = ((v - sMin) / sRange) * 100
                  return (
                    <div
                      key={d.feeding_day}
                      className={`flex-1 rounded-sm ${spo2BgFill(v)} ${
                        d.feeding_day === today ? 'opacity-100' : 'opacity-75'
                      }`}
                      style={{ height: `${Math.max(h, 6)}%` }}
                      title={`${dayLabel(d.feeding_day, today)}: ${fmtSpo2(v)}`}
                    />
                  )
                })}
              </div>
            </div>
            <div className="text-[9px] text-emerald-400/60 text-center mt-1">
              ≥ {SPO2_HEALTHY}% in target (preterm ≥32w PMA: 92–98%)
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800/60 text-[12px]">
        {hrAvgs.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">HR weekly avg</div>
            <div className="tabular-nums text-zinc-200">
              {Math.round(Math.min(...hrAvgs))}–{Math.round(Math.max(...hrAvgs))}
            </div>
          </div>
        )}
        {minSpo2 !== Infinity && minSpo2Day && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Lowest SpO₂</div>
            <div className={`tabular-nums ${spo2ColorClass(minSpo2)}`}>
              {fmtSpo2(minSpo2)}
              <span className="text-zinc-600 text-[10px]"> {dayLabel(minSpo2Day, today)}</span>
            </div>
          </div>
        )}
      </div>

      {minSpo2 !== Infinity && minSpo2 < SPO2_FLAG && minSpo2Day && (
        <div className="text-[11px] text-amber-300 mt-3 leading-relaxed pt-3 border-t border-zinc-800/60">
          {dayLabel(minSpo2Day, today)}'s lowest sustained SpO₂ was {Math.round(minSpo2)}% — worth
          mentioning at the next visit.
        </div>
      )}
    </div>
  )
}

function PerDayList({ days, today }: { days: VitalsDay[]; today: string }) {
  // Drop empty days entirely — no point showing a "no data" row for days
  // the sock wasn't on or before the integration was running.
  const sorted = [...days]
    .filter((d) => d.monitoring_minutes > 0)
    .sort((a, b) => b.feeding_day.localeCompare(a.feeding_day))

  if (sorted.length === 0) return null

  return (
    <div className="rounded-xl bg-zinc-900/60 p-4 mb-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">Per day</div>
      <ul className="space-y-1.5">
        {sorted.map((d) => {
          const isToday = d.feeding_day === today
          return (
            <li key={d.feeding_day} className="py-1.5 border-b border-zinc-800/40 last:border-b-0">
              <div className="flex items-baseline justify-between">
                <span className={`text-[13px] ${isToday ? 'text-zinc-100' : 'text-zinc-300'}`}>
                  {dayLabel(d.feeding_day, today)}
                </span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {fmtHours(d.monitoring_minutes)}
                  {d.session_count > 1 && ` · ${d.session_count} sessions`}
                </span>
              </div>
              <div className="flex items-baseline gap-3 text-[11px] tabular-nums mt-0.5">
                <span className="text-zinc-400">
                  HR <span className={hrAvgColorClass(d.hr_avg)}>{fmtHr(d.hr_avg)}</span>
                  {d.hr_min != null && d.hr_max != null && (
                    <span className="text-zinc-600"> ({fmtHr(d.hr_min)}–{fmtHr(d.hr_max)})</span>
                  )}
                </span>
                <span className={spo2ColorClass(d.spo2_min_avg10)}>
                  ↓ {fmtSpo2(d.spo2_min_avg10)}
                </span>
                {d.low_spo2_alert_count > 0 && (
                  <span className="text-amber-300 ml-auto">
                    {d.low_spo2_alert_count} alert{d.low_spo2_alert_count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const NARRATIVE_TONE = {
  celebrate: { border: 'border-sky-500/30',     bg: 'bg-sky-500/5',     accent: 'text-sky-300',     dot: 'bg-sky-400' },
  positive:  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', accent: 'text-emerald-300', dot: 'bg-emerald-400' },
  neutral:   { border: 'border-zinc-700/40',    bg: 'bg-zinc-900/40',   accent: 'text-zinc-300',    dot: 'bg-zinc-500' },
  concern:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   accent: 'text-amber-300',   dot: 'bg-amber-400' },
} as const

function NarrativeCard({ days }: { days: VitalsDay[] }) {
  const n = buildVitalsNarrative(days)
  if (!n) return null
  const t = NARRATIVE_TONE[n.tone]
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-3 mb-4`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className={`text-[10px] uppercase tracking-wider ${t.accent}`}>This week</span>
      </div>
      <div className="text-sm text-zinc-100 leading-snug">{n.headline}</div>
      <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{n.detail}</div>
    </div>
  )
}

export function VitalsHistorySection() {
  const { data, isLoading } = useVitalsSummary(14)

  if (isLoading) return null
  if (!data) return null
  if (!data.configured) return <NotConfiguredCard />

  const today = data.days.length > 0 ? data.days[data.days.length - 1].feeding_day : ''
  const todayRow = data.days[data.days.length - 1]
  const anyData = data.days.some((d) => d.monitoring_minutes > 0)

  if (!anyData) return <NoDataYetCard />

  // Narrative summarises *completed* days only — today is incomplete and
  // shown separately in TodayCard. Matches the Overview tab's logic so the
  // monitored-day count agrees across views.
  const completedDays = data.days.slice(0, -1).slice(-7)

  return (
    <>
      {todayRow && <TodayCard row={todayRow} />}
      <NarrativeCard days={completedDays} />
      <WeekChartCard days={data.days.slice(-7)} today={today} />
      <PerDayList days={data.days} today={today} />

      <details className="text-[11px] text-zinc-500 leading-relaxed mt-2">
        <summary className="cursor-pointer text-zinc-400">What these numbers mean</summary>
        <div className="mt-2 space-y-2">
          <p>
            Data comes from the Owlet Dream Sock. Each row aggregates a feeding day
            (02:30 → 02:30) of monitoring. Readings only count when the sock was actually
            on the baby and reporting; charging time and time off the foot are excluded.
          </p>
          <p>
            <span className="text-zinc-300">Lowest SpO₂</span> is the minimum value seen
            on the sock's <em>smoothed value</em> (it averages out brief blips so only sustained dips show). Single-second dips happen
            and don't matter; sustained dips are what doctors track.
          </p>
          <p>
            <span className="text-zinc-300">Heart rate range</span> is the min–max
            spread across the day. The dot is the daily average. Range typically narrows
            as a preterm baby matures.
          </p>
          <p>
            <span className="text-zinc-300">Sessions</span> are contiguous stretches
            of monitoring separated by 15+ minutes off the baby (nap → walk → bath, etc.).
          </p>
          <p>
            <span className="text-zinc-300">Alerts</span> are low-SpO₂ events the sock
            flagged at the time. Owlet does the real-time alerting; this is just the
            historical count for context.
          </p>

          <div className="text-zinc-300 mt-3 mb-1">Reference ranges (preterm / newborn)</div>
          <ul className="space-y-1 list-none pl-0">
            <li><span className="text-emerald-300">HR avg {HR_AVG_TYPICAL_LOW}–{HR_AVG_TYPICAL_HIGH} BPM</span> — typical preterm/newborn band</li>
            <li><span className="text-yellow-300">HR avg outside that</span> — context-dependent (sleep, crying, illness)</li>
            <li><span className="text-emerald-300">SpO₂ ≥ {SPO2_HEALTHY}%</span> — in target window (CHOP consensus floor for ≥32w PMA)</li>
            <li><span className="text-yellow-300">SpO₂ {SPO2_WATCH}–{SPO2_HEALTHY - 1}%</span> — just below target, normal occasional dip</li>
            <li><span className="text-amber-300">SpO₂ {SPO2_FLAG}–{SPO2_WATCH - 1}%</span> — near standard alarm threshold, worth attention</li>
            <li><span className="text-rose-300">SpO₂ &lt; {SPO2_FLAG}%</span> — at or below the alarm threshold, worth raising at the next visit</li>
          </ul>
          <p className="mt-2 text-[11px] text-zinc-600">
            Bands reflect the CHOP 2024 Neonatal Oxygen Targeting Consensus and the
            Royal Children's Hospital Melbourne guideline (target 91–95%, alarm at 89%),
            with corroboration from SUPPORT/BOOST II findings. Not a clinical protocol —
            the doctor's thresholds always take precedence.
          </p>
        </div>
      </details>
    </>
  )
}
