export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtMl(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(digits)} ml`
}

export function localDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtRelative(iso: string, now = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (diffMin >= -1 && diffMin <= 1) return 'now'
  if (diffMin < 0) {
    const m = -diffMin
    if (m < 60) return `${m} min ago`
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h} h ${r} min ago` : `${h} h ago`
  }
  if (diffMin < 60) return `in ${diffMin} min`
  const h = Math.floor(diffMin / 60)
  const r = diffMin % 60
  return r ? `in ${h} h ${r} min` : `in ${h} h`
}

export function ageInDays(birthIso: string): number {
  const birth = new Date(birthIso).getTime()
  return Math.floor((Date.now() - birth) / 86_400_000)
}

export function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
