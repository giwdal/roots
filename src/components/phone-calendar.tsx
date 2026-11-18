"use client"

import { useMemo, useRef, useState } from "react"
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMilliseconds, type Locale } from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

export type PhoneEntry = { id: string; title: string; start: Date; end: Date; allDay?: boolean; color?: string; href?: string }

const key = (d: Date) => format(d, "yyyy-MM-dd")

/**
 * The calendar on phones, like iOS / Google Calendar: a week strip (Mo–So, dots on days with entries, swipe or the
 * arrows for the next week, today ringed, the selected day filled) or a compact month grid with dots, and below it
 * the selected day's entries (tap = the record). "+" creates on the selected day (`onCreate`).
 */
export function PhoneCalendar({
  entries,
  date,
  month,
  canMonth,
  locale,
  onDate,
  onMonth,
  onOpen,
  onCreate,
}: {
  entries: PhoneEntry[]
  date: Date
  month: boolean
  canMonth: boolean
  locale: Locale
  onDate: (d: Date) => void
  onMonth: (month: boolean) => void
  onOpen: (href: string) => void
  onCreate?: (d: Date) => void
}) {
  const t = useT()
  // The tapped day shows at once; the URL (and the server's data range) follows.
  const [sel, setSel] = useState(date)
  const [seen, setSeen] = useState(date)
  if (seen !== date) {
    setSeen(date)
    setSel(date)
  }
  const pick = (d: Date) => {
    setSel(d)
    onDate(d)
  }
  const today = key(new Date())

  // Day → entries covering it (multi-day entries on every day they span).
  const byDay = useMemo(() => {
    const m = new Map<string, PhoneEntry[]>()
    for (const e of entries) {
      const last = e.allDay || e.end <= e.start ? e.end : subMilliseconds(e.end, 1)
      let d = new Date(e.start)
      for (let i = 0; i < 400 && key(d) <= key(last); i++, d = addDays(d, 1)) {
        const k = key(d)
        m.set(k, [...(m.get(k) ?? []), e])
      }
    }
    return m
  }, [entries])

  const dots = (d: Date) => {
    const list = byDay.get(key(d)) ?? []
    const colors = [...new Set(list.map((e) => e.color ?? "var(--primary)"))].slice(0, 3)
    return (
      <span className="flex h-1.5 gap-0.5" aria-hidden>
        {colors.map((c) => (
          <span key={c} className="size-1.5 rounded-full" style={{ background: c }} />
        ))}
      </span>
    )
  }
  const dayButton = (d: Date, opts: { dim?: boolean; weekday?: boolean } = {}) => {
    const k = key(d)
    const selected = k === key(sel)
    const count = byDay.get(k)?.length ?? 0
    return (
      <button
        key={k}
        type="button"
        onClick={() => pick(d)}
        aria-pressed={selected}
        aria-label={`${format(d, "EEEE, d. MMMM", { locale })}${count ? ` · ${t("calendar.entries", { count })}` : ""}`}
        className={cn("grid touch-manipulation justify-items-center gap-1 rounded-xl py-1.5 active:bg-muted", opts.dim && "text-muted-foreground/60")}
      >
        {opts.weekday && <span className="text-xs text-muted-foreground">{format(d, "EEEEEE", { locale })}</span>}
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full text-base tabular-nums",
            k === today && !selected && "font-semibold text-primary ring-1 ring-primary",
            selected && "bg-foreground font-semibold text-background",
          )}
        >
          {format(d, "d")}
        </span>
        {dots(d)}
      </button>
    )
  }

  const weekStart = startOfWeek(sel, { weekStartsOn: 1 })
  const step = (n: number) => pick(month ? addMonths(sel, n) : addDays(sel, 7 * n))
  const touch = useRef<number | null>(null)
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      const dx = touch.current === null ? 0 : e.changedTouches[0].clientX - touch.current
      touch.current = null
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1)
    },
  }
  const list = [...(byDay.get(key(sel)) ?? [])].sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.getTime() - b.start.getTime())
  const time = (e: PhoneEntry) => {
    if (e.allDay) return t("calendar.allDay")
    const last = subMilliseconds(e.end, 1)
    if (key(e.start) === key(last) || e.end <= e.start) return e.end > e.start ? `${format(e.start, "HH:mm")}–${format(e.end, "HH:mm")}` : format(e.start, "HH:mm")
    return `${format(e.start, "d.M. HH:mm")} – ${format(e.end, "d.M. HH:mm")}`
  }

  return (
    <div className="grid min-w-0 gap-3">
      {/* Two rows so it fits 320 px: month + arrows, then Heute and the Woche · Monat switch. */}
      <div className="flex items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{format(sel, "MMMM yyyy", { locale })}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t(month ? "calendar.prevMonth" : "calendar.prevWeek")} onClick={() => step(-1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t(month ? "calendar.nextMonth" : "calendar.nextWeek")} onClick={() => step(1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => pick(new Date())}>
          {t("calendar.today")}
        </Button>
        {canMonth && (
          <div role="group" aria-label={t("calendar.viewLabel")} className="ml-auto flex rounded-lg bg-muted p-0.5">
            {[false, true].map((m) => (
              <button key={String(m)} type="button" aria-pressed={month === m} onClick={() => onMonth(m)} className="h-[calc(var(--control-sm)-0.25rem)] rounded-md px-3 text-sm text-muted-foreground aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-sm">
                {t(m ? "calendar.month" : "calendar.week")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div {...swipe} className="touch-pan-y">
        {month ? (
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="text-center text-xs text-muted-foreground">
                {format(addDays(weekStart, i), "EEEEEE", { locale })}
              </span>
            ))}
            {(() => {
              const first = startOfWeek(startOfMonth(sel), { weekStartsOn: 1 })
              const last = endOfWeek(endOfMonth(sel), { weekStartsOn: 1 })
              const days: Date[] = []
              for (let d = first; d <= last; d = addDays(d, 1)) days.push(d)
              return days.map((d) => dayButton(d, { dim: !isSameMonth(d, sel) }))
            })()}
          </div>
        ) : (
          <div className="grid grid-cols-7">{Array.from({ length: 7 }, (_, i) => dayButton(addDays(weekStart, i), { weekday: true }))}</div>
        )}
      </div>

      <section aria-labelledby="pc-day" className="grid gap-2 border-t pt-3">
        <div className="flex min-h-(--control-sm) items-center justify-between gap-2">
          <h3 id="pc-day" className="text-sm font-medium">
            {format(sel, "EEEE, d. MMMM", { locale })}
          </h3>
          {onCreate && (
            <Button variant="ghost" size="sm" onClick={() => onCreate(sel)} className="text-[var(--link)]">
              <PlusIcon /> {t("calendar.new")}
            </Button>
          )}
        </div>
        {list.length ? (
          <ul className="grid divide-y rounded-xl border">
            {list.map((e) => {
              const body = (
                <>
                  <span className="w-1 self-stretch rounded-full" style={{ background: e.color ?? "var(--primary)" }} aria-hidden />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{e.title}</span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">{time(e)}</span>
                  </span>
                  {e.href && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                </>
              )
              return (
                <li key={e.id}>
                  {e.href ? (
                    <button type="button" onClick={() => onOpen(e.href!)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm active:bg-muted">
                      {body}
                    </button>
                  ) : (
                    <div className="flex min-h-14 items-center gap-3 px-3 py-2 text-sm">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t("calendar.noEntries")}</p>
        )}
      </section>
    </div>
  )
}
