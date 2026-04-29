import { useEffect, useState } from 'react'
import {
  useAppSettings,
  useCreateViewerPasscode,
  useDeleteViewerPasscode,
  useLogout,
  useUpdateAppSettings,
  useViewerPasscodes,
  type ViewerPasscode,
} from '../api/hooks'
import { api, ApiError } from '../api/client'
import { disablePush, enablePush, getState as getPushState, isStandalone } from '../lib/push'
import { fmtDate, fmtTime } from '../lib/format'

function ViewerPasscodesSection() {
  const { data: viewers } = useViewerPasscodes()
  const create = useCreateViewerPasscode()
  const del = useDeleteViewerPasscode()
  const [label, setLabel] = useState('')
  const [passcode, setPasscode] = useState('')

  const submit = () => {
    const l = label.trim().toLowerCase()
    if (!l || passcode.length < 4) return
    create.mutate(
      { label: l, passcode },
      {
        onSuccess: () => {
          setLabel('')
          setPasscode('')
        },
      },
    )
  }

  const lastSeen = (v: ViewerPasscode) => {
    if (!v.last_seen_at) return 'never opened'
    return `last seen ${fmtDate(v.last_seen_at)} at ${fmtTime(v.last_seen_at)}`
  }

  return (
    <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Read-only viewers</div>
      <p className="text-xs text-zinc-500 mb-3">
        Each viewer gets their own passcode and a label so you can tell who's looked.
        Read-only sessions can't add or edit anything and last 7 days before requiring a fresh sign-in.
      </p>

      {(viewers ?? []).length === 0 && (
        <div className="text-[12px] text-zinc-600 italic mb-3">No viewers yet.</div>
      )}
      <ul className="space-y-1.5 mb-3">
        {(viewers ?? []).map((v) => (
          <li key={v.id} className="flex items-center justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm capitalize">{v.label}</div>
              <div className="text-[11px] text-zinc-500 truncate">{lastSeen(v)}</div>
            </div>
            <button
              onClick={() => del.mutate(v)}
              disabled={del.isPending}
              className="text-rose-300 text-xs px-2 py-1 rounded bg-rose-950/60 disabled:opacity-40"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Label (e.g. granny, doctor)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm"
        />
        <input
          inputMode="numeric"
          placeholder="Passcode (≥ 4 chars)"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm tabular-nums"
        />
        <button
          onClick={submit}
          disabled={create.isPending || !label.trim() || passcode.length < 4}
          className="w-full py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {create.isPending ? 'Adding…' : 'Add viewer'}
        </button>
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
  const { data: appSettings } = useAppSettings()
  const updateSettings = useUpdateAppSettings()
  const logout = useLogout()

  const [anchor, setAnchor] = useState<string>('02:30')
  const [feedsPerDay, setFeedsPerDay] = useState<string>('8')
  const [bandConcern, setBandConcern] = useState<string>('130')
  const [bandLow, setBandLow] = useState<string>('150')
  const [bandSolid, setBandSolid] = useState<string>('165')
  const [bandHigh, setBandHigh] = useState<string>('180')
  const [birthDate, setBirthDate] = useState<string>('')
  const [gaWeeks, setGaWeeks] = useState<string>('')
  const [birthWeight, setBirthWeight] = useState<string>('')

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
      setBirthDate(appSettings.birth_date)
      setGaWeeks(String(appSettings.gestational_age_weeks))
      setBirthWeight(String(appSettings.birth_weight_grams))
    }
  }, [appSettings])

  const saveAnchor = () => {
    const [hh, mm] = anchor.split(':').map((s) => parseInt(s, 10))
    const n = parseInt(feedsPerDay, 10)
    if (isNaN(hh) || isNaN(mm) || isNaN(n) || n < 4 || n > 12) return
    updateSettings.mutate({ day_start_hour: hh, day_start_minute: mm, feeds_per_day: n })
  }

  const saveBirth = () => {
    const ga = parseInt(gaWeeks, 10)
    const bw = parseInt(birthWeight, 10)
    if (!birthDate || isNaN(ga) || isNaN(bw)) return
    if (ga < 22 || ga > 42) return
    if (bw < 300 || bw > 6000) return
    updateSettings.mutate({
      birth_date: birthDate,
      gestational_age_weeks: ga,
      birth_weight_grams: bw,
    })
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

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Settings</div>

      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Birth profile</div>
        <p className="text-xs text-zinc-500 mb-3">
          Used by the PMA-aware growth bands, the Fenton chart, the friendly age in the header, and
          the milestone chip (e.g. "Back to birth weight").
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Birth date</div>
            </div>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums text-center"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Gestational age at birth</div>
              <div className="text-[11px] text-zinc-500">weeks</div>
            </div>
            <input
              inputMode="numeric"
              value={gaWeeks}
              onChange={(e) => setGaWeeks(e.target.value.replace(/\D/g, ''))}
              className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums w-20 text-center"
              placeholder="35"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Birth weight</div>
              <div className="text-[11px] text-zinc-500">grams</div>
            </div>
            <input
              inputMode="numeric"
              value={birthWeight}
              onChange={(e) => setBirthWeight(e.target.value.replace(/\D/g, ''))}
              className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums w-24 text-center"
              placeholder="2455"
            />
          </div>
        </div>
        <button
          onClick={saveBirth}
          disabled={updateSettings.isPending}
          className="mt-3 w-full py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {updateSettings.isPending ? 'Saving…' : 'Save birth profile'}
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
          Trends rows are coloured by where the day's ml/kg/day lands. Defaults reflect typical preterm
          guidance; adjust if your doctor uses different numbers.
        </p>
        <div className="space-y-2">
          <BandRow
            label="Concern level"
            help="Below this is a flag — rose"
            value={bandConcern}
            onChange={setBandConcern}
            placeholder="135"
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
            placeholder="160"
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

      <PushSection />

      <ViewerPasscodesSection />

      <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Doctor visit</div>
        <p className="text-xs text-zinc-500 mb-3">
          Printable summary of the last 14 days: weights with gains, daily intake + ml/kg/day,
          diaper counts and feed notes. Open in a new tab, then "Save to Files → PDF" from Safari.
        </p>
        <a
          href="/api/report?days=14"
          target="_blank"
          rel="noopener"
          className="block w-full text-center py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium"
        >
          Open report (last 14 days)
        </a>
      </div>

      <button
        onClick={() => logout.mutate()}
        className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm"
      >
        Sign out (this device)
      </button>
    </div>
  )
}
