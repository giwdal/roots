import Link from "next/link"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { DataTable, ListToolbar } from "@/components/data-table"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmailBodyField } from "@/components/email-body-field"
import { AUTOMATION_EVENTS } from "@/email/events"
import { BASE_PLACEHOLDERS, type Format } from "@/email/render"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param } from "@/lib/url"
import { deleteAutomation, saveAutomation } from "../actions"
import { EmailViews } from "../views"

// Automations: event + delay → email to the person it's about. Several on the same event with different delays
// make a sequence ("welcome now, info after 7 days, survey after 30").
export default async function AutomationsPage({ searchParams }: PageProps<"/email/automations">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("email.manage")
  const events = AUTOMATION_EVENTS.filter((e) => ctx.modules.has(e.module))
  const { data } = await ctx.supabase.from("email_automations").select("*").eq("org_id", ctx.org.id).order("event_type").order("delay_minutes")

  const editId = param(sp, "edit")
  const editing = (data ?? []).find((a) => a.id === editId)
  const creating = canManage && param(sp, "new") === "1"
  const delayText = (m: number) => (m === 0 ? t("email.immediately") : m % 1440 === 0 ? `${m / 1440} ${t("email.units.days")}` : m % 60 === 0 ? `${m / 60} ${t("email.units.hours")}` : `${m} ${t("email.units.minutes")}`)
  return (
    <>
      <PageHeader
        area="communication"
        title={t("email.tabs.automations")}
        settings={{ href: "/email/settings", label: t("email.settings.title") }}
        primary={canManage ? { href: "/email/automations?new=1", label: t("email.newAutomation") } : undefined}
      />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <ListToolbar>
        <EmailViews t={t} current="automations" />
      </ListToolbar>
      <DataTable
        rows={data ?? []}
        rowKey={(a) => a.id}
        rowHref={(a) => `/email/automations?edit=${a.id}`}
        empty={
          <EmptyState
            area="communication"
            title={t("email.noAutomations")}
            text={t("email.automationsHint")}
            action={
              canManage && (
                <Button render={<Link href="/email/automations?new=1" scroll={false} />} nativeButton={false} size="sm">
                  <PlusIcon /> {t("email.newAutomation")}
                </Button>
              )
            }
          />
        }
        columns={[
          {
            header: t("email.name"),
            cell: (a) => (
              <span className="grid">
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.subject}</span>
              </span>
            ),
          },
          { header: t("email.trigger"), cell: (a) => t.dynamic(`events.types.${a.event_type}`) },
          { header: t("email.delay"), cell: (a) => delayText(a.delay_minutes), className: "whitespace-nowrap" },
          { header: t("email.status"), cell: (a) => <Badge variant={a.active ? "success" : "secondary"}>{a.active ? t("email.active") : t("email.paused")}</Badge> },
        ]}
      />
      {(editing || creating) && (
        <UrlSheet
          params={["edit", "new"]}
          title={editing?.name ?? t("email.newAutomation")}
          wide
          menu={
            editing && canManage ? (
              <ActionsMenu>
                <MenuSubmit form="automation-delete" icon={<Trash2Icon />} destructive confirm="email.confirmDeleteAutomation">
                  {t("email.delete")}
                </MenuSubmit>
              </ActionsMenu>
            ) : undefined
          }
        >
          <Notice error={param(sp, "error")} />
          <AutomationForm t={t} a={editing} events={events} disabled={!canManage} />
          {editing && canManage && (
            <form id="automation-delete" action={deleteAutomation} hidden>
              <input type="hidden" name="id" value={editing.id} />
            </form>
          )}
        </UrlSheet>
      )}
    </>
  )
}

function AutomationForm({ t, a, events, disabled }: { t: T; a?: Tables<"email_automations">; events: typeof AUTOMATION_EVENTS; disabled?: boolean }) {
  const key = a?.id ?? "new"
  const d = a?.delay_minutes ?? 0
  const [delay, unit] = d % 1440 === 0 ? [d / 1440, "days"] : d % 60 === 0 ? [d / 60, "hours"] : [d, "minutes"]
  const ev = events.find((e) => e.type === a?.event_type)
  return (
    <div className="grid gap-6">
      <form action={saveAutomation} className="grid gap-4">
        {a && <input type="hidden" name="id" value={a.id} />}
        <fieldset disabled={disabled} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`a-name-${key}`} name="name" label={t("email.name")} required maxLength={200} defaultValue={a?.name ?? ""} placeholder={t("email.automationPlaceholder")} />
            <div className="grid gap-2">
              <Label htmlFor={`a-ev-${key}`}>{t("email.trigger")}</Label>
              <Choice id={`a-ev-${key}`} name="event_type" label={t("email.trigger")} required defaultValue={a?.event_type ?? events[0]?.type} options={events.map((e) => ({ value: e.type, label: t.dynamic(`events.types.${e.type}`) }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`a-delay-${key}`}>{t("email.delay")}</Label>
              <TypedInput kind="number" id={`a-delay-${key}`} name="delay" min={0} step={1} defaultValue={delay} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`a-unit-${key}`}>{t("email.unit")}</Label>
              <Choice id={`a-unit-${key}`} name="unit" label={t("email.unit")} required defaultValue={unit} options={(["minutes", "hours", "days"] as const).map((u) => ({ value: u, label: t(`email.units.${u}`) }))} />
            </div>
          </div>
          <Field id={`a-subject-${key}`} name="subject" label={t("email.subject")} required maxLength={300} defaultValue={a?.subject ?? ""} />
          <EmailBodyField
            id={`a-body-${key}`}
            format={(a?.format ?? "rich") as Format}
            body={a?.body ?? ""}
            placeholders={[...BASE_PLACEHOLDERS, ...(ev?.vars ?? [])]}
            disabled={disabled}
          />
        </fieldset>
        {!disabled && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={a?.active ?? true} className="size-4 accent-primary" /> {t("email.active")}
            </label>
            <SaveBar label={a ? undefined : t("email.createAutomation")} always={!a} />
          </>
        )}
      </form>
    </div>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

export const instant = false
