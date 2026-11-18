import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"
import { isPaused } from "@/members/dues"

type Period = { starts_on: string; ends_on: string | null; paused_from: string | null; paused_until: string | null }
type Due = { status: string; due_on: string; failed_at?: string | null }

/** Where a membership stands on the Berlin day `now` (YYYY-MM-DD): ended, paused, ending, upcoming or active. */
export function memberState(m: Period, now: string) {
  if (m.ends_on && m.ends_on < now) return "ended" as const
  if (isPaused(m, now)) return "paused" as const
  if (m.ends_on) return "ending" as const
  if (m.starts_on > now) return "upcoming" as const
  return "active" as const
}

// Status colours (docs/design/patterns.md §3): active = success, paused = warning, ending/upcoming = info, ended = secondary.
export function MemberStateBadge({ t, m, now }: { t: T; m: Period; now: string }) {
  const state = memberState(m, now)
  if (state === "ended") return <Badge variant="secondary">{t("membership.state.ended")}</Badge>
  if (state === "paused") return <Badge variant="warning">{m.paused_until ? t("membership.state.pausedUntil", { date: t.date(m.paused_until) }) : t("membership.state.paused")}</Badge>
  if (state === "ending") return <Badge variant="info">{t("membership.state.ending", { date: t.date(m.ends_on!) })}</Badge>
  if (state === "upcoming") return <Badge variant="info">{t("membership.state.upcoming", { date: t.date(m.starts_on) })}</Badge>
  return <Badge variant="success">{t("membership.state.active")}</Badge>
}

/** A due that is still owed and past its date. */
export const isOverdueDue = (d: Due, now: string) => d.status === "open" && d.due_on < now

// Paid = success, open = warning, overdue or came back (Rücklastschrift) = destructive, cancelled = secondary.
export function DueBadge({ t, d, now }: { t: T; d: Due; now: string }) {
  if (d.status === "open" && d.failed_at) return <Badge variant="destructive">{t("membership.returned", { date: t.date(d.failed_at, { dateStyle: "short" }) })}</Badge>
  if (isOverdueDue(d, now)) return <Badge variant="destructive">{t("membership.overdue")}</Badge>
  if (d.status === "open") return <Badge variant="warning">{t("membership.dueStatus.open")}</Badge>
  if (d.status === "paid") return <Badge variant="success">{t("membership.dueStatus.paid")}</Badge>
  return <Badge variant="secondary">{t.dynamic(`membership.dueStatus.${d.status}`)}</Badge>
}
