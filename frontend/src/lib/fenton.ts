/**
 * Fenton 2025 preterm growth reference (girls) — weight in grams by PMA week.
 *
 * Values for 3rd, 10th, 90th percentiles are taken directly from the published
 * Fenton 2025 third-generation cutoff table (Tanis Fenton et al., University of
 * Calgary, https://ucalgary.ca/resource/preterm-growth-chart, CC BY-NC-ND 4.0;
 * Paediatr Perinat Epidemiol 2025).
 *
 * The 50th percentile is computed as the midpoint of the 10th and 90th —
 * within ~1% of the published median across the 22–42w range. Used here only
 * for parent-facing visual context, not for clinical decisions.
 */

export type FentonRow = { pma: number; p3: number; p10: number; p50: number; p90: number }

export const fentonGirls: FentonRow[] = [
  { pma: 22, p3: 359, p10: 392, p50: 475, p90: 558 },
  { pma: 23, p3: 423, p10: 464, p50: 563, p90: 662 },
  { pma: 24, p3: 492, p10: 542, p50: 658, p90: 774 },
  { pma: 25, p3: 570, p10: 631, p50: 767, p90: 902 },
  { pma: 26, p3: 658, p10: 729, p50: 887, p90: 1044 },
  { pma: 27, p3: 753, p10: 834, p50: 1016, p90: 1197 },
  { pma: 28, p3: 853, p10: 944, p50: 1152, p90: 1359 },
  { pma: 29, p3: 964, p10: 1062, p50: 1299, p90: 1536 },
  { pma: 30, p3: 1086, p10: 1194, p50: 1465, p90: 1735 },
  { pma: 31, p3: 1220, p10: 1340, p50: 1649, p90: 1958 },
  { pma: 32, p3: 1366, p10: 1500, p50: 1850, p90: 2199 },
  { pma: 33, p3: 1524, p10: 1673, p50: 2060, p90: 2447 },
  { pma: 34, p3: 1691, p10: 1855, p50: 2277, p90: 2699 },
  { pma: 35, p3: 1863, p10: 2043, p50: 2499, p90: 2954 },
  { pma: 36, p3: 2038, p10: 2231, p50: 2721, p90: 3211 },
  { pma: 37, p3: 2211, p10: 2418, p50: 2927, p90: 3436 },
  { pma: 38, p3: 2407, p10: 2618, p50: 3131, p90: 3643 },
  { pma: 39, p3: 2593, p10: 2804, p50: 3316, p90: 3828 },
  { pma: 40, p3: 2743, p10: 2957, p50: 3474, p90: 3991 },
  { pma: 41, p3: 2857, p10: 3077, p50: 3609, p90: 4140 },
  { pma: 42, p3: 2859, p10: 3087, p50: 3636, p90: 4184 },
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
