import { useEffect, useState } from 'react'
import { useDeleteDiaper, usePatchDiaper } from '../api/hooks'
import { fmtTime } from '../lib/format'
import type { Diaper } from '../api/types'

type Props = {
  open: boolean
  kind: 'wet' | 'dirty'
  entries: Diaper[]
  onClose: () => void
}

/** Lightweight editor for today's diapers of one kind. Entries are
 *  shown chronologically; each row has an inline notes input and a
 *  delete button. Save button is enabled only when a row has changed. */
export function DiaperListModal({ open, kind, entries, onClose }: Props) {
  const patch = usePatchDiaper()
  const del = useDeleteDiaper()
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  useEffect(() => {
    if (open) {
      setDrafts(Object.fromEntries(entries.map((e) => [e.id, e.notes ?? ''])))
    }
  }, [open, entries])

  if (!open) return null

  const sorted = [...entries].sort(
    (a, b) => +new Date(b.recorded_at) - +new Date(a.recorded_at),
  )

  const dirty = (e: Diaper) => (drafts[e.id] ?? '') !== (e.notes ?? '')
  const anyDirty = sorted.some(dirty)

  const saveAll = async () => {
    for (const e of sorted) {
      if (dirty(e)) {
        await patch.mutateAsync({ id: e.id, notes: drafts[e.id] ?? '' })
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[90dvh] bg-zinc-900 sm:border border-zinc-800 sm:rounded-2xl rounded-t-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="text-base font-medium capitalize">Today's {kind} diapers</div>
          <button onClick={onClose} className="text-zinc-400 text-3xl leading-none w-8 h-8" aria-label="Close">
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {sorted.length === 0 && (
            <div className="text-zinc-500 text-sm text-center py-6">
              No {kind} diapers logged today.
            </div>
          )}
          {sorted.map((e) => (
            <div key={e.id} className="rounded-xl bg-zinc-800/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm tabular-nums text-zinc-300">{fmtTime(e.recorded_at)}</div>
                <button
                  onClick={() => del.mutate(e)}
                  disabled={del.isPending || patch.isPending}
                  className="text-rose-300 text-xs px-2 py-1 rounded bg-rose-950/60 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={drafts[e.id] ?? ''}
                onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-500"
              />
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-sm"
          >
            Close
          </button>
          <button
            onClick={saveAll}
            disabled={!anyDirty || patch.isPending}
            className="flex-1 py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
          >
            {patch.isPending ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </div>
    </div>
  )
}
