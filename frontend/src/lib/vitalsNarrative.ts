import type { VitalsDay } from '../api/hooks'

export type VitalsNarrative = {
  tone: 'celebrate' | 'positive' | 'neutral' | 'concern'
  headline: string
  detail: string
}

/** Reference ranges, calibrated against multiple sources:
 *
 *  - CHOP Neonatal Oxygen Targeting Consensus (2024): for ≥32 wk PMA
 *    preterm infants, target 92–98% on supplemental O2 and >92% off it.
 *  - Royal Children's Hospital (Melbourne) guideline: 91–95% target,
 *    89% lower alarm limit (with caveat that 89% on the pulse-ox can
 *    reflect true arterial sat as low as <80%).
 *  - SUPPORT and BOOST II trials: targeting <90% in extremely preterm
 *    infants is associated with increased mortality.
 *
 *  Zoey is ≥32 wk PMA, so 92% is the consensus floor for "in target".
 *  Below 88% is the standard clinical alarm threshold. HR ranges run
 *  wide for preterm/newborn, so the "typical" band stays generous. */
export const HR_NORMAL_LOW = 100
export const HR_NORMAL_HIGH = 175
export const HR_AVG_TYPICAL_LOW = 120
export const HR_AVG_TYPICAL_HIGH = 160
export const SPO2_HEALTHY = 92 // ≥ green: in target window for ≥32w PMA
export const SPO2_WATCH = 90 // 90–91 yellow: below target, normal occasional dip
export const SPO2_FLAG = 88 // 88–89 amber (near alarm threshold), <88 rose

export function hrAvgTone(v: number | null): 'good' | 'watch' | 'unknown' {
  if (v == null) return 'unknown'
  if (v >= HR_AVG_TYPICAL_LOW && v <= HR_AVG_TYPICAL_HIGH) return 'good'
  return 'watch'
}

export function spo2Tone(v: number | null): 'good' | 'watch' | 'concern' | 'unknown' {
  if (v == null) return 'unknown'
  if (v >= SPO2_HEALTHY) return 'good'
  if (v >= SPO2_WATCH) return 'watch'
  if (v >= SPO2_FLAG) return 'watch'
  return 'concern'
}

/** Plain-language paragraph for the Vitals tab. Mirrors the shape of
 *  buildWeightNarrative: a headline + a longer detail line, tone matches
 *  the underlying data so the card border colours track what's said. */
export function buildVitalsNarrative(days: VitalsDay[]): VitalsNarrative | null {
  const monitored = days.filter((d) => d.monitoring_minutes >= 30)
  if (monitored.length === 0) return null

  const hrAvgs = monitored.map((d) => d.hr_avg).filter((v): v is number => v != null)
  const lowSpo2s = monitored.map((d) => d.spo2_min_avg10).filter((v): v is number => v != null)
  const totalAlerts = monitored.reduce((s, d) => s + d.low_spo2_alert_count, 0)
  const totalHours = monitored.reduce((s, d) => s + d.monitoring_minutes, 0) / 60

  if (hrAvgs.length === 0 || lowSpo2s.length === 0) {
    return {
      tone: 'neutral',
      headline: 'Limited monitoring data this week',
      detail: `${totalHours.toFixed(0)} h of monitoring across ${monitored.length} day${monitored.length === 1 ? '' : 's'}. More readings will fill in the picture.`,
    }
  }

  const hrAvgMin = Math.min(...hrAvgs)
  const hrAvgMax = Math.max(...hrAvgs)
  const weeklyMinSpo2 = Math.min(...lowSpo2s)
  // Collapse the range when one day or when rounding makes it degenerate —
  // "150–150 BPM" reads as a typo.
  const hrRangePhrase =
    Math.round(hrAvgMin) === Math.round(hrAvgMax)
      ? `${Math.round(hrAvgMin)} BPM`
      : `${Math.round(hrAvgMin)}–${Math.round(hrAvgMax)} BPM`
  const hrTypical = hrAvgs.every((v) => v >= HR_AVG_TYPICAL_LOW && v <= HR_AVG_TYPICAL_HIGH)
  const spo2Healthy = lowSpo2s.every((v) => v >= SPO2_HEALTHY)
  const anySpo2Flag = lowSpo2s.some((v) => v < SPO2_FLAG)
  const spo2Watch = lowSpo2s.some((v) => v < SPO2_HEALTHY && v >= SPO2_FLAG)

  // Concern: any sustained drop below SPO2_FLAG (88%, near standard alarm)
  if (anySpo2Flag) {
    const flagDays = monitored.filter((d) => d.spo2_min_avg10 != null && d.spo2_min_avg10 < SPO2_FLAG)
    return {
      tone: 'concern',
      headline: `${flagDays.length} day${flagDays.length === 1 ? '' : 's'} below ${SPO2_FLAG}% SpO₂`,
      detail: `Lowest sustained SpO₂ this week: ${Math.round(weeklyMinSpo2)}%. That's at or below the standard NICU alarm threshold. Worth raising at her next check-in. Owlet continues to alert in real time on its own thresholds.`,
    }
  }

  // All good
  if (hrTypical && spo2Healthy && totalAlerts === 0) {
    return {
      tone: 'celebrate',
      headline: 'Vitals looking comfortable this week',
      detail: `Heart rate held ${hrRangePhrase} average across ${monitored.length} monitored day${monitored.length === 1 ? '' : 's'}, lowest SpO₂ ${Math.round(weeklyMinSpo2)}%. All in the typical preterm range, no alerts.`,
    }
  }

  // Watch: SpO2 dipped into 88–91 range (below target but above alarm)
  if (spo2Watch && hrTypical) {
    return {
      tone: 'positive',
      headline: 'Steady week with a brief SpO₂ dip',
      detail: `HR averaged ${hrRangePhrase}, comfortably in the typical preterm range. Lowest sustained SpO₂ touched ${Math.round(weeklyMinSpo2)}% — just below the 92% preterm target floor, worth a glance but not a flag.`,
    }
  }

  // HR running outside typical
  if (!hrTypical) {
    const above = hrAvgs.some((v) => v > HR_AVG_TYPICAL_HIGH)
    const below = hrAvgs.some((v) => v < HR_AVG_TYPICAL_LOW)
    const spanPhrase =
      Math.round(hrAvgMin) === Math.round(hrAvgMax)
        ? `Daily average sat at ${Math.round(hrAvgMin)} BPM`
        : `Daily averages spanned ${Math.round(hrAvgMin)}–${Math.round(hrAvgMax)} BPM`
    return {
      tone: 'positive',
      headline: above && below
        ? 'Heart rate ranging wider than usual'
        : above
          ? 'Heart rate running on the higher end'
          : 'Heart rate running on the lower end',
      detail: `${spanPhrase}. Newborn HR is naturally wide and varies with sleep and crying — context-dependent, not automatic concern. Lowest SpO₂ ${Math.round(weeklyMinSpo2)}%.`,
    }
  }

  // Default fallback
  return {
    tone: 'positive',
    headline: 'Vitals tracking nicely',
    detail: `${totalHours.toFixed(0)} h monitored across ${monitored.length} days. HR ${hrRangePhrase} avg, lowest SpO₂ ${Math.round(weeklyMinSpo2)}%.`,
  }
}
