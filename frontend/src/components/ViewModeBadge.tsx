import { useAuthMode } from '../lib/authMode'

/** Small chip that shows when the current session is read-only and which
 *  viewer label is logged in. Renders nothing for edit sessions. */
export function ViewModeBadge() {
  const { mode, label } = useAuthMode()
  if (mode !== 'view') return null
  return (
    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 text-[11px] px-2 py-0.5">
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Viewing{label ? ` as ${label}` : ''} · read-only
    </div>
  )
}
