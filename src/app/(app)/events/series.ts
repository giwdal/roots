// Repeating an event (pure): the next start times after a first one, as local "YYYY-MM-DDTHH:MM" (Europe/Berlin wall clock,
// so 20:00 stays 20:00 across daylight saving). "month" = the same weekday in the same week of the month (2nd Friday);
// months without it (a 5th Friday) are skipped.
export const EVERY = ["week", "2weeks", "month"] as const
export type Every = (typeof EVERY)[number]
export const MAX_DATES = 52

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** `count` start times after `first` (not including it). */
export function nextStarts(first: string, every: Every, count: number): string[] {
  const [date, time] = first.split("T")
  const base = new Date(`${date}T00:00:00Z`)
  const out: string[] = []
  const n = Math.min(Math.max(0, Math.floor(count)), MAX_DATES)
  if (every !== "month") {
    const step = every === "week" ? 7 : 14
    for (let i = 1; i <= n; i++) out.push(`${iso(new Date(base.getTime() + i * step * 86_400_000))}T${time}`)
    return out
  }
  const week = Math.ceil(base.getUTCDate() / 7)
  const weekday = base.getUTCDay()
  for (let m = 1; out.length < n && m <= n * 2 + 12; m++) {
    const first1 = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + m, 1))
    const day = 1 + ((weekday - first1.getUTCDay() + 7) % 7) + (week - 1) * 7
    const d = new Date(Date.UTC(first1.getUTCFullYear(), first1.getUTCMonth(), day))
    if (d.getUTCMonth() === first1.getUTCMonth()) out.push(`${iso(d)}T${time}`)
  }
  return out
}

/** Same date, new wall-clock time: "2026-12-01T20:00" + "21:30" → "2026-12-01T21:30". */
export const atTime = (local: string, time: string) => `${local.slice(0, 10)}T${time}`
