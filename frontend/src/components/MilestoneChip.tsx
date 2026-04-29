import type { Milestone } from '../lib/milestones'

/** Small celebratory chip — one-line, pink-tinted, soft glow.
 *  Caller passes a single Milestone (or null to render nothing). */
export function MilestoneChip({ milestone }: { milestone: Milestone | null }) {
  if (!milestone) return null
  return (
    <div className="flex justify-center mt-2">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-pink-300/15 border border-pink-300/25 text-pink-100 text-[12px] px-3 py-1">
        <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 21s-7.5-4.6-7.5-10.3a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
        </svg>
        {milestone.text}
      </div>
    </div>
  )
}
