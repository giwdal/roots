import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon, XIcon } from "lucide-react"
import { ActionsMenu, MenuExport } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { DocBadge } from "./badges"

const KINDS = ["invoice", "quote", "cancellation"] as const
const STATUSES = ["draft", "sent", "paid", "accepted", "declined", "cancelled"] as const
const UUID = /^[0-9a-f-]{36}$/

// Rechnungen: quotes, invoices and cancellations in one list; what's open or overdue shows as a badge. A row opens it.
export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const ctx = await requirePerm("invoices.view")
  if (!ctx.modules.has("invoices")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("invoices.manage")
  const kind = KINDS.find((k) => k === param(sp, "kind"))
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const overdue = param(sp, "status") === "overdue"
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const contactId = UUID.test(param(sp, "contact") ?? "") ? param(sp, "contact")! : null
  const page = pageParam(sp)
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  })

  let query = ctx.supabase
    .from("documents")
    .select("id, kind, status, number, recipient_name, issue_date, due_date, valid_until, gross_total, currency, created_at")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (kind) query = query.eq("kind", kind)
  if (status) query = query.eq("status", status)
  if (overdue) query = query.eq("kind", "invoice").eq("status", "sent").lt("due_date", today)
  if (q) query = query.or(`number.ilike.%${q}%,recipient_name.ilike.%${q}%`)
  if (contactId) query = query.eq("contact_id", contactId)
  const [{ data }, { data: contact }] = await Promise.all([
    query,
    contactId ? ctx.supabase.from("contacts").select("first_name, last_name, company").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const filtered = !!(kind || status || overdue || q || contactId)
  const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company || "–" : null
  const day = (d: string | null) => (d ? t.date(`${d}T12:00:00Z`) : "–")

  return (
    <Page>
      <PageHeader
        area="finance"
        title={t("invoices.title")}
        settings={
          canManage && {
            href: "/invoices/settings",
            label: t("common.settings"),
          }
        }
        menu={
          <ActionsMenu>
            <MenuExport
              entity="documents"
              query={{
                kind,
                status: param(sp, "status"),
                q,
                contact: contactId ?? undefined,
              }}
            />
          </ActionsMenu>
        }
        primary={
          canManage
            ? {
                href: "/invoices/new",
                label: t("invoices.newInvoice"),
                more: [
                  {
                    href: "/invoices/new?kind=quote",
                    label: t("invoices.newQuote"),
                  },
                ],
              }
            : undefined
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ListToolbar
        search={
          <SearchBox
            q={q}
            label={t("invoices.search")}
            keep={{
              ...(kind ? { kind } : {}),
              ...(param(sp, "status") ? { status: param(sp, "status")! } : {}),
              ...(contactId ? { contact: contactId } : {}),
            }}
          />
        }
      >
        <FilterMenu
          param="status"
          label={t("invoices.status")}
          allLabel={t("invoices.allStatus")}
          options={["draft", "sent", "overdue", "paid", "accepted", "declined", "cancelled"].map((x) => ({
            value: x,
            label: t.dynamic(`invoices.filters.${x}`),
          }))}
        />
        {contactName && (
          <Button
            render={<Link href={`/invoices${withParams(sp, { contact: undefined, page: undefined })}`} aria-label={t("invoices.clearContact", { name: contactName })} />}
            nativeButton={false}
            size="sm"
            variant="secondary"
          >
            {contactName} <XIcon />
          </Button>
        )}
        <Segments
          label={t("invoices.kind")}
          className="md:ml-auto"
          items={[undefined, ...KINDS].map((k) => ({
            href: `/invoices${withParams(sp, { kind: k, page: undefined })}`,
            label: k ? t.dynamic(`invoices.kindsPlural.${k}`) : t("invoices.all"),
            current: k === kind,
          }))}
        />
      </ListToolbar>
      <DataTable
        rows={rows}
        rowKey={(d) => d.id}
        rowHref={(d) => `/invoices/${d.id}`}
        empty={
          filtered ? (
            t("invoices.emptyFiltered")
          ) : (
            <EmptyState
              area="finance"
              title={t("invoices.emptyTitle")}
              text={t("invoices.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/invoices/new" />} nativeButton={false} size="sm" variant="outline">
                    <PlusIcon /> {t("invoices.newInvoice")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("invoices.document"),
            cell: (d) => (
              <span className="grid max-w-sm min-w-0">
                <span className="truncate font-medium">
                  {d.number ?? t("invoices.draftNumber")}
                  {d.recipient_name && ` · ${d.recipient_name}`}
                </span>
                <span className="truncate text-xs font-normal text-muted-foreground">{t.dynamic(`invoices.kinds.${d.kind}`)}</span>
              </span>
            ),
          },
          {
            header: t("invoices.issueDate"),
            cell: (d) => day(d.issue_date),
            className: "whitespace-nowrap",
          },
          {
            header: t("invoices.dueColumn"),
            cell: (d) => day(d.kind === "quote" ? d.valid_until : d.due_date),
            className: "whitespace-nowrap",
          },
          {
            header: t("invoices.status"),
            cell: (d) => <DocBadge t={t} doc={d} today={today} />,
          },
          {
            header: t("invoices.gross"),
            cell: (d) => t.money(d.gross_total, d.currency),
            className: "text-right tabular-nums whitespace-nowrap",
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false
