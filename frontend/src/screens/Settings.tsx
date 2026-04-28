import { useState } from 'react'
import { useLogout, useSetWeight, useWeight } from '../api/hooks'
import { fmtDate } from '../lib/format'

export function SettingsScreen() {
  const { data: weight } = useWeight()
  const setWeight = useSetWeight()
  const logout = useLogout()

  const [grams, setGrams] = useState<string>(weight?.current?.weight_grams.toString() ?? '')
  const [rate, setRate] = useState<string>(weight?.current?.ml_per_kg_per_day.toString() ?? '160')
  const [notes, setNotes] = useState<string>('')

  const handleSubmit = () => {
    const g = parseInt(grams, 10)
    const r = parseInt(rate, 10)
    if (!g || !r) return
    setWeight.mutate(
      { weight_grams: g, ml_per_kg_per_day: r, notes: notes || undefined },
      { onSuccess: () => setNotes('') },
    )
  }

  const projDaily = grams && rate ? (parseInt(grams, 10) / 1000) * parseInt(rate, 10) : 0

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
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Weight history</div>
        {weight && weight.history.length > 0 ? (
          <ul className="space-y-1.5">
            {weight.history.map((w) => (
              <li key={w.id} className="flex justify-between text-sm">
                <span className="text-zinc-400">{fmtDate(w.recorded_at)}</span>
                <span className="tabular-nums">
                  {w.weight_grams} g · {w.ml_per_kg_per_day} ml/kg/d
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-zinc-500 text-sm">No history yet.</div>
        )}
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
