import { useVitalsSummary, type VitalsDay } from '../api/hooks'

const LOW_SPO2_THRESHOLD = 90

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

function spo2Tone(v: number | null): string {
  if (v == null) return 'text-zinc-500'
  if (v < LOW_SPO2_THRESHOLD) return 'text-amber-300'
  if (v < 95) return 'text-yellow-300'
  return 'text-zinc-200'
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
          <div className="text-2xl font-light tabular-nums text-zinc-100 leading-none mt-1">
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
          <div className={`text-2xl font-light tabular-nums leading-none mt-1 ${spo2Tone(row.spo2_min_avg10)}`}>
            {fmtSpo2(row.spo2_min_avg10)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">10-min average</div>
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

      {/* HR range bars: thin background bar = min-max range, dot = average */}
      <div className="flex items-end gap-1.5 h-24 mb-2">
        {days.map((d) => {
          const isToday = d.feeding_day === today
          if (d.hr_avg == null || d.hr_min == null || d.hr_max == null) {
            return <div key={d.feeding_day} className="flex-1 h-full bg-zinc-800/30 rounded-sm" />
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
                className={`absolute left-1/2 -translate-x-1/2 w-1 rounded-sm ${
                  isToday ? 'bg-pink-300/80' : 'bg-pink-300/40'
                }`}
                style={{ bottom: `${rangeBottom}%`, height: `${rangeTop - rangeBottom}%` }}
              />
              <div
                className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${
                  isToday ? 'bg-pink-200' : 'bg-pink-300'
                }`}
                style={{ bottom: `calc(${avgPos}% - 4px)` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-600 tabular-nums mb-3">
        <span>{barMin.toFixed(0)} BPM</span>
        <span>{barMax.toFixed(0)} BPM</span>
      </div>

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
            <div className={`tabular-nums ${spo2Tone(minSpo2)}`}>
              {fmtSpo2(minSpo2)}
              <span className="text-zinc-600 text-[10px]"> {dayLabel(minSpo2Day, today)}</span>
            </div>
          </div>
        )}
      </div>

      {minSpo2 !== Infinity && minSpo2 < LOW_SPO2_THRESHOLD && minSpo2Day && (
        <div className="text-[11px] text-amber-300 mt-3 leading-relaxed pt-3 border-t border-zinc-800/60">
          {dayLabel(minSpo2Day, today)}'s lowest SpO₂ was {Math.round(minSpo2)}% (10-min avg) — worth
          mentioning at the next visit.
        </div>
      )}
    </div>
  )
}

function PerDayList({ days, today }: { days: VitalsDay[]; today: string }) {
  const sorted = [...days].sort((a, b) => b.feeding_day.localeCompare(a.feeding_day))
  return (
    <div className="rounded-xl bg-zinc-900/60 p-4 mb-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">Per day</div>
      <ul className="space-y-1.5">
        {sorted.map((d) => {
          const isToday = d.feeding_day === today
          if (d.monitoring_minutes === 0) {
            return (
              <li key={d.feeding_day} className="flex items-baseline justify-between text-[12px] py-1">
                <span className={isToday ? 'text-zinc-300' : 'text-zinc-500'}>
                  {dayLabel(d.feeding_day, today)}
                </span>
                <span className="text-zinc-600 italic text-[11px]">no data</span>
              </li>
            )
          }
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
                  HR <span className="text-zinc-200">{fmtHr(d.hr_avg)}</span>
                  {d.hr_min != null && d.hr_max != null && (
                    <span className="text-zinc-600"> ({fmtHr(d.hr_min)}–{fmtHr(d.hr_max)})</span>
                  )}
                </span>
                <span className={spo2Tone(d.spo2_min_avg10)}>
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

export function VitalsHistorySection() {
  const { data, isLoading } = useVitalsSummary(14)

  if (isLoading) return null
  if (!data) return null
  if (!data.configured) return <NotConfiguredCard />

  const today = data.days.length > 0 ? data.days[data.days.length - 1].feeding_day : ''
  const todayRow = data.days[data.days.length - 1]
  const anyData = data.days.some((d) => d.monitoring_minutes > 0)

  if (!anyData) return <NoDataYetCard />

  return (
    <>
      {todayRow && <TodayCard row={todayRow} />}
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
            on the sock's <em>10-minute rolling average</em>. Single-second dips happen
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
        </div>
      </details>
    </>
  )
}
