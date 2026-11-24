import { notFound } from "next/navigation"
import Link from "next/link"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Choice } from "@/components/choice"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param } from "@/lib/url"
import { DOT, STATUS_COLORS } from "@/projects/fields"
import { deleteEventType, saveEventType } from "../actions"

const SETTINGS = "/events/settings"

export default async function EventSettingsPage({ searchParams }: PageProps<"/events/settings">) {
  const ctx = await requirePerm("events.manage")
  if (!ctx.modules.has("events")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [{ data: types }, { data: used }] = await Promise.all([
    ctx.supabase.from("event_types").select("*").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("events").select("event_type_id").eq("org_id", ctx.org.id).is("deleted_at", null).not("event_type_id", "is", null).limit(5000),
  ])
  const counts = new Map<string, number>()
  for (const e of used ?? []) counts.set(e.event_type_id!, (counts.get(e.event_type_id!) ?? 0) + 1)
  const rows = types ?? []
  const edit = rows.find((x) => x.id === param(sp, "edit"))

  return (
    <Page size="list">
      <PageHeader area="events" title={t("eventTypes.title")} description={t("eventTypes.hint")} primary={{ href: `${SETTINGS}?new=type`, label: t("eventTypes.new") }} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {rows.length ? (
        <DataTable
          rows={rows}
          rowKey={(x) => x.id}
          empty={t("eventTypes.empty")}
          rowHref={(x) => `${SETTINGS}?edit=${x.id}`}
          columns={[
            {
              header: t("eventTypes.name"),
              cell: (x) => (
                <span className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full border" style={{ background: x.color ? DOT[x.color] : "transparent" }} aria-hidden />
                  <span className="font-medium">{x.name}</span>
                </span>
              ),
            },
            { header: t("eventTypes.slug"), cell: (x) => <span className="text-muted-foreground">{x.slug}</span> },
            { header: t("eventTypes.events"), cell: (x) => <span className="tabular-nums">{counts.get(x.id) ?? 0}</span> },
            { header: t("eventTypes.status"), cell: (x) => (x.active ? <Badge>{t("eventTypes.active")}</Badge> : <Badge variant="outline">{t("eventTypes.inactive")}</Badge>) },
          ]}
        />
      ) : (
        <EmptyState
          area="events"
          title={t("eventTypes.empty")}
          action={
            <Button render={<Link href={`${SETTINGS}?new=type`} />} nativeButton={false}>
              <PlusIcon /> {t("eventTypes.new")}
            </Button>
          }
        />
      )}

      {(param(sp, "new") === "type" || edit) && (
        <UrlSheet params={["new", "edit"]} title={edit ? edit.name : t("eventTypes.new")}>
          <TypeForm t={t} type={edit} />
        </UrlSheet>
      )}
    </Page>
  )
}

function TypeForm({ t, type }: { t: T; type?: Tables<"event_types"> }) {
  const id = type?.id ?? "new"
  return (
    <div className="grid gap-6">
      <form action={saveEventType} className="grid gap-4">
        {type && <input type="hidden" name="id" value={type.id} />}
        <div className="grid gap-2">
          <Label htmlFor={`et-name-${id}`}>{t("eventTypes.name")}</Label>
          <Input id={`et-name-${id}`} name="name" required maxLength={100} defaultValue={type?.name ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`et-slug-${id}`}>{t("eventTypes.slug")}</Label>
          <Input id={`et-slug-${id}`} name="slug" maxLength={80} defaultValue={type?.slug ?? ""} pattern="[a-z0-9][a-z0-9\-]{0,78}[a-z0-9]" autoComplete="off" />
          <p className="text-xs text-muted-foreground">{t("eventTypes.slugHint")}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`et-color-${id}`}>{t("eventTypes.color")}</Label>
          <Choice id={`et-color-${id}`} name="color" label={t("eventTypes.color")} defaultValue={type?.color} options={STATUS_COLORS.map((c) => ({ value: c, label: t.dynamic(`eventTypes.colors.${c}`) }))} />
        </div>
        <div className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("eventTypes.defaults")}</p>
          <p className="text-xs text-muted-foreground">{t("eventTypes.defaultsHint")}</p>
          <div className="grid gap-2">
            <Label htmlFor={`et-cap-${id}`}>{t("eventsPage.capacity")}</Label>
            <TypedInput kind="number" id={`et-cap-${id}`} name="capacity" min={1} step={1} defaultValue={type?.capacity ?? ""} />
          </div>
        </div>
        {type && (
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="active" value="off" />
            <input type="checkbox" className="size-4 accent-primary" name="active" value="on" defaultChecked={type.active} />
            {t("eventTypes.activeLabel")}
          </label>
        )}
        <SaveBar label={type ? undefined : t("eventTypes.new")} always={!type} />
      </form>
      {type && (
        <form action={deleteEventType} className="border-t pt-4">
          <input type="hidden" name="id" value={type.id} />
          <SubmitButton size="sm" variant="ghost" className="text-destructive" data-confirm="eventTypes.confirmDelete">
            <Trash2Icon /> {t("eventTypes.delete")}
          </SubmitButton>
        </form>
      )}
    </div>
  )
}

export const instant = false
