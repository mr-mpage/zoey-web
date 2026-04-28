import { useEffect, useState } from 'react'
import { localDatetimeInput } from '../lib/format'

function splitDatetimeLocal(s: string): { date: string; time: string } {
  const [date, time] = s.split('T')
  return { date, time: time?.slice(0, 5) ?? '' }
}

export type AmountModalProps = {
  open: boolean
  title: string
  initialAmount?: number
  initialTime?: string
  initialNotes?: string
  hint?: string | null
  step?: number
  onClose: () => void
  onSave: (input: { amount_ml: number; at: string; notes: string }) => void
  onDelete?: () => void
  saving?: boolean
}

export function AmountModal({
  open,
  title,
  initialAmount,
  initialTime,
  initialNotes,
  hint,
  step = 1,
  onClose,
  onSave,
  onDelete,
  saving,
}: AmountModalProps) {
  const initial = initialTime ?? localDatetimeInput(new Date())
  const initSplit = splitDatetimeLocal(initial)
  const [amount, setAmount] = useState<number>(initialAmount ?? 50)
  const [timeStr, setTimeStr] = useState<string>(initSplit.time)
  const [dateStr, setDateStr] = useState<string>(initSplit.date)
  const [notes, setNotes] = useState<string>(initialNotes ?? '')

  useEffect(() => {
    if (open) {
      const seed = initialTime ?? localDatetimeInput(new Date())
      const s = splitDatetimeLocal(seed)
      setAmount(initialAmount ?? 50)
      setTimeStr(s.time)
      setDateStr(s.date)
      setNotes(initialNotes ?? '')
    }
  }, [open, initialAmount, initialTime, initialNotes])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-zinc-900 border-t sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg font-medium">{title}</div>
          <button onClick={onClose} className="text-zinc-400 text-2xl leading-none">×</button>
        </div>

        <div className="text-center mb-2">
          <div className="text-5xl font-light tabular-nums">{amount.toFixed(0)}<span className="text-2xl text-zinc-500 ml-1">ml</span></div>
          {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
        </div>

        <div className="flex items-center justify-center gap-3 mb-5">
          <button
            onClick={() => setAmount((a) => Math.max(0, a - step))}
            className="w-12 h-12 rounded-full bg-zinc-800 text-2xl active:scale-95"
          >−</button>
          <input
            type="range"
            min={0}
            max={150}
            step={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="flex-1 accent-pink-300"
          />
          <button
            onClick={() => setAmount((a) => a + step)}
            className="w-12 h-12 rounded-full bg-zinc-800 text-2xl active:scale-95"
          >+</button>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">Time</label>
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-full bg-zinc-800 rounded-lg px-3 py-3 text-zinc-100 text-2xl font-light tabular-nums text-center"
            />
          </div>
          <div className="w-32">
            <label className="block text-xs text-zinc-500 mb-1">Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full bg-zinc-800 rounded-lg px-2 py-3 text-zinc-300 text-sm tabular-nums text-center"
            />
          </div>
        </div>

        <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="spit-up, fussy, etc."
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-4 text-zinc-100 placeholder:text-zinc-600"
        />

        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-3 rounded-xl bg-rose-950 text-rose-300 text-sm"
              disabled={saving}
            >
              Delete
            </button>
          )}
          <button
            onClick={() => {
              const at = new Date(`${dateStr}T${timeStr}:00`).toISOString()
              onSave({ amount_ml: amount, at, notes })
            }}
            disabled={saving || amount <= 0 || !timeStr || !dateStr}
            className="flex-1 py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium active:scale-[.98] disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
