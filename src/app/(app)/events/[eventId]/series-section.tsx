import Link from "next/link"
import { DateInput } from "@/components/date-input"
import { Choice } from "@/components/choice"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { AddLink, Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import { param, type SearchParams } from "@/lib/url"
import { cancelEventsAction, repeatEventAction, retimeEventAction } from "../actions"
import { EVERY, MAX_DATES, nextStarts } from "../series"

type Ev = { id: string; series_id: string | null; starts_at: string; ends_at: string | null; status: string }
type Ctx = Awaited<ReturnType<typeof getContext>>

// Series: the dates created together (links), "Weitere Termine", and a new time / cancelling for this date or all
// following ones. Plus the sheets: ?new=repeat (duplicate / repeat, also from ⋯), ?edit=time, ?edit=cancel.
export async function SeriesSection({ ctx, t, ev, sp, canManage }: { ctx: Ctx; t: T; ev: Ev; sp: SearchParams; canManage: boolean }) {
  const { data: dates } = ev.series_id
    ? await ctx.supabase.from("events").select("id, starts_at, status").eq("org_id", ctx.org.id).eq("series_id", ev.series_id).is("deleted_at", null).order("starts_at")
    : { data: null }
  const last = dates?.at(-1)?.starts_at ?? ev.starts_at
  const sheet = canManage ? (param(sp, "new") === "repeat" ? "repeat" : param(sp, "edit") === "time" ? "time" : param(sp, "edit") === "cancel" ? "cancel" : null) : null
  const base = `/events/${ev.id}`
  const local = toLocalInput(ev.starts_at)
  const scope = dates && dates.length > 1 && (
    <div className="grid gap-2">
      <Label htmlFor="sr-scope">{t("eventsPage.series.scope")}</Label>
      <Choice id="sr-scope" name="scope" label={t("eventsPage.series.scope")} required defaultValue="one" options={[{ value: "one", label: t("eventsPage.series.thisOne") }, { value: "following", label: t("eventsPage.series.following") }]} />
    </div>
  )
  return (
    <>
      {dates && (
        <Section id="series" title={t("eventsPage.series.title", { count: dates.length })}>
          <ul className="-mx-2 grid gap-0.5 text-sm">
            {dates.map((d) => (
              <li key={d.id}>
                <Link href={`/events/${d.id}`} aria-current={d.id === ev.id ? "page" : undefined} className="flex min-h-9 items-center gap-2 rounded-lg px-2 hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium">
                  <span className="flex-1 tabular-nums">{t.date(d.starts_at, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  {d.status !== "published" && <span className="text-xs text-muted-foreground">{t.dynamic(`eventsPage.statuses.${d.status}`)}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {canManage && (
            <div className="grid gap-1">
              <AddLink href={`${base}?new=repeat`}>{t("eventsPage.series.more")}</AddLink>
              <div className="flex flex-wrap gap-x-4 text-sm">
                <Link href={`${base}?edit=time`} className="text-[var(--link)] hover:underline">{t("eventsPage.series.changeTime")}</Link>
                <Link href={`${base}?edit=cancel`} className="text-destructive hover:underline">{t("eventsPage.series.cancel")}</Link>
              </div>
            </div>
          )}
        </Section>
      )}

      {sheet === "repeat" && (
        <UrlSheet params={["new"]} title={t("eventsPage.series.repeat")}>
          <Notice error={param(sp, "error")} />
          <form action={repeatEventAction} className="grid gap-4">
            <input type="hidden" name="id" value={ev.id} />
            <p className="text-sm text-muted-foreground">{t("eventsPage.series.repeatHint")}</p>
            <div className="grid gap-2">
              <Label htmlFor="sr-first">{t("eventsPage.series.first")}</Label>
              <DateInput id="sr-first" name="first" type="datetime-local" required defaultValue={nextStarts(toLocalInput(last), "week", 1)[0]} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sr-every">{t("eventsPage.series.every")}</Label>
              <Choice id="sr-every" name="every" label={t("eventsPage.series.every")} dropdown emptyLabel={t("eventsPage.series.once")} defaultValue={ev.series_id ? "week" : null} options={EVERY.map((e) => ({ value: e, label: t.dynamic(`eventsPage.series.everyOptions.${e}`) }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sr-count">{t("eventsPage.series.count")}</Label>
              <TypedInput kind="number" id="sr-count" name="count" min={1} max={MAX_DATES} defaultValue={4} />
              <p className="text-xs text-muted-foreground">{t("eventsPage.series.countHint")}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" name="publish" value="on" defaultChecked={ev.status === "published"} />
              {t("eventsPage.series.publish")}
            </label>
            <SaveBar label={t("eventsPage.series.create")} always />
          </form>
        </UrlSheet>
      )}

      {sheet === "time" && (
        <UrlSheet params={["edit"]} title={t("eventsPage.series.changeTime")}>
          <Notice error={param(sp, "error")} />
          <form action={retimeEventAction} className="grid gap-4">
            <input type="hidden" name="id" value={ev.id} />
            {scope}
            <div className="flex flex-wrap gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sr-start">{t("eventsPage.series.startTime")}</Label>
                <Input id="sr-start" name="start" required pattern="([01]\d|2[0-3]):[0-5]\d" inputMode="numeric" placeholder="20:00" defaultValue={local.slice(11)} className="w-24" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sr-end">{t("eventsPage.series.endTime")}</Label>
                <Input id="sr-end" name="end" pattern="([01]\d|2[0-3]):[0-5]\d" inputMode="numeric" placeholder="04:00" defaultValue={ev.ends_at ? toLocalInput(ev.ends_at).slice(11) : ""} className="w-24" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("eventsPage.series.timeHint")}</p>
            <SaveBar label={t("common.save")} always />
          </form>
        </UrlSheet>
      )}

      {sheet === "cancel" && (
        <UrlSheet params={["edit"]} title={t("eventsPage.series.cancel")}>
          <Notice error={param(sp, "error")} />
          <form action={cancelEventsAction} className="grid gap-4">
            <input type="hidden" name="id" value={ev.id} />
            {scope}
            <p className="text-sm text-muted-foreground">{t("eventsPage.series.cancelHint")}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <SubmitButton variant="destructive" data-confirm="eventsPage.series.confirmCancel">{t("eventsPage.series.cancel")}</SubmitButton>
            </div>
          </form>
        </UrlSheet>
      )}
    </>
  )
}
