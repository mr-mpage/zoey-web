import { useMemo, useState } from 'react'
import { useDeletePump, usePatchPump, usePumps } from '../api/hooks'
import { AmountModal } from '../components/AmountModal'
import { fmtDate, fmtTime, localDatetimeInput } from '../lib/format'
import type { Pump } from '../api/types'

export function PumpsScreen() {
  const { data, isLoading } = usePumps(7)
  const patch = usePatchPump()
  const del = useDeletePump()
  const [editing, setEditing] = useState<Pump | null>(null)

  const grouped = useMemo(() => {
    const out = new Map<string, { day: string; total: number; items: Pump[] }>()
    for (const p of data ?? []) {
      const day = new Date(p.pumped_at).toDateString()
      if (!out.has(day)) out.set(day, { day, total: 0, items: [] })
      const bucket = out.get(day)!
      bucket.total += p.amount_ml
      bucket.items.push(p)
    }
    return Array.from(out.values()).sort((a, b) => +new Date(b.day) - +new Date(a.day))
  }, [data])

  if (isLoading) return <div className="p-8 text-center text-zinc-500">Loading…</div>

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Last 7 days of pumping</div>
      {grouped.length === 0 && (
        <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">No pumps logged yet.</div>
      )}
      {grouped.map((g) => (
        <div key={g.day} className="mb-5">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <div className="text-sm">{fmtDate(g.items[0]!.pumped_at)}</div>
            <div className="text-sm tabular-nums text-zinc-400">{g.total.toFixed(0)} ml · {g.items.length}×</div>
          </div>
          <ul className="space-y-1.5">
            {g.items
              .slice()
              .sort((a, b) => +new Date(b.pumped_at) - +new Date(a.pumped_at))
              .map((p) => (
                <li
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className="rounded-lg bg-zinc-900/60 p-3 flex justify-between items-center active:bg-zinc-900"
                >
                  <div>
                    <div className="tabular-nums">{p.amount_ml.toFixed(0)} ml</div>
                    {p.notes && <div className="text-xs text-zinc-500 mt-0.5">{p.notes}</div>}
                  </div>
                  <div className="text-xs text-zinc-500 tabular-nums">{fmtTime(p.pumped_at)}</div>
                </li>
              ))}
          </ul>
        </div>
      ))}

      <AmountModal
        open={editing !== null}
        title="Edit pump"
        initialAmount={editing?.amount_ml}
        initialTime={editing ? localDatetimeInput(new Date(editing.pumped_at)) : undefined}
        initialNotes={editing?.notes ?? ''}
        step={10}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (!editing) return
          patch.mutate(
            { id: editing.id, amount_ml: input.amount_ml, pumped_at: input.at, notes: input.notes },
            { onSuccess: () => setEditing(null) },
          )
        }}
        onDelete={editing ? () => del.mutate(editing.id, { onSuccess: () => setEditing(null) }) : undefined}
        saving={patch.isPending || del.isPending}
      />
    </div>
  )
}
