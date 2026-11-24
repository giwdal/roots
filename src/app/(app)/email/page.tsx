import Link from "next/link"
import { redirect } from "next/navigation"
import { MailIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { restoreCampaign } from "./actions"
import { CampaignBadge } from "./badges"
import { EmailViews } from "./views"

const STATUSES = ["draft", "scheduled", "sending", "sent"] as const

// E-Mails › Kampagnen: every campaign with its state; the trash (?trash=1) brings deleted ones back.
// ?event=<id>: campaigns to that event's buyers (linked from the event page).
export default async function CampaignsPage({ searchParams }: PageProps<"/email">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("email.manage")
  if (param(sp, "new")) redirect("/email/new") // old create sheet
  const trash = canManage && param(sp, "trash") === "1"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const eventId = /^[0-9a-f-]{36}$/.test(param(sp, "event") ?? "") ? param(sp, "event")! : null
  const page = pageParam(sp)
  let query = ctx.supabase
    .from("email_campaigns")
    .select("id, name, subject, status, send_at, recipients, updated_at")
    .eq("org_id", ctx.org.id)
    .order("updated_at", { ascending: false })
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (status) query = query.eq("status", status)
  if (eventId) query = query.eq("audience->>event", eventId)
  if (q) query = query.or(`name.ilike.%${q}%,subject.ilike.%${q}%`)
  const [{ data }, { count: any }, { data: ev }] = await Promise.all([
    query,
    ctx.supabase.from("email_campaigns").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null),
    eventId ? ctx.supabase.from("events").select("title").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const newHref = eventId ? `/email/new?event=${eventId}` : "/email/new"

  return (
    <>
      <PageHeader
        area="communication"
        title={trash ? `${t("email.tabs.campaigns")} · ${t("email.trash")}` : t("email.tabs.campaigns")}
        settings={{ href: "/email/settings", label: t("email.settings.title") }}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/email" : "/email?trash=1"} icon={trash ? <MailIcon /> : <Trash2Icon />}>
                {trash ? t("email.tabs.campaigns") : t("email.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: newHref, label: t("email.newCampaign") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ListToolbar search={(!!any || trash) && <SearchBox q={q} label={t("common.search")} keep={{ ...(trash && { trash: "1" }), ...(status && { status }), ...(eventId && { event: eventId }) }} />}>
        {!trash && !!any && <FilterMenu param="status" label={t("email.status")} options={STATUSES.map((s) => ({ value: s, label: t(`email.statuses.${s}`) }))} />}
        {ev && (
          <Button render={<Link href={`/email${withParams(sp, { event: undefined, page: undefined })}`} aria-label={`${ev.title} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
            {t("email.buyersOf", { event: ev.title })} <XIcon />
          </Button>
        )}
        {!trash && <EmailViews t={t} current="campaigns" />}
      </ListToolbar>
      {trash && <p className="text-sm text-muted-foreground">{t("email.trashHint", { days: 30 })}</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={trash ? undefined : (r) => `/email/${r.id}`}
        empty={
          trash ? (
            t("email.emptyTrash")
          ) : any ? (
            t("email.noMatch")
          ) : (
            <EmptyState
              area="communication"
              title={t("email.emptyCampaigns")}
              text={t("email.emptyCampaignsText")}
              action={
                canManage && (
                  <Button render={<Link href={newHref} />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("email.newCampaign")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("email.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.subject}</span>
              </span>
            ),
          },
          { header: t("email.status"), cell: (r) => <CampaignBadge t={t} status={r.status} sendAt={r.send_at} /> },
          { header: t("email.recipients"), cell: (r) => (r.status === "draft" || r.status === "scheduled" ? "–" : r.recipients), className: "tabular-nums", phone: false },
          {
            header: t("email.recipients"),
            cell: (r) => (r.status === "sent" || r.status === "sending" ? t("email.recipientCount", { count: r.recipients }) : t.date(r.updated_at, { dateStyle: "medium" })),
            table: false,
          },
          trash
            ? {
                header: "",
                cell: (r) => (
                  <form action={restoreCampaign}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton size="sm" variant="outline">
                      {t("email.restore")}
                    </SubmitButton>
                  </form>
                ),
              }
            : { header: t("email.changed"), cell: (r) => t.date(r.updated_at, { dateStyle: "medium" }), className: "whitespace-nowrap", phone: false },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </>
  )
}

export const instant = false
