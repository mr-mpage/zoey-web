/**
 * Niklasson 2008 growth reference (girls) — weight in grams by PMA week.
 *
 * Source: Niklasson A, Albertsson-Wikland K. Continuous growth reference from
 * 24th week of gestation to 24 months by gender. BMC Pediatrics 2008;8:8.
 * doi:10.1186/1471-2431-8-8. Licensed CC-BY 2.0 (irrevocable, commercial use
 * permitted with attribution).
 *
 * Percentile values derived from Table 4 mean and SD of log10[weight(kg)]
 * using standard-normal z-scores. Zoey-tracker bundles only girls and only
 * GA weeks 24–40 (the preterm window the app is designed for).
 */

export type NiklassonRow = { pma: number; p3: number; p10: number; p50: number; p90: number }

export const niklassonGirls: NiklassonRow[] = [
  { pma: 24, p3: 492, p10: 541, p50: 664, p90: 814 },
  { pma: 25, p3: 587, p10: 644, p50: 785, p90: 957 },
  { pma: 26, p3: 692, p10: 758, p50: 920, p90: 1118 },
  { pma: 27, p3: 803, p10: 878, p50: 1064, p90: 1289 },
  { pma: 28, p3: 924, p10: 1009, p50: 1219, p90: 1472 },
  { pma: 29, p3: 1053, p10: 1149, p50: 1384, p90: 1666 },
  { pma: 30, p3: 1192, p10: 1299, p50: 1560, p90: 1873 },
  { pma: 31, p3: 1337, p10: 1455, p50: 1742, p90: 2085 },
  { pma: 32, p3: 1486, p10: 1615, p50: 1928, p90: 2301 },
  { pma: 33, p3: 1644, p10: 1784, p50: 2123, p90: 2527 },
  { pma: 34, p3: 1807, p10: 1957, p50: 2323, p90: 2756 },
  { pma: 35, p3: 1971, p10: 2133, p50: 2523, p90: 2986 },
  { pma: 36, p3: 2132, p10: 2306, p50: 2729, p90: 3229 },
  { pma: 37, p3: 2305, p10: 2490, p50: 2938, p90: 3466 },
  { pma: 38, p3: 2481, p10: 2676, p50: 3148, p90: 3702 },
  { pma: 39, p3: 2651, p10: 2856, p50: 3350, p90: 3928 },
  { pma: 40, p3: 2815, p10: 3032, p50: 3556, p90: 4171 },
]

export const niklassonPmaRange: [number, number] = [24, 40]

/** Linear interpolation across the integer-week table. */
export function niklassonAt(pma: number): NiklassonRow | null {
  if (pma < niklassonGirls[0].pma || pma > niklassonGirls[niklassonGirls.length - 1].pma) return null
  const lo = Math.floor(pma)
  const hi = Math.ceil(pma)
  const a = niklassonGirls.find((r) => r.pma === lo)!
  if (hi === lo) return a
  const b = niklassonGirls.find((r) => r.pma === hi)!
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
  const ref = niklassonAt(pma)
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
