import { useVitalsSummary } from '../api/hooks'

const LOW_SPO2_THRESHOLD = 90 // matches backend default

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
  const d = new Date(iso + 'T00:00:00')
  const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86_400_000)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function spo2Tone(v: number | null): string {
  if (v == null) return 'text-zinc-500'
  if (v < LOW_SPO2_THRESHOLD) return 'text-amber-300'
  if (v < 95) return 'text-yellow-300'
  return 'text-zinc-200'
}

/** Per-day overnight/daytime vitals summary, last N days. Renders nothing
 *  when the integration isn't configured server-side. */
export function VitalsCard({ days = 7 }: { days?: number }) {
  const { data, isLoading } = useVitalsSummary(days)
  if (isLoading) return null
  if (!data || !data.configured) return null

  const today = data.days.length > 0 ? data.days[data.days.length - 1].feeding_day : ''
  const sortedDesc = [...data.days].reverse()
  const todayRow = sortedDesc[0]
  const recent = data.days.filter((d) => d.monitoring_minutes >= 30)
  const hrAvgs = recent.map((d) => d.hr_avg).filter((v): v is number => v != null)
  const minSpo2 = recent
    .map((d) => d.spo2_min_avg10)
    .filter((v): v is number => v != null)
    .reduce((m, v) => Math.min(m, v), Infinity)
  const minSpo2Day = recent.find((d) => d.spo2_min_avg10 === minSpo2)?.feeding_day
  const totalAlerts = recent.reduce((s, d) => s + d.low_spo2_alert_count, 0)

  // Bar chart of HR avg per day, last 7
  const barMax = Math.max(160, ...hrAvgs.map((v) => v))
  const barMin = Math.min(120, ...hrAvgs.map((v) => v))
  const barRange = Math.max(barMax - barMin, 1)

  return (
    <div className="rounded-xl bg-zinc-900/60 p-3 mb-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
        Vitals · last {days} days
      </div>

      {/* Today's row, if data exists */}
      {todayRow && todayRow.monitoring_minutes > 0 ? (
        <div className="rounded-lg bg-zinc-800/40 p-3 mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-sm text-zinc-200">Today</div>
            <div className="text-[11px] text-zinc-500 tabular-nums">
              {fmtHours(todayRow.monitoring_minutes)} · {todayRow.session_count} session
              {todayRow.session_count === 1 ? '' : 's'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Heart rate</div>
              <div className="tabular-nums text-zinc-200">
                {fmtHr(todayRow.hr_avg)} avg
                {todayRow.hr_min != null && todayRow.hr_max != null && (
                  <span className="text-zinc-500"> · {fmtHr(todayRow.hr_min)}–{fmtHr(todayRow.hr_max)}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Lowest SpO₂</div>
              <div className={`tabular-nums ${spo2Tone(todayRow.spo2_min_avg10)}`}>
                {fmtSpo2(todayRow.spo2_min_avg10)}
                <span className="text-zinc-600 text-[10px]"> 10-min avg</span>
              </div>
            </div>
          </div>
          {todayRow.low_spo2_alert_count > 0 && (
            <div className="text-[11px] text-amber-300 mt-2">
              {todayRow.low_spo2_alert_count} low-SpO₂ alert
              {todayRow.low_spo2_alert_count === 1 ? '' : 's'} today
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-zinc-500 italic mb-3">
          No monitoring data for today yet.
        </div>
      )}

      {/* Last N days summary */}
      {recent.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Past {days} days</div>
            {totalAlerts > 0 && (
              <div className="text-[11px] text-amber-300 tabular-nums">
                {totalAlerts} alert{totalAlerts === 1 ? '' : 's'}
              </div>
            )}
          </div>

          {/* HR avg bars */}
          <div className="flex items-end gap-1 h-12 mb-1">
            {sortedDesc.slice().reverse().map((d) => {
              if (d.hr_avg == null) {
                return <div key={d.feeding_day} className="flex-1 h-full bg-zinc-800/30 rounded-sm" />
              }
              const h = ((d.hr_avg - barMin) / barRange) * 100
              return (
                <div
                  key={d.feeding_day}
                  className={`flex-1 rounded-sm ${
                    d.feeding_day === today ? 'bg-pink-300/80' : 'bg-pink-300/40'
                  }`}
                  style={{ height: `${Math.max(h, 5)}%` }}
                  title={`${dayLabel(d.feeding_day, today)}: ${fmtHr(d.hr_avg)} BPM`}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600 tabular-nums">
            <span>{barMin.toFixed(0)} BPM</span>
            <span>{barMax.toFixed(0)} BPM</span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
            {hrAvgs.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">HR weekly</div>
                <div className="tabular-nums text-zinc-200">
                  {Math.round(Math.min(...hrAvgs))}–{Math.round(Math.max(...hrAvgs))} avg
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

          {/* Narrative line only when something stands out */}
          {minSpo2 !== Infinity && minSpo2 < LOW_SPO2_THRESHOLD && minSpo2Day && (
            <div className="text-[11px] text-amber-300 mt-3 leading-relaxed">
              {dayLabel(minSpo2Day, today)}'s lowest SpO₂ was {Math.round(minSpo2)}% (10-min avg) — worth
              mentioning at the next visit.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
