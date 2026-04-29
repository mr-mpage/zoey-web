/**
 * Fenton 2013 preterm growth reference (girls) — weight in grams by PMA week.
 *
 * Values for 3rd, 10th, 90th percentiles are taken directly from the published
 * Fenton 2013 size-at-birth cutoff table (Tanis Fenton, University of Calgary,
 * https://ucalgary.ca/resource/preterm-growth-chart, CC BY-NC-ND 4.0).
 *
 * The 50th percentile is computed as the midpoint of the 10th and 90th —
 * within ~1% of the published Fenton median across the 22–42w range. Used
 * here only for parent-facing visual context, not for clinical decisions.
 */

export type FentonRow = { pma: number; p3: number; p10: number; p50: number; p90: number }

export const fentonGirls: FentonRow[] = [
  { pma: 22, p3: 399, p10: 428, p50: 524, p90: 619 },
  { pma: 23, p3: 423, p10: 470, p50: 587, p90: 704 },
  { pma: 24, p3: 451, p10: 514, p50: 655, p90: 796 },
  { pma: 25, p3: 476, p10: 562, p50: 737, p90: 912 },
  { pma: 26, p3: 507, p10: 613, p50: 832, p90: 1051 },
  { pma: 27, p3: 548, p10: 675, p50: 935, p90: 1194 },
  { pma: 28, p3: 594, p10: 747, p50: 1055, p90: 1363 },
  { pma: 29, p3: 677, p10: 850, p50: 1202, p90: 1554 },
  { pma: 30, p3: 789, p10: 977, p50: 1375, p90: 1772 },
  { pma: 31, p3: 920, p10: 1121, p50: 1566, p90: 2010 },
  { pma: 32, p3: 1110, p10: 1308, p50: 1792, p90: 2275 },
  { pma: 33, p3: 1294, p10: 1507, p50: 2024, p90: 2540 },
  { pma: 34, p3: 1487, p10: 1711, p50: 2265, p90: 2819 },
  { pma: 35, p3: 1731, p10: 1954, p50: 2518, p90: 3081 },
  { pma: 36, p3: 1937, p10: 2172, p50: 2746, p90: 3320 },
  { pma: 37, p3: 2159, p10: 2401, p50: 2975, p90: 3549 },
  { pma: 38, p3: 2396, p10: 2629, p50: 3187, p90: 3745 },
  { pma: 39, p3: 2570, p10: 2800, p50: 3343, p90: 3886 },
  { pma: 40, p3: 2706, p10: 2934, p50: 3476, p90: 4018 },
  { pma: 41, p3: 2782, p10: 3022, p50: 3581, p90: 4140 },
  { pma: 42, p3: 2879, p10: 3134, p50: 3744, p90: 4354 },
]

export const fentonPmaRange: [number, number] = [22, 42]

/** Linear interpolation across the integer-week table. */
export function fentonAt(pma: number): FentonRow | null {
  if (pma < fentonGirls[0].pma || pma > fentonGirls[fentonGirls.length - 1].pma) return null
  const lo = Math.floor(pma)
  const hi = Math.ceil(pma)
  const a = fentonGirls.find((r) => r.pma === lo)!
  if (hi === lo) return a
  const b = fentonGirls.find((r) => r.pma === hi)!
  const t = pma - lo
  return {
    pma,
    p3: a.p3 + (b.p3 - a.p3) * t,
    p10: a.p10 + (b.p10 - a.p10) * t,
    p50: a.p50 + (b.p50 - a.p50) * t,
    p90: a.p90 + (b.p90 - a.p90) * t,
  }
}

/** Approximate percentile rank using log-normal interpolation between the
 *  table's anchor percentiles. Returned in the range [1, 99]; useful for a
 *  one-line "≈ 25th percentile" caption beside the chart. */
export function approxPercentile(pma: number, weightG: number): number | null {
  const ref = fentonAt(pma)
  if (!ref) return null
  const w = weightG
  const anchors: [number, number][] = [
    [3, ref.p3],
    [10, ref.p10],
    [50, ref.p50],
    [90, ref.p90],
  ]
  if (w <= anchors[0][1]) return Math.max(1, Math.round(3 * (w / anchors[0][1])))
  if (w >= anchors[anchors.length - 1][1]) return 99
  for (let i = 0; i < anchors.length - 1; i++) {
    const [pa, wa] = anchors[i]
    const [pb, wb] = anchors[i + 1]
    if (w >= wa && w <= wb) {
      const t = (Math.log(w) - Math.log(wa)) / (Math.log(wb) - Math.log(wa))
      return Math.round(pa + (pb - pa) * t)
    }
  }
  return null
}
