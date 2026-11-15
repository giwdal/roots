// Schedules (pure, tested in schedule.test.mjs): when a "schedule" trigger runs next, which records a date filter
// matches today, and relative dates in action values ("today+10"). All in Berlin time.
import { fromLocalInput } from "../lib/time.ts"

export type Schedule = { every: "day" | "week" | "month"; time: string; weekday?: number; monthday?: number }
const DAY = 86_400_000
export const berlinDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1

/** The first time after `after` the schedule fires (Berlin local time, DST-safe). */
export function nextRun(s: Schedule, after: Date): Date {
  const time = /^\d{2}:\d{2}$/.test(s.time) ? s.time : "09:00"
  let day = berlinDay(after)
  for (let i = 0; i < 400; i++, day = addDays(day, 1)) {
    if (s.every === "week" && isoWeekday(day) !== (s.weekday ?? 1)) continue
    if (s.every === "month" && Number(day.slice(8)) !== Math.min(s.monthday ?? 1, 28)) continue
    const at = fromLocalInput(`${day}T${time}`)!
    if (at > after) return at
  }
  return new Date(after.getTime() + DAY)
}

/** Does a date value fall on today + offset days? yearly = same month/day (birthdays, anniversaries). */
export function dateMatches(value: unknown, offset: number, yearly: boolean, today: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false
  const target = addDays(today, -offset) // value + offset = today
  const day = value.length > 10 ? berlinDay(new Date(value)) : value.slice(0, 10)
  return yearly ? day.slice(5) === target.slice(5) : day === target
}

/** Split "a, b(c, d), e" at top-level commas. */
const args = (s: string) => {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of s) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  return [...out, cur]
}
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const shift = (base: string, n: number, unit: string) => {
  if (unit === "d" || unit === "w") return addDays(base, n * (unit === "w" ? 7 : 1))
  const [y, mo, d] = base.split("-").map(Number)
  const months = y * 12 + (mo - 1) + n * (unit === "y" ? 12 : unit === "q" ? 3 : 1)
  const ny = Math.floor(months / 12)
  const nm = (months % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`
}
const monthEnd = (day: string, extra = 0) => {
  const [y, m] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m + extra, 0)).toISOString().slice(0, 10)
}
const FNS: Record<string, (days: string[]) => string> = {
  max: (d) => d.reduce((a, b) => (b > a ? b : a)),
  min: (d) => d.reduce((a, b) => (b < a ? b : a)),
  quarterend: (d) => monthEnd(d[0], (3 - ((Number(d[0].slice(5, 7)) - 1) % 3)) - 1),
  monthend: (d) => monthEnd(d[0]),
}
const ALIAS: Record<string, string> = { quartalsende: "quarterend", monatsende: "monthend" }

/**
 * Date arithmetic for values: "today", "today+10", "today-1y", "2026-12-31+6m", "{x}+2q" (a date placeholder is
 * filled in before) → YYYY-MM-DD. Units d (default), w, m, q (quarter), y; months clamp to the month's end (31 Jan +
 * 1m = 28/29 Feb). Functions: max(a, b, …) / min(…) (latest / earliest; values that aren't dates – an empty
 * placeholder – are skipped), quarterend(x) / monthend(x); an offset may follow: "max({membership.fee_free_until},
 * today)+6m". Anything else comes back unchanged.
 */
export function resolveDate(raw: string, today: string): string {
  const fn = /^\s*([a-zäöü]+)\s*\((.*)\)\s*(?:([+-])\s*(\d{1,4})\s*([dwmqy])?)?\s*$/i.exec(raw)
  if (fn) {
    const name = ALIAS[fn[1].toLowerCase()] ?? fn[1].toLowerCase()
    const days = args(fn[2]).map((a) => resolveDate(a, today)).filter(isDay)
    if (!FNS[name] || !days.length) return raw
    return shift(FNS[name](days), (fn[3] === "-" ? -1 : 1) * Number(fn[4] ?? 0), (fn[5] ?? "d").toLowerCase())
  }
  const m = /^\s*(today|heute|\d{4}-\d{2}-\d{2})(?:T[^\s+-]*(?:[+-]\d{2}:?\d{2})?)?\s*(?:([+-])\s*(\d{1,4})\s*([dwmqy])?)?\s*$/i.exec(raw)
  if (!m) return raw
  const base = /^\d/.test(m[1]) ? m[1] : today
  return shift(base, (m[2] === "-" ? -1 : 1) * Number(m[3] ?? 0), (m[4] ?? "d").toLowerCase())
}
