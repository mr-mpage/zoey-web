import { useEffect, useState } from 'react'
import {
  useAppSettings,
  useArchiveMed,
  useCreateMed,
  useCreateViewerPasscode,
  useDeleteViewerPasscode,
  useLogout,
  useMeds,
  useOwletSettings,
  usePatchMed,
  useUpdateAppSettings,
  useUpdateOwletSettings,
  useViewerPasscodes,
  type ViewerPasscode,
} from '../api/hooks'
import { api, ApiError } from '../api/client'
import { disablePush, enablePush, getState as getPushState, isStandalone } from '../lib/push'
import { fmtDate, fmtTime } from '../lib/format'
import type { AppSettings, Med } from '../api/types'

function OwletIntegrationSection() {
  const { data: owlet } = useOwletSettings()
  const update = useUpdateOwletSettings()
  const [enabled, setEnabled] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [region, setRegion] = useState<'europe' | 'world'>('europe')
  const [showPassword, setShowPassword] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  /* Hydrate the form once the GET resolves. The password placeholder is
   * synthetic ("●●●●●●") and never sent back to the server unless the
   * operator actually types something — see the patch payload below. */
  useEffect(() => {
    if (!owlet) return
    setEnabled(owlet.enabled)
    setEmail(owlet.email)
    setRegion(owlet.region)
    setPassword(owlet.has_password ? '••••••' : '')
    setPasswordTouched(false)
  }, [owlet])

  /* Toggling the master switch saves immediately — feels right for an
   * on/off control, and the rest of the UI updates the moment the
   * mutation resolves so the operator sees the Vitals tab appear/
   * disappear right after they tap. */
  const toggleEnabled = (next: boolean) => {
    setEnabled(next)
    setMsg(null)
    update.mutate({ enabled: next }, {
      onSuccess: (s) => setMsg(s.enabled ? 'Vitals enabled' : 'Vitals hidden'),
    })
  }

  const save = () => {
    setMsg(null)
    /* password=undefined → leave the saved password untouched (so an
     * email-only edit doesn't require re-typing); password="" → clear
     * (disables the integration); otherwise send the new password. */
    const patch: { email: string; region: 'europe' | 'world'; password?: string } = {
      email: email.trim(),
      region,
    }
    if (passwordTouched) patch.password = password
    update.mutate(patch, {
      onSuccess: (s) => {
        setMsg(s.configured ? 'Saved · poller restarted' : 'Saved · credentials cleared')
        setPasswordTouched(false)
        if (s.has_password) setPassword('••••••')
      },
      onError: (e) => setMsg(e instanceof Error ? e.message : 'Save failed'),
    })
  }

  const clear = () => {
    setMsg(null)
    update.mutate(
      { email: '', password: '', region: 'europe' },
      {
        onSuccess: () => {
          setEmail('')
          setPassword('')
          setPasswordTouched(false)
          setRegion('europe')
          setMsg('Cleared · integration disabled')
        },
      },
    )
  }

  const dotClass = !enabled
    ? 'bg-zinc-600'
    : owlet?.configured
      ? 'bg-emerald-300'
      : 'bg-amber-300'
  const statusText = !enabled
    ? 'Vitals hidden'
    : owlet?.configured
      ? 'Configured · polling active'
      : 'Not configured · set credentials below or turn off above to hide'

  return (
    <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Owlet vitals</div>
      <p className="text-xs text-zinc-500 mb-3">
        Optional. Polls heart rate and SpO₂ from your Owlet Dream Sock account so the Vitals tab
        has data. The password is encrypted at rest in the database.
      </p>

      {/* Master toggle — turn the whole Vitals surface on/off without
          having to clear credentials. */}
      <div className="flex items-center justify-between mb-3 rounded-lg bg-zinc-900/40 px-3 py-2.5">
        <div>
          <div className="text-sm">Vitals integration</div>
          <div className="text-[11px] text-zinc-500">
            {enabled ? 'On — Vitals tab and overview card visible' : 'Off — Vitals UI hidden everywhere'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => toggleEnabled(!enabled)}
          disabled={update.isPending}
          className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${
            enabled ? 'bg-pink-300' : 'bg-zinc-700'
          } disabled:opacity-40`}
        >
          <span
            className={`inline-block w-5 h-5 rounded-full bg-zinc-900 transform transition-transform mt-0.5 ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3 text-[11px]">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="text-zinc-400">{statusText}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm">Email</div>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="bg-zinc-800 rounded-lg px-3 py-2 text-center min-w-0 flex-shrink"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm">Password</div>
          </div>
          <div className="relative">
            <input
              type={showPassword && passwordTouched ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setPasswordTouched(true)
              }}
              onFocus={() => {
                /* If the field still holds the synthetic placeholder, clear
                 * on focus so the operator types into an empty box rather
                 * than appending to bullet characters. */
                if (!passwordTouched && owlet?.has_password) {
                  setPassword('')
                  setPasswordTouched(true)
                }
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="bg-zinc-800 rounded-lg pl-3 pr-9 py-2 text-left min-w-0"
              placeholder="•••••••"
            />
            {/* Eye affordance only renders once the operator is actively
                typing a new password — until then the field shows a
                synthetic placeholder that the API never round-trips, so
                there's nothing to reveal. */}
            {passwordTouched && (
              <button
                onClick={() => setShowPassword((v) => !v)}
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m4 4 16 16" />
                    <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm">Region</div>
            <div className="text-[11px] text-zinc-500">europe or world</div>
          </div>
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            {(['europe', 'world'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`px-3 py-1.5 rounded-md text-xs ${
                  region === r ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
                }`}
                type="button"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={save}
          disabled={update.isPending}
          className="flex-1 py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {owlet?.configured && (
          <button
            onClick={clear}
            disabled={update.isPending}
            className="px-3 py-2.5 rounded-lg bg-zinc-800 text-rose-300 text-sm"
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      {msg && <div className="mt-2 text-[11px] text-zinc-400 text-center">{msg}</div>}
    </div>
  )
}


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
  const { data: appSettings } = useAppSettings()

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
          Permission denied. Enable in iOS Settings → Notifications → {appSettings?.baby_name ?? 'this app'}.
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

function MedRow({ med }: { med: Med }) {
  const patch = usePatchMed()
  const archive = useArchiveMed()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(med.name)
  const [doses, setDoses] = useState(String(med.doses_per_day))

  const save = () => {
    const n = name.trim()
    const d = parseInt(doses, 10)
    if (!n || isNaN(d) || d < 0 || d > 12) return
    patch.mutate(
      { id: med.id, name: n, doses_per_day: d },
      { onSuccess: () => setEditing(false) },
    )
  }

  if (!editing) {
    return (
      <div
        onClick={() => {
          setName(med.name)
          setDoses(String(med.doses_per_day))
          setEditing(true)
        }}
        className="rounded-lg bg-zinc-900/50 px-3 py-2.5 flex items-center justify-between cursor-pointer"
      >
        <div>
          <div className="text-sm text-zinc-100">{med.name}</div>
          <div className="text-[11px] text-zinc-500">
            {med.doses_per_day === 0 ? 'as needed' : `${med.doses_per_day}× per day`}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500">Edit</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-zinc-900/50 p-3">
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-sm"
          maxLength={80}
        />
        <input
          inputMode="numeric"
          value={doses}
          onChange={(e) => setDoses(e.target.value.replace(/\D/g, ''))}
          className="w-16 bg-zinc-800 rounded-lg px-3 py-2 text-sm tabular-nums text-center"
          placeholder="1"
        />
      </div>
      <div className="text-[11px] text-zinc-500 mb-2">
        Doses per day. Use 0 for "as needed" (no checklist slot, but still loggable).
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => archive.mutate(med, { onSuccess: () => setEditing(false) })}
          disabled={archive.isPending}
          className="flex-1 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm disabled:opacity-40"
        >
          Archive
        </button>
        <button
          onClick={() => setEditing(false)}
          className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={patch.isPending}
          className="flex-1 py-2 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function MedsSection() {
  const { data: meds } = useMeds()
  const create = useCreateMed()
  const [name, setName] = useState('')
  const [doses, setDoses] = useState('1')

  const submit = () => {
    const n = name.trim()
    const d = parseInt(doses, 10)
    if (!n || isNaN(d) || d < 0 || d > 12) return
    create.mutate(
      { name: n, doses_per_day: d, sort_order: (meds?.length ?? 0) },
      {
        onSuccess: () => {
          setName('')
          setDoses('1')
        },
      },
    )
  }

  return (
    <div className="rounded-2xl bg-zinc-900/60 p-4 mb-5">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Meds</div>
      <p className="text-xs text-zinc-500 mb-3">
        The Meds tab shows today's checklist for everything here. Set "doses per day" to 0 for
        as-needed items (no checklist slot, but you can still log doses from the tab).
      </p>

      <div className="space-y-1.5 mb-3">
        {(meds ?? []).map((m) => (
          <MedRow key={m.id} med={m} />
        ))}
        {(meds ?? []).length === 0 && (
          <div className="text-[11px] text-zinc-500 italic px-1">No meds configured.</div>
        )}
      </div>

      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Add</div>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-sm"
          maxLength={80}
        />
        <input
          inputMode="numeric"
          value={doses}
          onChange={(e) => setDoses(e.target.value.replace(/\D/g, ''))}
          className="w-16 bg-zinc-800 rounded-lg px-3 py-2 text-sm tabular-nums text-center"
          placeholder="1"
        />
        <button
          onClick={submit}
          disabled={create.isPending || !name.trim()}
          className="px-4 py-2 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

export function SettingsScreen() {
  const { data: appSettings } = useAppSettings()
  const updateSettings = useUpdateAppSettings()
  const logout = useLogout()

  const [anchor, setAnchor] = useState<string>('02:30')
  const [feedsPerDay, setFeedsPerDay] = useState<string>('8')
  const [bottlePrep, setBottlePrep] = useState<string>('60')
  const [bandConcern, setBandConcern] = useState<string>('130')
  const [bandLow, setBandLow] = useState<string>('150')
  const [bandSolid, setBandSolid] = useState<string>('165')
  const [bandHigh, setBandHigh] = useState<string>('180')
  const [babyName, setBabyName] = useState<string>('')
  const [parentNames, setParentNames] = useState<string>('')
  const [birthDate, setBirthDate] = useState<string>('')
  const [gaWeeks, setGaWeeks] = useState<string>('')
  const [birthWeight, setBirthWeight] = useState<string>('')

  useEffect(() => {
    if (appSettings) {
      const hh = String(appSettings.day_start_hour).padStart(2, '0')
      const mm = String(appSettings.day_start_minute).padStart(2, '0')
      setAnchor(`${hh}:${mm}`)
      setFeedsPerDay(String(appSettings.feeds_per_day))
      setBottlePrep(String(appSettings.bottle_prep_ml))
      setBandConcern(String(appSettings.target_concern_ml_per_kg))
      setBandLow(String(appSettings.target_low_ml_per_kg))
      setBandSolid(String(appSettings.target_solid_ml_per_kg))
      setBandHigh(String(appSettings.target_high_ml_per_kg))
      setBabyName(appSettings.baby_name)
      setParentNames(appSettings.parent_names)
      setBirthDate(appSettings.birth_date)
      setGaWeeks(String(appSettings.gestational_age_weeks))
      setBirthWeight(String(appSettings.birth_weight_grams))
    }
  }, [appSettings])

  const saveAnchor = () => {
    const [hh, mm] = anchor.split(':').map((s) => parseInt(s, 10))
    const n = parseInt(feedsPerDay, 10)
    const bp = parseInt(bottlePrep, 10)
    if (isNaN(hh) || isNaN(mm) || isNaN(n) || n < 4 || n > 12) return
    if (isNaN(bp) || bp < 10 || bp > 500) return
    updateSettings.mutate({
      day_start_hour: hh,
      day_start_minute: mm,
      feeds_per_day: n,
      bottle_prep_ml: bp,
    })
  }

  const saveProfile = () => {
    const updates: Partial<AppSettings> = {}
    const trimmedName = babyName.trim()
    if (trimmedName) updates.baby_name = trimmedName
    // parent_names is allowed to be empty (clears the variant strings).
    updates.parent_names = parentNames.trim()
    if (birthDate) {
      const ga = parseInt(gaWeeks, 10)
      const bw = parseInt(birthWeight, 10)
      if (isNaN(ga) || ga < 22 || ga > 42) return
      if (isNaN(bw) || bw < 300 || bw > 6000) return
      updates.birth_date = birthDate
      updates.gestational_age_weeks = ga
      updates.birth_weight_grams = bw
    }
    if (Object.keys(updates).length) updateSettings.mutate(updates)
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
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Baby profile</div>
        <p className="text-xs text-zinc-500 mb-3">
          Name appears in screen headers, narratives, push reminders, and the doctor report. Birth
          fields drive the PMA-aware growth bands, the percentile chart, the friendly age in the
          header, and the milestone chip (e.g. "Back to birth weight").
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Name</div>
            </div>
            <input
              type="text"
              value={babyName}
              maxLength={40}
              onChange={(e) => setBabyName(e.target.value)}
              className="bg-zinc-800 rounded-lg px-3 py-2 text-center"
              placeholder="Baby"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Parent names</div>
              <div className="text-[11px] text-zinc-500">optional · viewer narratives only</div>
            </div>
            <input
              type="text"
              value={parentNames}
              maxLength={80}
              onChange={(e) => setParentNames(e.target.value)}
              className="bg-zinc-800 rounded-lg px-3 py-2 text-center"
              placeholder="e.g. Alex and Sam"
            />
          </div>
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
          onClick={saveProfile}
          disabled={updateSettings.isPending}
          className="mt-3 w-full py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {updateSettings.isPending ? 'Saving…' : 'Save baby profile'}
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
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm">Bottle prep volume</div>
              <div className="text-[11px] text-zinc-500">
                ml poured into each bottle — supply tracking counts this per bottle, not what she drank
              </div>
            </div>
            <input
              inputMode="numeric"
              value={bottlePrep}
              onChange={(e) => setBottlePrep(e.target.value.replace(/\D/g, ''))}
              className="bg-zinc-800 rounded-lg px-3 py-2 tabular-nums w-20 text-center"
              placeholder="60"
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

      <MedsSection />

      <PushSection />

      <OwletIntegrationSection />

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
