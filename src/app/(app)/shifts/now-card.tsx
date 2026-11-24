import { RecordPicker } from "@/components/record-picker"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import type { SelfShift } from "@/shifts/server"
import { selfAction } from "./actions"
import { clock, searchProjects } from "./time-actions"

export type Running = { started_at: string; shift_id: string | null; projects: { name: string } | null } | null

/**
 * "Jetzt": a team member's one main thing at this moment — clock out of what runs, clock into the shift that starts
 * now (± 2 h), or clock in without a shift (optionally on a project). Schichten › Meine and Start show it; `returnTo`
 * is where the buttons land again.
 */
export async function NowCard({ own, running, returnTo, withProjects }: { own: SelfShift[]; running: Running; returnTo: string; withProjects: boolean }) {
  const t = await getT()
  const now = new Date().getTime()
  const inWindow = (s: SelfShift) => now >= new Date(s.starts_at).getTime() - 2 * 3600_000 && now <= new Date(s.ends_at).getTime() + 2 * 3600_000
  const runningShift = running?.shift_id ? own.find((s) => s.id === running.shift_id) : null
  const current = !running ? own.find((s) => s.status === "assigned" && !s.checked_in_at && inWindow(s)) : null
  const next = own.find((s) => s.status === "assigned" && new Date(s.starts_at).getTime() > now)
  const label = (s: SelfShift) => [s.position ?? s.title, s.event].filter(Boolean).join(" · ")
  const span = (s: SelfShift) => `${t.date(s.starts_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`
  const clockTime = (v: string) => t.date(v, { hour: "2-digit", minute: "2-digit" })
  const big = "h-12 w-full text-base md:w-auto md:min-w-48"
  const back = <input type="hidden" name="return" value={returnTo} />

  return (
    <section aria-labelledby="now" className="grid gap-3 rounded-xl border bg-card p-4">
      {running ? (
        <>
          <div className="grid gap-0.5">
            <p className="text-sm text-muted-foreground">{t("time.since", { time: clockTime(running.started_at) })}</p>
            <h2 id="now" className="text-lg font-medium">
              {runningShift ? label(runningShift) : (running.projects?.name ?? t("shifts.withoutShift"))}
            </h2>
          </div>
          <form action={runningShift ? selfAction : clock}>
            {back}
            {runningShift && (
              <>
                <input type="hidden" name="shift" value={runningShift.id} />
                <input type="hidden" name="action" value="check_out" />
              </>
            )}
            <SubmitButton className={big}>{t("time.clockOut")}</SubmitButton>
          </form>
        </>
      ) : current ? (
        <>
          <div className="grid gap-0.5">
            <p className="text-sm text-muted-foreground">{span(current)}</p>
            <h2 id="now" className="text-lg font-medium">
              {label(current)}
            </h2>
            {current.location && <p className="text-sm text-muted-foreground">{current.location}</p>}
          </div>
          <form action={selfAction}>
            {back}
            <input type="hidden" name="shift" value={current.id} />
            <input type="hidden" name="action" value="check_in" />
            <SubmitButton className={big}>{t("shifts.checkIn")}</SubmitButton>
          </form>
        </>
      ) : (
        <>
          <div className="grid gap-0.5">
            <p className="text-sm text-muted-foreground">{next ? t("shifts.nextShift", { when: span(next) }) : t("shifts.noShiftNow")}</p>
            <h2 id="now" className="text-lg font-medium">
              {next ? label(next) : t("shifts.withoutShift")}
            </h2>
          </div>
          <form action={clock} className="grid gap-3">
            {back}
            {withProjects && <RecordPicker name="project_id" label={t("time.projectOptional")} search={searchProjects} placeholder={t("time.noProject")} />}
            <SubmitButton className={big}>{t("shifts.clockInFree")}</SubmitButton>
          </form>
        </>
      )}
    </section>
  )
}
