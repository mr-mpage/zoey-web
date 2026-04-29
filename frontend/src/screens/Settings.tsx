import { useEffect, useMemo, useState } from 'react'
import {
  useAppSettings,
  useDeleteWeight,
  useLogout,
  usePatchWeight,
  useSetWeight,
  useUpdateAppSettings,
  useWeight,
} from '../api/hooks'
import { api, ApiError } from '../api/client'
import { fmtDate, localDatetimeInput } from '../lib/format'
import { expectedGainRange, gainTone, gainsBetweenEntries } from '../lib/growth'

function pmaAtDate(dateIso: string, birthDateIso: string, gaWeeks: number): { pma: number; postnatalDays: number } {
  const birth = new Date(birthDateIso + 'T00:00:00').getTime()
  const at = new Date(dateIso).getTime()
  const days = Math.max(0, Math.floor((at - birth) / 86_400_000))
  return { pma: gaWeeks + days / 7, postnatalDays: days }
}
import { disablePush, enablePush, getState as getPushState, isStandalone } from '../lib/push'
import type { Weight } from '../api/types'

function WeightEditModal({
  entry,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  entry: Weight
  onClose: () => void
  onSave: (patch: { weight_grams: number; ml_per_kg_per_day: number; recorded_at: string; notes: string }) => void
  onDelete: () => void
  saving?: boolean
}) {
  const [grams, setGrams] = useState(String(entry.weight_grams))
  const [rate, setRate] = useState(String(entry.ml_per_kg_per_day))
  const [when, setWhen] = useState(localDatetimeInput(new Date(entry.recorded_at)))
  const [notes, setNotes] = useState(entry.notes ?? '')

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg font-medium">Edit weight</div>
          <button onClick={onClose} className="text-zinc-400 text-2xl leading-none">×</button>
        </div>

        <label className="block text-xs text-zinc-500 mb-1">Weight (grams)</label>
        <input
          inputMode="numeric"
          value={grams}
          onChange={(e) => setGrams(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-3 tabular-nums"
        />

        <label className="block text-xs text-zinc-500 mb-1">Rate (ml/kg/day)</label>
        <input
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-3 tabular-nums"
        />

        <label className="block text-xs text-zinc-500 mb-1">Recorded at</label>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-3 text-zinc-100"
        />

        <label className="block text-xs text-zinc-500 mb-1">Notes</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onDelete}
            disabled={saving}
            className="px-4 py-3 rounded-xl bg-rose-950 text-rose-300 text-sm"
          >
            Delete
          </button>
          <button
            onClick={() => onSave({
              weight_grams: parseInt(grams, 10),
              ml_per_kg_per_day: parseInt(rate, 10),
              recorded_at: new Date(when).toISOString(),
              notes,
            })}
            disabled={saving || !grams || !rate}
            className="flex-1 py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PushSection() {
  const [state, setState] = useState<'unsupported' | 'denied' | 'available' | 'enabled' | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async () => {
    setState(await getPushState())
  }

  useEffect(() => {
    refresh()
  }, [])

  const enable = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const { vapid_public_key } = await api.get<{ vapid_public_key: string }>('/api/push/vapid-key')
      const sub = await enablePush(vapid_public_key)
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } }
      if (!j.endpoint || !j.keys) throw new Error('Subscription missing endpoint/keys')
      await api.post('/api/push/subscribe', {
        endpoint: j.endpoint,
        keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
        label: navigator.userAgent.slice(0, 60),
      })
      setMsg('Reminders enabled on this device.')
    } catch (e) {
      const detail = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed'
      setMsg(detail)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const disable = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const { endpoint } = await disablePush()
      if (endpoint) {
        await api.post('/api/push/unsubscribe', { endpoint })
      }
      setMsg('Reminders disabled on this device.')
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Failed'
      setMsg(detail)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const sendTest = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await api.post<{ sent: number; total: number }>('/api/push/test')
      setMsg(`Test sent to ${r.sent}/${r.total} device(s).`)
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const standalone = isStandalone()

  return (
    <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Reminders</div>
      <p className="text-xs text-zinc-500 mb-3">
        Push notification 15 min before each scheduled feed, adapted to her actual rhythm.
        Supplemental — keep your phone alarms as the primary safety net.
      </p>
      {!standalone && state !== 'unsupported' && (
        <div className="text-[11px] text-amber-300 mb-3">
          On iOS, reminders only work after adding this app to your Home Screen and opening it from there.
        </div>
      )}
      {state === 'loading' && <div className="text-zinc-500 text-sm">Checking…</div>}
      {state === 'unsupported' && (
        <div className="text-zinc-500 text-sm">Push not supported on this browser.</div>
      )}
      {state === 'denied' && (
        <div className="text-zinc-500 text-sm">
          Permission denied. Enable in iOS Settings → Notifications → Zoey.
        </div>
      )}
      {state === 'available' && (
        <button
          onClick={enable}
          disabled={busy}
          className="w-full py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium disabled:opacity-40"
        >
          {busy ? 'Enabling…' : 'Enable reminders on this device'}
        </button>
      )}
      {state === 'enabled' && (
        <div className="space-y-2">
          <div className="text-emerald-300 text-sm">Reminders enabled on this device.</div>
          <div className="flex gap-2">
            <button
              onClick={sendTest}
              disabled={busy}
              className="flex-1 py-2.5 rounded-lg bg-zinc-800 text-zinc-200 text-sm"
            >
              Send test
            </button>
            <button
              onClick={disable}
              disabled={busy}
              className="flex-1 py-2.5 rounded-lg bg-rose-950 text-rose-300 text-sm"
            >
              Disable
            </button>
          </div>
        </div>
      )}
      {msg && <div className="text-[11px] text-zinc-400 mt-3">{msg}</div>}
    </div>
  )
}

