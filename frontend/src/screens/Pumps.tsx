import { useMemo, useState } from 'react'
import { useAppSettings, useDeletePump, useFeeds, usePatchPump, usePumps } from '../api/hooks'
import { AmountModal } from '../components/AmountModal'
import { PumpDailyChart } from '../components/PumpDailyChart'
import { useIsReadOnly } from '../lib/authMode'
import { fmtDate, fmtTime, localDatetimeInput } from '../lib/format'
import type { Pump } from '../api/types'

const DETAIL_DAYS = 7
const CHART_DAYS = 7

/** Inner content of the pumps view, mounted as a sub-tab inside Trends.
 *  No outer page wrapper — the parent provides padding. */
export function PumpsSection() {
  const readOnly = useIsReadOnly()
  const { data, isLoading } = usePumps(CHART_DAYS)
  const { data: feeds } = useFeeds(CHART_DAYS)
  const { data: appSettings } = useAppSettings()
  const patch = usePatchPump()
  const del = useDeletePump()
  const [editing, setEditing] = useState<Pump | null>(null)

  const pumps = data ?? []
  const bottlePrepMl = appSettings?.bottle_prep_ml ?? 60

  const recent = useMemo(() => {
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - (DETAIL_DAYS - 1))
    return pumps.filter((p) => new Date(p.pumped_at) >= cutoff)
  }, [pumps])

  const grouped = useMemo(() => {
    const out = new Map<string, { day: string; total: number; items: Pump[] }>()
    for (const p of recent) {
      const day = new Date(p.pumped_at).toDateString()
      if (!out.has(day)) out.set(day, { day, total: 0, items: [] })
      const bucket = out.get(day)!
      bucket.total += p.amount_ml
      bucket.items.push(p)
    }
    return Array.from(out.values()).sort((a, b) => +new Date(b.day) - +new Date(a.day))
  }, [recent])

  if (isLoading) return <div className="p-8 text-center text-zinc-500">Loading…</div>

  return (
    <>
      {(pumps.length > 0 || (feeds ?? []).length > 0) && (
        <div className="rounded-xl bg-zinc-900/60 p-3 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
            Supply vs intake · last {CHART_DAYS} days
          </div>
          <PumpDailyChart pumps={pumps} feeds={feeds ?? []} bottlePrepMl={bottlePrepMl} days={CHART_DAYS} />
          <div className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
            Each bottle counts at the prep volume ({bottlePrepMl} ml) regardless of how much Zoey
            actually drank — the leftover is discarded once thawed. Positive balance means Sabrina is
            pumping faster than the bottles are drawing down storage. The 4-day tile matches how long
            fresh milk keeps in the fridge. Breastfeeds don't show on either side. Update the prep
            volume in Settings when bottle size changes.
          </div>
        </div>
      )}

      <div className="text-center text-zinc-500 text-sm mb-4">Last {DETAIL_DAYS} days of pumping</div>
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
                  onClick={readOnly ? undefined : () => setEditing(p)}
                  className={`rounded-lg bg-zinc-900/60 p-3 flex justify-between items-center ${
                    readOnly ? '' : 'active:bg-zinc-900'
                  }`}
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
        defaultSliderMax={300}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (!editing) return
          patch.mutate(
            { id: editing.id, amount_ml: input.amount_ml, pumped_at: input.at, notes: input.notes },
            { onSuccess: () => setEditing(null) },
          )
        }}
        onDelete={editing ? () => del.mutate(editing, { onSuccess: () => setEditing(null) }) : undefined}
        saving={patch.isPending || del.isPending}
      />
    </>
  )
}
