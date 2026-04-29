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
  initialIsExtra?: boolean
  initialMethod?: 'bottle' | 'breast'
  initialDurationMin?: number | null
  showExtraToggle?: boolean
  showMethodToggle?: boolean
  hint?: string | null
  step?: number
  /** Default upper bound of the slider; the actual max also grows to track
   *  any value reached via the + button so the slider always stays usable. */
  defaultSliderMax?: number
  onClose: () => void
  onSave: (input: {
    amount_ml: number
    at: string
    notes: string
    is_extra: boolean
    method: 'bottle' | 'breast'
    duration_min: number | null
  }) => void
  onDelete?: () => void
  saving?: boolean
}

export function AmountModal({
  open,
  title,
  initialAmount,
  initialTime,
  initialNotes,
  initialIsExtra,
  initialMethod,
  initialDurationMin,
  showExtraToggle,
  showMethodToggle,
  hint,
  step = 1,
  defaultSliderMax = 150,
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
  const [isExtra, setIsExtra] = useState<boolean>(initialIsExtra ?? false)
  const [method, setMethod] = useState<'bottle' | 'breast'>(initialMethod ?? 'bottle')
  const [durationMin, setDurationMin] = useState<string>(
    initialDurationMin != null ? String(initialDurationMin) : '',
  )

  useEffect(() => {
    if (open) {
      const seed = initialTime ?? localDatetimeInput(new Date())
      const s = splitDatetimeLocal(seed)
      setAmount(initialAmount ?? 50)
      setTimeStr(s.time)
      setDateStr(s.date)
      setNotes(initialNotes ?? '')
      setIsExtra(initialIsExtra ?? false)
      setMethod(initialMethod ?? 'bottle')
      setDurationMin(initialDurationMin != null ? String(initialDurationMin) : '')
    }
  }, [open, initialAmount, initialTime, initialNotes, initialIsExtra, initialMethod, initialDurationMin])

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

        {showMethodToggle && (
          <div className="grid grid-cols-2 gap-1 bg-zinc-800/60 rounded-lg p-1 mb-4">
            <button
              type="button"
              onClick={() => setMethod('bottle')}
              className={`py-2 rounded-md text-sm font-medium transition ${
                method === 'bottle' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
              }`}
            >
              Bottle
            </button>
            <button
              type="button"
              onClick={() => setMethod('breast')}
              className={`py-2 rounded-md text-sm font-medium transition ${
                method === 'breast' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
              }`}
            >
              Breast
            </button>
          </div>
        )}

        <div className="text-center mb-2">
          <div className="text-5xl font-light tabular-nums">
            {amount.toFixed(0)}
            <span className="text-2xl text-zinc-500 ml-1">ml</span>
          </div>
          {method === 'breast' && (
            <div className="text-[11px] text-zinc-500 mt-1">estimated · 0 ml is fine for a comfort attempt</div>
          )}
          {hint && method !== 'breast' && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
        </div>

        <div className="flex items-center justify-center gap-3 mb-5">
          <button
            onClick={() => setAmount((a) => Math.max(0, a - step))}
            className="w-12 h-12 rounded-full bg-zinc-800 text-2xl active:scale-95"
          >−</button>
          <input
            type="range"
            min={0}
            max={Math.max(defaultSliderMax, amount + 20)}
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

        <div className="flex gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-zinc-500 mb-1">Time</label>
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-full h-12 box-border bg-zinc-800 rounded-lg px-2 text-zinc-100 text-base tabular-nums text-center appearance-none"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-zinc-500 mb-1">Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full h-12 box-border bg-zinc-800 rounded-lg px-2 text-zinc-100 text-base tabular-nums text-center appearance-none"
            />
          </div>
        </div>

        {method === 'breast' && (
          <>
            <label className="block text-xs text-zinc-500 mb-1">Duration at breast (minutes)</label>
            <input
              inputMode="numeric"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 10"
              className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-4 tabular-nums"
            />
          </>
        )}

        <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="spit-up, fussy, etc."
          className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 mb-4 text-zinc-100 placeholder:text-zinc-600"
        />

        {showExtraToggle && (
          <button
            type="button"
            onClick={() => setIsExtra((v) => !v)}
            className={`w-full mb-4 px-3 py-2.5 rounded-lg border text-left transition ${
              isExtra ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-800 bg-zinc-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Extra feed (off-schedule)</div>
                <div className="text-[11px] text-zinc-500">
                  Counted in daily total, but doesn't shift the feed-of-day numbering or pace expectations.
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition shrink-0 ml-3 ${isExtra ? 'bg-amber-400' : 'bg-zinc-700'}`}>
                <div className={`w-5 h-5 rounded-full bg-zinc-100 transition ${isExtra ? 'translate-x-4' : ''}`} />
              </div>
            </div>
          </button>
        )}

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
              const dm = durationMin ? parseInt(durationMin, 10) : null
              onSave({
                amount_ml: amount,
                at,
                notes,
                is_extra: isExtra,
                method,
                duration_min: method === 'breast' ? dm : null,
              })
            }}
            disabled={saving || (method === 'bottle' && amount <= 0) || amount < 0 || !timeStr || !dateStr}
            className="flex-1 py-3 rounded-xl bg-pink-300 text-zinc-900 font-medium active:scale-[.98] disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
