import { Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import type { SelfShift } from "@/shifts/server"

// A team member's own shifts and the open ones to apply for (Schichten › Meine). `action` handles apply / withdraw;
// clocking in and out of the current shift is the page's Jetzt card.
export async function ShiftSelfView({ data, action, hidden = {} }: { data: { own: SelfShift[]; openShifts: SelfShift[] }; action: (fd: FormData) => Promise<void>; hidden?: Record<string, string> }) {
  const t = await getT()
  const what = (s: SelfShift) => [s.position ?? s.title, s.event, s.location].filter(Boolean).join(" · ")
  const button = (s: SelfShift, act: string, label: string) => (
    <form action={action}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="shift" value={s.id} />
      <input type="hidden" name="action" value={act} />
      <SubmitButton size="sm" variant="outline" className="max-md:h-10">
        {label}
      </SubmitButton>
    </form>
  )
  // One row: a day chip (weekday + day), what and when, then a badge or the row's action.
  const row = (s: SelfShift, end: React.ReactNode) => (
    <li key={s.id} className="flex min-h-14 items-center gap-3 px-3 py-2 text-sm">
      <span className="grid w-11 shrink-0 justify-items-center rounded-md bg-muted py-1 leading-tight" aria-hidden>
        <span className="text-[0.7rem] text-muted-foreground uppercase">{t.date(s.starts_at, { weekday: "short" })}</span>
        <span className="text-base font-medium tabular-nums">{t.date(s.starts_at, { day: "numeric" })}</span>
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{what(s)}</span>
        <span className="truncate text-muted-foreground">
          {t.date(s.starts_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}–{t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}
          {s.free != null && ` · ${t("shifts.free", { count: s.free })}`}
        </span>
      </span>
      {end}
    </li>
  )

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Section id="mine" title={t("shifts.myShifts")}>
        {data.own.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("shifts.noOwn")}</p>
        ) : (
          <ul className="grid divide-y rounded-lg border">
            {data.own.map((s) =>
              row(
                s,
                s.status === "applied" ? (
                  <span className="flex items-center gap-2">
                    <Badge variant="warning">{t("shifts.applied")}</Badge>
                    {button(s, "withdraw", t("shifts.withdraw"))}
                  </span>
                ) : s.checked_out_at ? (
                  <Badge variant="success">{t("shifts.finished")}</Badge>
                ) : s.checked_in_at ? (
                  <Badge variant="info">{t("time.running")}</Badge>
                ) : (
                  <Badge variant="info">{t("shifts.confirmed")}</Badge>
                ),
              ),
            )}
          </ul>
        )}
      </Section>
      <Section id="open" title={t("shifts.openShifts")} className="md:border-t-0 md:pt-0">
        {data.openShifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("shifts.noOpen")}</p>
        ) : (
          <ul className="grid divide-y rounded-lg border">{data.openShifts.map((s) => row(s, button(s, "apply", t("shifts.apply"))))}</ul>
        )}
      </Section>
    </div>
  )
}