function BandRow({
  label,
  help,
  value,
  onChange,
  placeholder,
}: {
  label: string
  help: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-[11px] text-zinc-500 truncate">{help}</div>
      </div>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums w-20 text-center"
        placeholder={placeholder}
      />
    </div>
  )
}

export function SettingsScreen() {
  const { data: weight } = useWeight()
  const setWeight = useSetWeight()
  const patchWeight = usePatchWeight()
  const deleteWeight = useDeleteWeight()
  const { data: appSettings } = useAppSettings()
  const updateSettings = useUpdateAppSettings()
  const logout = useLogout()
  const [editingWeight, setEditingWeight] = useState<Weight | null>(null)

  const [grams, setGrams] = useState<string>(weight?.current?.weight_grams.toString() ?? '')
  const [rate, setRate] = useState<string>(weight?.current?.ml_per_kg_per_day.toString() ?? '160')
  const [notes, setNotes] = useState<string>('')
  const [anchor, setAnchor] = useState<string>('02:30')
  const [feedsPerDay, setFeedsPerDay] = useState<string>('8')
  const [bandConcern, setBandConcern] = useState<string>('130')
  const [bandLow, setBandLow] = useState<string>('150')
  const [bandSolid, setBandSolid] = useState<string>('165')
  const [bandHigh, setBandHigh] = useState<string>('180')

  useEffect(() => {
    if (appSettings) {
      const hh = String(appSettings.day_start_hour).padStart(2, '0')
      const mm = String(appSettings.day_start_minute).padStart(2, '0')
      setAnchor(`${hh}:${mm}`)
      setFeedsPerDay(String(appSettings.feeds_per_day))
      setBandConcern(String(appSettings.target_concern_ml_per_kg))
      setBandLow(String(appSettings.target_low_ml_per_kg))
      setBandSolid(String(appSettings.target_solid_ml_per_kg))
      setBandHigh(String(appSettings.target_high_ml_per_kg))
    }
  }, [appSettings])

  const saveAnchor = () => {
    const [hh, mm] = anchor.split(':').map((s) => parseInt(s, 10))
    const n = parseInt(feedsPerDay, 10)
    if (isNaN(hh) || isNaN(mm) || isNaN(n) || n < 4 || n > 12) return
    updateSettings.mutate({ day_start_hour: hh, day_start_minute: mm, feeds_per_day: n })
  }

  const saveBands = () => {
    const c = parseInt(bandConcern, 10)
    const lo = parseInt(bandLow, 10)
    const so = parseInt(bandSolid, 10)
    const hi = parseInt(bandHigh, 10)
    if ([c, lo, so, hi].some(isNaN)) return
    if (!(c < lo && lo < so && so < hi)) return
    updateSettings.mutate({
      target_concern_ml_per_kg: c,
      target_low_ml_per_kg: lo,
      target_solid_ml_per_kg: so,
      target_high_ml_per_kg: hi,
    })
  }

  const handleSubmit = () => {
    const g = parseInt(grams, 10)
    const r = parseInt(rate, 10)
    if (!g || !r) return
    const prev = weight?.current
    if (prev) {
      const pctDelta = Math.abs(g - prev.weight_grams) / prev.weight_grams
      const days = (Date.now() - new Date(prev.recorded_at).getTime()) / 86_400_000
      const gPerDay = days > 0 ? Math.abs(g - prev.weight_grams) / days : Infinity
      if (pctDelta > 0.1 || (days > 0 && gPerDay > 100)) {
        const ok = window.confirm(
          `Sanity check:\n\nLast weight: ${prev.weight_grams} g (${fmtDate(prev.recorded_at)})\nNew weight: ${g} g\nChange: ${(g - prev.weight_grams >= 0 ? '+' : '') + (g - prev.weight_grams)} g over ${days.toFixed(1)} days\n\nThat's an unusually large change. Save anyway?`,
        )
        if (!ok) return
      }
    }
    setWeight.mutate(
      { weight_grams: g, ml_per_kg_per_day: r, notes: notes || undefined },
      { onSuccess: () => setNotes('') },
    )
  }

  const projDaily = grams && rate ? (parseInt(grams, 10) / 1000) * parseInt(rate, 10) : 0

  const gains = useMemo(() => gainsBetweenEntries(weight?.history ?? []), [weight?.history])

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Settings</div>

      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Update weight</div>
        <label className="block text-xs text-zinc-500 mb-1">Weight (grams)</label>
        <input
          inputMode="numeric"
          value={grams}
          onChange={(e) => setGrams(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-3 tabular-nums"
          placeholder="2400"
        />
        <label className="block text-xs text-zinc-500 mb-1">Rate (ml/kg/day)</label>
        <input
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-3 tabular-nums"
          placeholder="160"
        />
        <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-3"
          placeholder="weighed at hospital, doctor visit, etc."
        />
        {projDaily > 0 && (
          <div className="text-xs text-zinc-500 mb-3 text-center">
            new daily target <span className="text-zinc-200 tabular-nums">{projDaily.toFixed(0)} ml</span>
            {' · '}
            per feed <span className="text-zinc-200 tabular-nums">{(projDaily / 8).toFixed(0)} ml</span>
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={setWeight.isPending || !grams || !rate}
          className="w-full py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium disabled:opacity-40"
        >
          {setWeight.isPending ? 'Saving…' : 'Save weight'}
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Feeding schedule</div>
        <p className="text-xs text-zinc-500 mb-3">
          Feed #1 of the day is the first feed at or after the start time. Daily total resets here, not
          at midnight. The interval between feeds is 24h ÷ feeds-per-day.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Day starts at</div>
              <div className="text-[11px] text-zinc-500">e.g. 02:30 or 03:00</div>
            </div>
            <input
              type="time"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums w-28 text-center"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Feeds per day</div>
              <div className="text-[11px] text-zinc-500">
                {(() => {
                  const n = parseInt(feedsPerDay, 10)
                  if (!n || n < 1) return 'every — hours'
                  const hours = 24 / n
                  const h = Math.floor(hours)
                  const m = Math.round((hours - h) * 60)
                  return `every ${h}${m ? ` h ${m} min` : ' h'}`
                })()}
              </div>
            </div>
            <input
              inputMode="numeric"
              value={feedsPerDay}
              onChange={(e) => setFeedsPerDay(e.target.value.replace(/\D/g, ''))}
              className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums w-20 text-center"
              placeholder="8"
            />
          </div>
        </div>
        <button
          onClick={saveAnchor}
          disabled={updateSettings.isPending}
          className="mt-3 w-full py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {updateSettings.isPending ? 'Saving…' : 'Save schedule'}
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Colour bands (ml/kg/day)</div>
        <p className="text-xs text-zinc-500 mb-3">
          History rows are coloured by where the day's ml/kg/day lands. Defaults reflect typical preterm
          guidance; adjust if your doctor uses different numbers.
        </p>
        <div className="space-y-2">
          <BandRow
            label="Concern level"
            help="Below this is a flag — rose"
            value={bandConcern}
            onChange={setBandConcern}
            placeholder="130"
          />
          <BandRow
            label="Zone minimum"
            help="Under target — amber"
            value={bandLow}
            onChange={setBandLow}
            placeholder="150"
          />
          <BandRow
            label="Solid threshold"
            help="At minimum, edge of zone — lime"
            value={bandSolid}
            onChange={setBandSolid}
            placeholder="165"
          />
          <BandRow
            label="Zone maximum"
            help="Solidly in zone — emerald · above is sky"
            value={bandHigh}
            onChange={setBandHigh}
            placeholder="180"
          />
        </div>
        <button
          onClick={saveBands}
          disabled={updateSettings.isPending}
          className="mt-3 w-full py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {updateSettings.isPending ? 'Saving…' : 'Save bands'}
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Weight history</div>
        {weight && weight.history.length > 0 ? (
          <ul className="space-y-1">
            {weight.history.map((w) => {
              const gain = gains.find((g) => g.to.id === w.id)
              const ctx = appSettings
                ? pmaAtDate(w.recorded_at, appSettings.birth_date, appSettings.gestational_age_weeks)
                : null
              return (
                <li
                  key={w.id}
                  onClick={() => setEditingWeight(w)}
                  className="rounded-lg p-2 -mx-2 active:bg-zinc-800/60"
                >
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">{fmtDate(w.recorded_at)}</span>
                    <span className="tabular-nums">
                      {w.weight_grams} g · {w.ml_per_kg_per_day} ml/kg/d
                    </span>
                  </div>
                  {gain && (
                    <div className={`text-[11px] tabular-nums text-right ${gainTone(gain.g_per_kg_per_day, ctx?.pma, ctx?.postnatalDays)}`}>
                      {gain.g_per_day >= 0 ? '+' : ''}{gain.g_per_day.toFixed(0)} g/day · {gain.g_per_kg_per_day >= 0 ? '+' : ''}{gain.g_per_kg_per_day.toFixed(1)} g/kg/day
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="text-zinc-500 text-sm">No history yet.</div>
        )}
        {appSettings && (() => {
          const today = new Date().toISOString()
          const ctx = pmaAtDate(today, appSettings.birth_date, appSettings.gestational_age_weeks)
          const [gMin, gMax] = expectedGainRange(ctx.pma, ctx.postnatalDays)
          const stage =
            ctx.postnatalDays < 7
              ? 'first week (birth-weight loss/regain)'
              : ctx.postnatalDays < 14
                ? 'first 2 weeks (rebuilding from birth weight)'
                : `PMA ~${ctx.pma.toFixed(0)} weeks`
          return (
            <div className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
              <div className="text-zinc-300 mb-1">How the gain colours work</div>
              <p>
                Each row's gain (eg <span className="tabular-nums">+9 g/kg/day</span>) is coloured against the
                range expected for her age at that point. Premature babies have an age-shifting target rather
                than one fixed number — the youngest preemies are on the steepest growth curve, slowing toward
                a term-equivalent rate.
              </p>
              <p className="mt-1.5">
                <b className="text-zinc-300">Today</b> (day {ctx.postnatalDays}, {stage}): expected{' '}
                <b className="text-zinc-300 tabular-nums">{gMin}–{gMax} g/kg/day</b>.
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
          )
        })()}
      </div>

      {editingWeight && (
        <WeightEditModal
          entry={editingWeight}
          onClose={() => setEditingWeight(null)}
          onSave={(patch) => patchWeight.mutate({ id: editingWeight.id, ...patch }, { onSuccess: () => setEditingWeight(null) })}
          onDelete={() => deleteWeight.mutate(editingWeight.id, { onSuccess: () => setEditingWeight(null) })}
          saving={patchWeight.isPending || deleteWeight.isPending}
        />
      )}

      <PushSection />

      <button
        onClick={() => logout.mutate()}
        className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm"
      >
        Sign out (this device)
      </button>
    </div>
  )
}
