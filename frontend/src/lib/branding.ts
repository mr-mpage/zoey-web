/** Forker's edit-here file.
 *
 * The lock-screen footer copyright is the only personalisation string
 * not driven by app_settings (the lock screen renders before any
 * authenticated lookup is plausible, and a copyright line is a one-time
 * fork concern). Baby name and parent names both live in Settings →
 * Baby profile and flow through at runtime.
 *
 * The hand-crafted encouragement strings in `encouragement.ts` still
 * keep the baby's name inline by design — they read as one written
 * voice and a mechanical substitution would lose the cadence. Sed
 * those when you fork.
 */

export const COPYRIGHT_HOLDER = 'The Page Family'
