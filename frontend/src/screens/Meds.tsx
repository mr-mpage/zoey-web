import { useMemo, useState } from 'react'
import {
  useCreateMedDose,
  useDeleteMedDose,
  useMedDoses,
  useMeds,
  useMedsToday,
  usePatchMedDose,
} from '../api/hooks'
import { useIsReadOnly } from '../lib/authMode'
import { fmtClock, fmtDate, fmtTime, localDatetimeInput } from '../lib/format'
import type { Med, MedDoseWithMed, MedTodayRow, MedTodaySlot } from '../api/types'

const HISTORY_DAYS = 14

function PendingPill({
  label,
  onTap,
  disabled,
}: {
  label: string
  onTap: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      className="w-full flex items-center justify-between rounded-lg bg-zinc-900/40 border border-dashed border-zinc-700/60 px-3 py-2.5 text-left active:scale-[0.99] transition disabled:opacity-60 disabled:active:scale-100"
    >
      <span className="text-zinc-300">{label}</span>
      <span className="text-[11px] text-zinc-500">{disabled ? 'Pending' : 'Tap to log now'}</span>
    </button>
  )
}

function DonePill({
  label,
  dose,
  isExtra,
  onEdit,
  readOnly,
}: {
  label: string
  dose: MedDoseWithMed
  isExtra?: boolean
  onEdit: () => void
  readOnly?: boolean
}) {
  return (
    <button
      onClick={readOnly ? undefined : onEdit}
      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left ${
        isExtra
          ? 'bg-amber-500/10 border border-amber-500/25'
          : 'bg-emerald-500/10 border border-emerald-500/25'
      } ${readOnly ? '' : 'active:scale-[0.99] transition'}`}
    >
      <div className="flex items-center gap-2">
        <span className={isExtra ? 'text-amber-200' : 'text-emerald-200'}>✓</span>
        <span className="text-zinc-100">{label}</span>
        {isExtra && <span className="text-[10px] uppercase tracking-wider text-amber-300/80">extra</span>}
      </div>
      <div className="text-[11px] text-zinc-400 tabular-nums">{fmtClock(dose.given_at)}</div>
    </button>
  )
}

function TodayRow({
  row,
  onLog,
  onEdit,
  readOnly,
}: {
  row: MedTodayRow
  onLog: (med: Med) => void
  onEdit: (dose: MedDoseWithMed) => void
  readOnly: boolean
}) {
  const completed = row.slots.filter((s) => s.dose).length
  const total = row.slots.length
  const allDone = total > 0 && completed === total
  const subtitle =
    total === 0
      ? 'as needed'
      : allDone
        ? 'all done'
        : `${completed} of ${total} done`

  return (
    <div className="rounded-xl bg-zinc-900/60 p-3 mb-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm text-zinc-100">{row.med.name}</div>
        <div className={`text-[11px] tabular-nums ${allDone ? 'text-emerald-300' : 'text-zinc-500'}`}>
          {subtitle}
        </div>
      </div>
      <div className="space-y-1.5">
        {row.slots.map((slot: MedTodaySlot) =>
          slot.dose ? (
            <DonePill
              key={`s-${slot.slot_index}`}
              label={`Dose ${slot.slot_index + 1}`}
              dose={slot.dose}
              onEdit={() => onEdit(slot.dose!)}
              readOnly={readOnly}
            />
          ) : (
            <PendingPill
              key={`s-${slot.slot_index}`}
              label={`Dose ${slot.slot_index + 1}`}
              onTap={() => onLog(row.med)}
              disabled={readOnly}
            />
          ),
        )}
        {row.extras.map((dose) => (
          <DonePill
            key={`e-${dose.id}`}
            label="Extra dose"
            dose={dose}
            isExtra
            onEdit={() => onEdit(dose)}
            readOnly={readOnly}
          />
        ))}
        {/* "As needed" meds (doses_per_day = 0): show a single tap-to-log row */}
        {row.slots.length === 0 && row.extras.length === 0 && (
          <PendingPill
            label="Log a dose"
            onTap={() => onLog(row.med)}
            disabled={readOnly}
          />
        )}
      </div>
    </div>
  )
}

type LogDraft = {
  med: Med | null  // null means free-text one-off
  name: string
  given_at: string
  notes: string
}

type EditDraft = {
  dose: MedDoseWithMed
  given_at: string
  notes: string
}

function LogModal({
  draft,
  meds,
  onClose,
  onSave,
  saving,
}: {
  draft: LogDraft
  meds: Med[]
  onClose: () => void
  onSave: (input: { med_id: number | null; name: string; given_at: string; notes: string }) => void
  saving: boolean
}) {
  const [med, setMed] = useState<Med | null>(draft.med)
  const [name, setName] = useState(draft.name)
  const [givenAt, setGivenAt] = useState(draft.given_at)
  const [notes, setNotes] = useState(draft.notes)

  const isOneOff = med === null
  const submittable = !isOneOff || name.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-zinc-950 rounded-t-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-zinc-300">Log a dose</div>
          <button onClick={onClose} className="text-zinc-500 text-sm">Cancel</button>
        </div>

        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Medication</div>
          <div className="grid grid-cols-2 gap-1.5">
            {meds.map((m) => (
              <button
                key={m.id}
                onClick={() => setMed(m)}
                className={`rounded-lg py-2 px-3 text-left text-sm border ${
                  med?.id === m.id
                    ? 'border-pink-300/50 bg-pink-300/10 text-pink-100'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
                }`}
              >
                {m.name}
              </button>
            ))}
            <button
              onClick={() => setMed(null)}
              className={`rounded-lg py-2 px-3 text-left text-sm border ${
                med === null
                  ? 'border-pink-300/50 bg-pink-300/10 text-pink-100'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
              }`}
            >
              + One-off
            </button>
          </div>
        </div>

        {isOneOff && (
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Name</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Saline drops"
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm"
              maxLength={80}
            />
          </div>
        )}

        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Time</div>
          <input
            type="datetime-local"
            value={givenAt}
            onChange={(e) => setGivenAt(e.target.value)}
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm tabular-nums"
          />
        </div>

        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Notes</div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={() =>
            onSave({
              med_id: med ? med.id : null,
              name: name.trim(),
              given_at: new Date(givenAt).toISOString(),
              notes: notes.trim(),
            })
          }
          disabled={!submittable || saving}
          className="w-full py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Log dose'}
        </button>
      </div>
    </div>
  )
}

function EditModal({
  draft,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  draft: EditDraft
  onClose: () => void
  onSave: (input: { given_at: string; notes: string }) => void
  onDelete: () => void
  saving: boolean
}) {
  const [givenAt, setGivenAt] = useState(draft.given_at)
  const [notes, setNotes] = useState(draft.notes)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-zinc-950 rounded-t-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-zinc-300">{draft.dose.name}</div>
          <button onClick={onClose} className="text-zinc-500 text-sm">Cancel</button>
        </div>

        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Time</div>
          <input
            type="datetime-local"
            value={givenAt}
            onChange={(e) => setGivenAt(e.target.value)}
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm tabular-nums"
          />
        </div>

        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Notes</div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDelete}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm disabled:opacity-40"
          >
            Delete
          </button>
          <button
            onClick={() =>
              onSave({
                given_at: new Date(givenAt).toISOString(),
                notes: notes.trim(),
              })
            }
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-pink-300 text-zinc-900 text-sm font-medium disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function MedsScreen() {
  const readOnly = useIsReadOnly()
  const today = useMedsToday()
  const meds = useMeds()
  const history = useMedDoses(HISTORY_DAYS)
  const create = useCreateMedDose()
  const patch = usePatchMedDose()
  const del = useDeleteMedDose()

  const [logDraft, setLogDraft] = useState<LogDraft | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, MedDoseWithMed[]>()
    for (const d of history.data ?? []) {
      const day = new Date(d.given_at).toDateString()
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(d)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => +new Date(b) - +new Date(a))
      .map(([day, items]) => ({
        day,
        items: items.sort((a, b) => +new Date(b.given_at) - +new Date(a.given_at)),
      }))
  }, [history.data])

  const openLog = (med: Med | null) => {
    setLogDraft({
      med,
      name: '',
      given_at: localDatetimeInput(new Date()),
      notes: '',
    })
  }

  const openEdit = (dose: MedDoseWithMed) => {
    setEditDraft({
      dose,
      given_at: localDatetimeInput(new Date(dose.given_at)),
      notes: dose.notes ?? '',
    })
  }

  if (today.isLoading) return <div className="p-8 text-center text-zinc-500">Loading…</div>

  const todayData = today.data
  const medsList = meds.data ?? []

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Meds</div>

      {todayData && (
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 px-1">Today</div>
          {todayData.rows.length === 0 ? (
            <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">
              No meds configured. Add one in Settings.
            </div>
          ) : (
            todayData.rows.map((row) => (
              <TodayRow
                key={row.med.id}
                row={row}
                onLog={(m) => openLog(m)}
                onEdit={openEdit}
                readOnly={readOnly}
              />
            ))
          )}

          {todayData.one_offs.length > 0 && (
            <div className="rounded-xl bg-zinc-900/60 p-3 mb-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                One-offs today
              </div>
              <div className="space-y-1.5">
                {todayData.one_offs.map((d) => (
                  <DonePill
                    key={d.id}
                    label={d.name}
                    dose={d}
                    onEdit={() => openEdit(d)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          )}

          {!readOnly && (
            <button
              onClick={() => openLog(null)}
              className="w-full mt-1 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-300 text-sm active:scale-[0.99] transition"
            >
              + Log other / extra dose
            </button>
          )}
        </div>
      )}

      <div className="mb-2 px-1 flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
          Last {HISTORY_DAYS} days
        </div>
      </div>
      {grouped.length === 0 && (
        <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">
          No doses logged yet.
        </div>
      )}
      {grouped.map((g) => (
        <div key={g.day} className="mb-4">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <div className="text-sm">{fmtDate(g.items[0]!.given_at)}</div>
            <div className="text-[11px] tabular-nums text-zinc-500">{g.items.length}×</div>
          </div>
          <ul className="space-y-1.5">
            {g.items.map((d) => (
              <li
                key={d.id}
                onClick={readOnly ? undefined : () => openEdit(d)}
                className={`rounded-lg bg-zinc-900/60 p-3 flex items-center justify-between ${
                  readOnly ? '' : 'active:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={d.is_extra ? 'text-amber-300' : 'text-emerald-300'}>✓</span>
                  <span className="text-zinc-100 truncate">{d.name}</span>
                  {d.is_extra && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-300/80">
                      extra
                    </span>
                  )}
                  {d.notes && (
                    <span className="text-[11px] text-zinc-500 truncate">· {d.notes}</span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 tabular-nums">{fmtTime(d.given_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {logDraft && (
        <LogModal
          draft={logDraft}
          meds={medsList}
          onClose={() => setLogDraft(null)}
          saving={create.isPending}
          onSave={(input) =>
            create.mutate(
              {
                med_id: input.med_id,
                name: input.name || undefined,
                given_at: input.given_at,
                notes: input.notes || undefined,
              },
              { onSuccess: () => setLogDraft(null) },
            )
          }
        />
      )}

      {editDraft && (
        <EditModal
          draft={editDraft}
          onClose={() => setEditDraft(null)}
          saving={patch.isPending || del.isPending}
          onSave={(input) =>
            patch.mutate(
              {
                id: editDraft.dose.id,
                given_at: input.given_at,
                notes: input.notes,
              },
              { onSuccess: () => setEditDraft(null) },
            )
          }
          onDelete={() =>
            del.mutate(editDraft.dose, {
              onSuccess: () => setEditDraft(null),
            })
          }
        />
      )}
    </div>
  )
}
