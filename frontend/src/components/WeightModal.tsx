import { useState } from 'react'
import { localDatetimeInput } from '../lib/format'
import type { Weight } from '../api/types'

type SavePatch = { weight_grams: number; ml_per_kg_per_day: number; recorded_at: string; notes: string }

type AddProps = {
  open: boolean
  mode: 'add'
  defaultRate?: number
  onClose: () => void
  onSave: (input: SavePatch) => void
  saving?: boolean
}

type EditProps = {
  open: boolean
  mode: 'edit'
  entry: Weight
  onClose: () => void
  onSave: (patch: SavePatch) => void
  onDelete: () => void
  saving?: boolean
}

type Props = AddProps | EditProps

/** Shared modal for adding a new weight entry or editing an existing one.
 * Lives in components/ so both Settings and the History/Weight tab can
 * use it without duplicating the form. */
export function WeightModal(props: Props) {
  const isEdit = props.mode === 'edit'
  const [grams, setGrams] = useState(isEdit ? String(props.entry.weight_grams) : '')
  const [rate, setRate] = useState(
    isEdit ? String(props.entry.ml_per_kg_per_day) : String(props.defaultRate ?? 168),
  )
  const [when, setWhen] = useState(
    isEdit ? localDatetimeInput(new Date(props.entry.recorded_at)) : localDatetimeInput(new Date()),
  )
  const [notes, setNotes] = useState(isEdit ? props.entry.notes ?? '' : '')

  if (!props.open) return null

  const proj = grams && rate ? (parseInt(grams, 10) / 1000) * parseInt(rate, 10) : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={props.onClose}>
      <div
        className="w-full sm:max-w-sm bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg font-medium">{isEdit ? 'Edit weight' : 'Add weight'}</div>
          <button onClick={props.onClose} className="text-zinc-400 text-2xl leading-none">×</button>
        </div>

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
          placeholder="weighed at hospital, etc."
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-4 placeholder:text-zinc-600"
        />

        {!isEdit && proj > 0 && (
          <div className="text-[11px] text-zinc-500 mb-3 text-center">
            new daily target <span className="text-zinc-200 tabular-nums">{proj.toFixed(0)} ml</span>
            {' · per feed '}
            <span className="text-zinc-200 tabular-nums">{(proj / 8).toFixed(0)} ml</span>
          </div>
        )}

        <div className="flex gap-2">
          {isEdit && (
            <button
              onClick={props.onDelete}
              disabled={props.saving}
              className="px-4 py-3 rounded-xl bg-rose-950 text-rose-300 text-sm"
            >
              Delete
            </button>
          )}
          <button
            onClick={() =>
              props.onSave({
                weight_grams: parseInt(grams, 10),
                ml_per_kg_per_day: parseInt(rate, 10),
                recorded_at: new Date(when).toISOString(),
                notes,
              })
            }
            disabled={props.saving || !grams || !rate}
            className="flex-1 py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium disabled:opacity-40"
          >
            {props.saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
