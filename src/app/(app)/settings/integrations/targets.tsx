import Link from "next/link"
import { SaveBar } from "@/components/save-bar"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { Section } from "@/components/section"
import { SendIcon, Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { eventTypes } from "@/events/registry"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { deleteSubscription, sendTest, telegramChats, updateSubscription } from "./targets-actions"
import { CreateForm, RotateSecret } from "./targets-forms"

type Sub = {
  id: string
  name: string
  channel: string
  event_types: string[]
  config: unknown
  active: boolean
}

// Notification targets (webhooks, Telegram chats) – shown as a section on Settings → Integrations.
export async function NotificationsSection({ sp }: { sp: SearchParams }) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const { data: subs } = await ctx.supabase
    .from("event_subscriptions")
    .select("id, name, channel, event_types, config, active")
    .eq("org_id", ctx.org.id)
    .order("created_at")
  const editing = subs?.find((s) => s.id === param(sp, "edit"))
  const creating = param(sp, "new")
  const available = eventTypes.filter((e) => e.module === "org" || ctx.modules.has(e.module))
  const chats = await telegramChats(ctx.org.id)
  const { data: botRow } = await ctx.supabase
    .from("org_integrations")
    .select("status")
    .eq("org_id", ctx.org.id)
    .eq("provider", "telegram")
    .maybeSingle()
  const botConnected = botRow?.status === "connected"

  return (
    <Section id="notifications" title={t("notifications.targets")} description={t("notifications.intro")}>
      <div className="flex flex-wrap gap-2">
        <Button render={<Link href={withParams(sp, { new: "webhook", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
          {t("notifications.newWebhook")}
        </Button>
        <Button
          render={<Link href={withParams(sp, { new: "telegram", edit: undefined })} scroll={false} />}
          nativeButton={false}
          size="sm"
          variant="outline"
        >
          {t("notifications.newTelegram")}
        </Button>
      </div>
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={!editing ? param(sp, "ok") : undefined} />
      <DataTable
        rows={subs ?? []}
        rowKey={(s) => s.id}
        rowHref={(s) => withParams(sp, { edit: s.id, new: undefined })}
        empty={t("notifications.empty")}
        columns={[
          {
            header: t("notifications.name"),
            cell: (s) => <span className="font-medium">{s.name}</span>,
          },
          {
            header: t("notifications.channel"),
            cell: (s) => t.dynamic(`notifications.channels.${s.channel}`),
          },
          {
            header: t("notifications.events"),
            cell: (s) => eventsSummary(t, s.event_types),
          },
          {
            header: t("notifications.status"),
            cell: (s) => <SubStatus t={t} sub={s} />,
          },
        ]}
      />

      {(creating === "webhook" || creating === "telegram") && (
        <UrlSheet params={["new"]} title={creating === "webhook" ? t("notifications.newWebhook") : t("notifications.newTelegram")}>
          {creating === "telegram" && !botConnected ? (
            <p className="text-sm">
              {t("notifications.telegram.notConnected")}{" "}
              <Link href={withParams(sp, { new: undefined, connect: "telegram" })} scroll={false} className="link">
                {t("payments.toIntegrations")}
              </Link>
            </p>
          ) : creating === "telegram" && !chats.length ? (
            <p className="text-sm text-muted-foreground">{t("notifications.telegram.noChats")}</p>
          ) : (
            <CreateForm channel={creating} chats={chats} />
          )}
        </UrlSheet>
      )}
      {editing && <EditSheet t={t} sub={editing} available={available} chats={chats} error={param(sp, "error")} ok={param(sp, "ok")} />}
    </Section>
  )
}

function eventsSummary(t: T, types: string[]) {
  if (types.includes("*")) return t("notifications.allEvents")
  return types.length ? t("notifications.eventCount", { count: types.length }) : t("notifications.noEvents")
}

function SubStatus({ t, sub }: { t: T; sub: Sub }) {
  return sub.active ? <Badge variant="success">{t("notifications.active")}</Badge> : <Badge variant="secondary">{t("notifications.paused")}</Badge>
}

async function EditSheet({
  t,
  sub,
  available,
  chats,
  error,
  ok,
}: {
  t: T
  sub: Sub
  available: typeof eventTypes
  chats: { id: number; title: string }[]
  error?: string
  ok?: string
}) {
  const ctx = await requirePerm("org.integrations.manage")
  const { data: deliveries } = await ctx.supabase
    .from("event_deliveries")
    .select("id, status, attempts, last_error, created_at, events:hub_events(type)")
    .eq("subscription_id", sub.id)
    .order("created_at", { ascending: false })
    .limit(20)
  const config = (sub.config ?? {}) as Record<string, string>
  const all = sub.event_types.includes("*")

  return (
    <UrlSheet
      params={["edit"]}
      title={sub.name}
      description={t.dynamic(`notifications.channels.${sub.channel}`)}
      menu={
        <ActionsMenu>
          <MenuSubmit form="test-sub" icon={<SendIcon />}>
            {t("notifications.test")}
          </MenuSubmit>
          <MenuSubmit form="delete-sub" icon={<Trash2Icon />} destructive confirm="notifications.confirmDelete">
            {t("notifications.delete")}
          </MenuSubmit>
        </ActionsMenu>
      }
    >
      <Notice error={error} ok={ok} />
      <form id="test-sub" action={sendTest.bind(null, sub.id)} hidden />
      <form id="delete-sub" action={deleteSubscription.bind(null, sub.id)} hidden />

      <form action={updateSubscription.bind(null, sub.id)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="sub-name">{t("notifications.name")}</Label>
          <Input id="sub-name" name="name" defaultValue={sub.name} maxLength={100} required />
        </div>
        {sub.channel === "webhook" && (
          <div className="grid gap-2">
            <Label htmlFor="sub-url">{t("notifications.url")}</Label>
            <Input id="sub-url" name="url" type="url" defaultValue={config.url} required />
          </div>
        )}
        {sub.channel === "telegram" && (
          <div className="grid gap-2">
            <Label htmlFor="sub-chat">{t("notifications.telegram.chat")}</Label>
            <Choice
              id="sub-chat"
              name="chat_id"
              label={t("notifications.telegram.chat")}
              required
              defaultValue={String(config.chat_id ?? "")}
              options={[...chats, ...(chats.some((c) => String(c.id) === String(config.chat_id)) ? [] : [{ id: Number(config.chat_id), title: String(config.chat_title ?? config.chat_id) }])].map((c) => ({ value: String(c.id), label: c.title }))}
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="active" defaultChecked={sub.active} />
          {t("notifications.active")}
        </label>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("notifications.events")}</legend>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox name="events" value="*" defaultChecked={all} />
            {t("notifications.allEvents")}
          </label>
          {available.map((e) => (
            <label key={e.key} className="flex items-center gap-2 text-sm">
              <Checkbox name="events" value={e.key} defaultChecked={all || sub.event_types.includes(e.key)} />
              {t.dynamic(`events.types.${e.key}`)}
            </label>
          ))}
        </fieldset>
        <SaveBar />
      </form>

      {sub.channel === "webhook" && (
        <section className="grid gap-2">
          <h3 className="font-medium">{t("notifications.secret")}</h3>
          <RotateSecret id={sub.id} />
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="font-medium">{t("notifications.deliveries")}</h3>
        {deliveries?.length ? (
          <ul className="grid divide-y rounded-lg border text-sm">
            {deliveries.map((d) => (
              <li key={d.id} className="grid gap-0.5 px-3 py-2">
                <span className="flex items-center justify-between gap-2">
                  <span>{t.dynamic(`events.types.${d.events?.type}`)}</span>
                  <Badge variant={d.status === "succeeded" ? "success" : d.status === "failed" ? "destructive" : "warning"}>
                    {t.dynamic(`notifications.statuses.${d.status}`)}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.date(d.created_at, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · {t("notifications.attempts", { count: d.attempts })}
                  {d.last_error ? ` · ${d.last_error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("notifications.noDeliveries")}</p>
        )}
      </section>
    </UrlSheet>
  )
}
