import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ChevronRightIcon, MapPinIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { DateInput } from "@/components/date-input"
import { MultiSelect } from "@/components/multi-select"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { AddLink, RowGroup } from "@/components/section"
import { TimeInput } from "@/components/time-input"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { deleteSeries, savePositions, saveSeries } from "../actions"
import { PositionRows } from "./position-rows"

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
const ROW = "flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-muted active:bg-muted"

// Schichten › Einstellungen (the gear): the team (its own page), positions (inline rows, one SaveBar), recurring
// shifts (rows → sheet ?edit=<id> / ?new=series) and the org's places (Einstellungen › Orte).
export default async function ShiftSettings({ searchParams }: PageProps<"/shifts/settings">) {
  const ctx = await requirePerm("shifts.manage")
  if (!ctx.modules.has("shifts")) notFound()
  const sp = await searchParams
  const old = param(sp, "series") // the series sheet's old param
  if (old) redirect(`/shifts/settings${withParams(sp, { series: undefined, edit: old })}`)
  const t = await getT()
  const editId = param(sp, "edit")
  const [{ data: positions }, { data: series }, { data: locations }, { data: staff }, { count: upcoming }] = await Promise.all([
    ctx.supabase.from("positions").select("id, name, needed, location_id").eq("org_id", ctx.org.id).order("position").order("name"),
    ctx.supabase.from("shift_series").select("*, positions(name), locations(name)").eq("org_id", ctx.org.id).order("created_at"),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("staff").select("id, name, active").eq("org_id", ctx.org.id).order("name"),
    editId && /^[0-9a-f-]{36}$/.test(editId)
      ? ctx.supabase.from("shifts").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("series_id", editId).gt("starts_at", new Date().toISOString())
      : Promise.resolve({ count: 0 }),
  ])
  const editing = series?.find((s) => s.id === editId)
  const creating = param(sp, "new") === "series"
  // 2026-10-05 is a Monday: weekday names in the user's language.
  const wd = (d: number) => t.date(`2026-10-${String(4 + d).padStart(2, "0")}T12:00:00Z`, { weekday: "short" })
  const staffName = new Map(staff?.map((s) => [s.id, s.name]))
  const active = (staff ?? []).filter((s) => s.active)
  const rhythm = (s: NonNullable<typeof series>[number]) =>
    `${s.weekdays.map(wd).join(", ")} · ${s.every_weeks > 1 ? t("shifts.everyN", { count: s.every_weeks }) : t("shifts.weekly")} · ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/shifts", label: t("shifts.nav") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <RowGroup id="team" title={t("shifts.tabs.team")} description={t("shifts.teamHint")}>
        <Link href="/shifts/team" className={ROW}>
          <UsersIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1 font-medium">{t("shifts.tabs.team")}</span>
          <span className="text-muted-foreground">{t("shifts.teamCount", { count: active.length })}</span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </RowGroup>

      <section id="positions" className="grid scroll-mt-20 gap-2">
        <div className="grid gap-0.5 px-1">
          <h3 className="text-sm font-medium">{t("shifts.positionsTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("shifts.positionsHint")}</p>
        </div>
        <form action={savePositions}>
          <PositionRows initial={positions ?? []} locations={locations ?? []} />
          <SaveBar />
        </form>
      </section>

      <RowGroup id="series" title={t("shifts.seriesTitle")} description={t("shifts.seriesHint")}>
        {(series ?? []).map((s) => (
          <Link key={s.id} href={withParams(sp, { edit: s.id, new: undefined })} scroll={false} className={ROW}>
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{s.positions?.name ?? s.name}</span>
              <span className="truncate text-xs text-muted-foreground">{[rhythm(s), s.locations?.name, s.default_staff.map((id) => staffName.get(id)).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
        {!series?.length && <p className="px-4 py-3 text-sm text-muted-foreground">{t("shifts.noSeries")}</p>}
      </RowGroup>
      <AddLink href={withParams(sp, { new: "series", edit: undefined })}>{t("shifts.newSeries")}</AddLink>

      <RowGroup id="locations" title={t("shifts.locationsTitle")} description={t("shifts.locationsHint")}>
        <Link href="/settings/locations" className={ROW}>
          <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1 font-medium">{t("shifts.locationsLink")}</span>
          <span className="text-muted-foreground">{locations?.length ?? 0}</span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </RowGroup>

      {(creating || editing) && (
        <UrlSheet
          params={["new", "edit"]}
          title={editing ? (editing.positions?.name ?? editing.name ?? "") : t("shifts.newSeries")}
          meta={editing && rhythm(editing)}
          menu={
            editing && (
              <ActionsMenu>
                <MenuSubmit form="delete-series" icon={<Trash2Icon />} destructive confirm="shifts.confirmDeleteSeries" count={upcoming ?? 0}>
                  {t("shifts.deleteSeries")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} />
          <form action={saveSeries} className="grid gap-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            {(positions?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="se-pos">{t("shifts.position")}</Label>
                <Choice id="se-pos" name="position" label={t("shifts.position")} defaultValue={editing?.position_id} options={(positions ?? []).map((p) => ({ value: p.id, label: p.name }))} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="se-name">{t("shifts.titleLabel")}</Label>
              <Input id="se-name" name="name" defaultValue={editing?.name ?? ""} maxLength={100} placeholder={t("shifts.seriesNamePlaceholder")} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("shifts.weekdays")}</legend>
              {/* Seven toggles in one row: a tap ticks a day. */}
              <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
                {WEEKDAYS.map((d) => (
                  <label key={d} className="inline-flex min-h-8 min-w-10 cursor-pointer touch-manipulation items-center justify-center rounded-md px-2 text-sm text-muted-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring">
                    <input type="checkbox" name="weekdays" value={d} defaultChecked={editing?.weekdays.includes(d)} className="sr-only" />
                    {wd(d)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="se-every">{t("shifts.every")}</Label>
              <Choice id="se-every" name="every_weeks" label={t("shifts.every")} required defaultValue={String(editing?.every_weeks ?? 1)} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? t("shifts.weekly") : t("shifts.everyN", { count: n }) }))} />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t("shifts.timeOfDay")}</span>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TimeInput id="se-st" name="start_time" required aria-label={t("shifts.from")} defaultValue={editing?.start_time ?? "18:00"} />
                <span className="text-muted-foreground">–</span>
                <TimeInput id="se-et" name="end_time" required aria-label={t("shifts.untilShort")} defaultValue={editing?.end_time ?? "23:00"} />
              </div>
              <p className="text-xs text-muted-foreground">{t("shifts.overnightHint")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="se-sd">{t("shifts.startDate")}</Label>
                <DateInput id="se-sd" name="start_date" type="date" required defaultValue={editing?.start_date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="se-ed">{t("shifts.endDate")}</Label>
                <DateInput id="se-ed" name="end_date" type="date" defaultValue={editing?.end_date ?? ""} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="se-needed">{t("shifts.needed")}</Label>
              <TypedInput kind="number" id="se-needed" name="needed" min={1} max={100} step={1} defaultValue={editing?.needed ?? 1} />
            </div>
            {(locations?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="se-loc">{t("shifts.location")}</Label>
                <Choice id="se-loc" name="location" label={t("shifts.location")} defaultValue={editing?.location_id} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />
              </div>
            )}
            {active.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="se-staff">{t("shifts.fixedPeople")}</Label>
                <MultiSelect id="se-staff" name="default_staff" options={active.map((s) => ({ value: s.id, label: s.name }))} defaultValue={editing?.default_staff ?? []} placeholder={t("shifts.searchPerson")} />
                <p className="text-xs text-muted-foreground">{t("shifts.fixedHint")}</p>
              </div>
            )}
            <SaveBar label={editing ? undefined : t("shifts.createSeries")} always={!editing} confirm={editing ? "shifts.confirmSeriesSave" : undefined} />
          </form>
          {editing && (
            <form id="delete-series" action={deleteSeries} hidden>
              <input type="hidden" name="id" value={editing.id} />
            </form>
          )}
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
