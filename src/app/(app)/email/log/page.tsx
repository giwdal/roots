import Link from "next/link"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { contactName } from "@/app/(app)/contacts/fields"
import { SendBadge } from "../badges"
import { EmailViews } from "../views"

const BULK = ["campaign", "automation", "workflow"]
const VIEWS = ["all", "system", "bulk"] as const

// Where a row's record lives in the App.
const HREF: Record<string, (id: string) => string> = {
  shop_orders: (id) => `/shop/orders/${id}`,
  events: (id) => `/events/${id}`,
  documents: (id) => `/invoices/${id}`,
  contacts: (id) => `/contacts/${id}`,
  forms: (id) => `/forms/${id}`,
  email_campaigns: (id) => `/email/${id}`,
  email_automations: (id) => `/email/automations?edit=${id}`,
  workflows: (id) => `/automations/${id}`,
}

const kindLabel = (t: T, kind: string) => {
  if (kind.startsWith("shop.")) return `${t.dynamic("email.kinds.shop")} · ${t.dynamic(`store.mailKinds.${kind.slice(5)}`)}`
  return t.has(`email.kinds.${kind}`) ? t.dynamic(`email.kinds.${kind}`) : kind
}

// Every mail that went out in the org's name (and what's waiting or failed), newest first: campaigns, automations
// and workflows from the queue, everything else (shop, tickets, invoices, logins…) from email_log (kept 90 days).
export default async function EmailLogPage({ searchParams }: PageProps<"/email/log">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const page = pageParam(sp)
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "all"
  const q = param(sp, "q")?.trim()
  // ?contact=<id>: every mail to that contact's address (the contact page links here); a chip clears it.
  const contactId = /^[0-9a-f-]{36}$/.test(param(sp, "contact") ?? "") ? param(sp, "contact")! : null
  // ?campaign=<id>: every mail of that campaign (the campaign page links here).
  const campaignId = /^[0-9a-f-]{36}$/.test(param(sp, "campaign") ?? "") ? param(sp, "campaign")! : null
  const [{ data: contact }, { data: campaign }] = await Promise.all([
    contactId ? ctx.supabase.from("contacts").select("first_name, last_name, company, email").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    campaignId ? ctx.supabase.from("email_campaigns").select("name").eq("id", campaignId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  let query = ctx.supabase
    .from("email_history")
    .select("id, to_email, subject, kind, source, entity, entity_id, status, delivery, error, at")
    .eq("org_id", ctx.org.id!)
    .order("at", { ascending: false })
  if (view === "bulk") query = query.in("kind", BULK)
  if (view === "system") query = query.not("kind", "in", `(${BULK.join(",")})`)
  if (campaignId) query = query.eq("entity", "email_campaigns").eq("entity_id", campaignId)
  if (contactId) query = query.ilike("to_email", (contact?.email ?? "-").replace(/[%_\\]/g, "\\$&"))
  if (q) query = query.or(`to_email.ilike.%${q.replace(/[%,()]/g, "")}%,subject.ilike.%${q.replace(/[%,()]/g, "")}%`)
  const { data } = await query.range(...pageRange(page))
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  return (
    <>
      <PageHeader area="communication" title={t("email.tabs.log")} settings={{ href: "/email/settings", label: t("email.settings.title") }} />
      <ListToolbar search={<SearchBox q={q} label={t("email.logSearch")} keep={{ ...(view !== "all" && { view }), ...(contactId && { contact: contactId }), ...(campaignId && { campaign: campaignId }) }} />}>
        <FilterMenu param="view" label={t("email.kind")} allLabel={t("email.logViews.all")} options={VIEWS.filter((v) => v !== "all").map((v) => ({ value: v, label: t.dynamic(`email.logViews.${v}`) }))} />
        {contact && (
          <Button render={<Link href={`/email/log${withParams(sp, { contact: undefined, page: undefined })}`} aria-label={`${contactName(contact)} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
            {contactName(contact)} <XIcon />
          </Button>
        )}
        {campaign && (
          <Button render={<Link href={`/email/log${withParams(sp, { campaign: undefined, page: undefined })}`} aria-label={`${campaign.name} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
            {campaign.name} <XIcon />
          </Button>
        )}
        <EmailViews t={t} current="log" />
      </ListToolbar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id!}
        empty={t("email.emptyLog")}
        columns={[
          {
            header: t("email.to"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium break-all">{r.to_email}</span>
                {r.subject && <span className="text-xs text-muted-foreground">{r.subject}</span>}
              </span>
            ),
          },
          {
            header: t("email.kind"),
            cell: (r) => {
              const label = r.source ? `${kindLabel(t, r.kind!)}: ${r.source}` : kindLabel(t, r.kind!)
              const href = r.entity && r.entity_id ? HREF[r.entity]?.(r.entity_id) : undefined
              return href ? (
                <Link href={href} className="underline-offset-4 hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )
            },
          },
          {
            header: t("email.status"),
            cell: (r) => (
              <span className="grid gap-0.5">
                <SendBadge t={t} status={r.status!} />
                {r.delivery && (
                  <span className={r.delivery === "bounced" || r.delivery === "complained" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {t.dynamic(`email.delivery.${r.delivery}`)}
                  </span>
                )}
                {r.error && <span className="text-xs text-destructive">{r.error}</span>}
              </span>
            ),
          },
          { header: t("email.when"), cell: (r) => t.date(r.at!, { dateStyle: "short", timeStyle: "short" }), className: "whitespace-nowrap" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </>
  )
}

export const instant = false
