import Link from "next/link"
import { redirect } from "next/navigation"
import { FileTextIcon, PlusIcon, XIcon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuSubmit } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { missingInvoices } from "@/shop/server"
import { issueMissingInvoicesAction } from "../actions"
import { OrderBadge, PayBadge } from "../badges"

const VIEWS = { open: ["new", "ready"], done: ["shipped", "completed"], cancelled: ["cancelled"], all: null } as const
const UUID = /^[0-9a-f-]{36}$/

// Shop orders: what needs doing first (new / ready for pickup), payment and fulfilment as badges. A row opens the order.
export default async function OrdersPage({ searchParams }: PageProps<"/shop/orders">) {
  const sp = await searchParams
  // "Neue Bestellung" was a sheet (?new=order); it is a page now.
  if (param(sp, "new") === "order") redirect(`/shop/orders/new${param(sp, "item") ? `?item=${param(sp, "item")}` : ""}`)
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const canManage = ctx.can("shop.manage")
  const view = (Object.keys(VIEWS) as (keyof typeof VIEWS)[]).find((v) => v === param(sp, "view")) ?? "open"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const pay = param(sp, "pay")
  const contactId = UUID.test(param(sp, "contact") ?? "") ? param(sp, "contact")! : null
  const page = pageParam(sp)
  let query = ctx.supabase
    .from("shop_orders")
    .select("id, number, status, delivery, payment, name, placed_at, pay_orders!inner(status, amount_total, currency, pay_order_items(description, quantity, metadata))")
    .eq("org_id", ctx.org.id)
    .not("placed_at", "is", null) // online orders only count once paid (abandoned checkouts aren't orders)
    .order("placed_at", { ascending: false })
    .range(...pageRange(page))
  const statuses = VIEWS[view]
  if (statuses) query = query.in("status", [...statuses])
  if (q) query = /^\d+$/.test(q) ? query.eq("number", Number(q)) : query.ilike("name", `%${q}%`)
  if (contactId) query = query.eq("contact_id", contactId)
  if (pay === "open") query = query.in("pay_orders.status", ["open", "failed", "expired"])
  if (pay === "paid") query = query.in("pay_orders.status", ["paid", "partially_refunded"])
  const canInvoice = canManage && ctx.modules.has("invoices")
  const [{ data }, missing, { data: contact }] = await Promise.all([
    query,
    canInvoice ? missingInvoices(ctx.org.id) : 0,
    contactId ? ctx.supabase.from("contacts").select("first_name, last_name, company").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rows = (data ?? []).slice(0, PAGE_SIZE)
  const filtered = !!(q || pay || contactId) || view !== "open"
  const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company || "–" : null
  const items = (o: (typeof rows)[number]) => o.pay_orders.pay_order_items.filter((i) => !(i.metadata as Record<string, unknown> | null)?.shipping)
  const summary = (o: (typeof rows)[number]) => {
    const list = items(o)
    if (!list.length) return ""
    const first = `${list[0].quantity}× ${list[0].description}`
    return list.length > 1 ? t("store.itemsMore", { first, count: list.length - 1 }) : first
  }

  return (
    <Page>
      <PageHeader
        area="shop"
        title={t("store.orders")}
        settings={canManage && { href: "/shop/settings", label: t("common.settings") }}
        menu={
          <ActionsMenu>
            {missing > 0 && (
              <MenuSubmit form="issue-invoices" icon={<FileTextIcon />} confirm="store.confirmIssueMissing">
                {t("store.issueMissingInvoices", { count: missing })}
              </MenuSubmit>
            )}
            <MenuExport entity="shop_orders" query={{ view, q, pay, contact: contactId ?? undefined }} />
          </ActionsMenu>
        }
        primary={canManage ? { href: "/shop/orders/new", label: t("store.teamOrder.new") } : undefined}
      />
      {missing > 0 && <form id="issue-invoices" action={issueMissingInvoicesAction} hidden />}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ListToolbar search={<SearchBox q={q} label={t("store.searchOrders")} keep={{ view, ...(pay ? { pay } : {}), ...(contactId ? { contact: contactId } : {}) }} />}>
        <FilterMenu param="pay" label={t("store.payment")} options={[{ value: "open", label: t("store.payFilter.open") }, { value: "paid", label: t("store.payFilter.paid") }]} />
        {contactName && (
          <Button render={<Link href={`/shop/orders${withParams(sp, { contact: undefined, page: undefined })}`} aria-label={t("store.clearContact", { name: contactName })} />} nativeButton={false} size="sm" variant="secondary">
            {contactName} <XIcon />
          </Button>
        )}
        <Segments
          label={t("store.orders")}
          className="md:ml-auto"
          items={(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => ({ href: `/shop/orders${withParams(sp, { view: v === "open" ? undefined : v, page: undefined })}`, label: t.dynamic(`store.views.${v}`), current: v === view }))}
        />
      </ListToolbar>
      <DataTable
        rows={rows}
        rowKey={(o) => o.id}
        rowHref={(o) => `/shop/orders/${o.id}`}
        empty={
          filtered ? (
            t("store.noOrders")
          ) : (
            <EmptyState
              area="shop"
              title={t("store.noOpenOrders")}
              text={t("store.noOpenOrdersText")}
              action={
                canManage && (
                  <Button render={<Link href="/shop/orders/new" />} nativeButton={false} size="sm" variant="outline">
                    <PlusIcon /> {t("store.teamOrder.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("store.order"),
            cell: (o) => (
              <span className="grid max-w-sm min-w-0">
                <span className="truncate font-medium">
                  #{o.number} · {o.name}
                </span>
                <span className="truncate text-xs font-normal text-muted-foreground">{summary(o)}</span>
              </span>
            ),
          },
          { header: t("store.date"), cell: (o) => t.date(o.placed_at!, { dateStyle: "medium", timeStyle: "short" }), className: "whitespace-nowrap", phone: false },
          // Phones: one muted line with the short date and both states as badges (the table shows them with their detail).
          { header: t("store.date"), cell: (o) => t.date(o.placed_at!, { day: "2-digit", month: "2-digit" }), table: false },
          { header: t("store.payment"), cell: (o) => <PayBadge t={t} status={o.pay_orders.status} />, table: false },
          { header: t("store.status"), cell: (o) => <OrderBadge t={t} status={o.status} />, table: false },
          {
            header: t("store.payment"),
            phone: false,
            cell: (o) => (
              <span className="grid justify-items-start gap-0.5">
                <PayBadge t={t} status={o.pay_orders.status} />
                <span className="text-xs text-muted-foreground">{t.dynamic(`store.payments.${o.payment}`)}</span>
              </span>
            ),
          },
          {
            header: t("store.status"),
            phone: false,
            cell: (o) => (
              <span className="grid justify-items-start gap-0.5">
                <OrderBadge t={t} status={o.status} />
                <span className="text-xs text-muted-foreground">{t.dynamic(`store.deliveries.${o.delivery}`)}</span>
              </span>
            ),
          },
          { header: t("store.total"), cell: (o) => t.money(o.pay_orders.amount_total, o.pay_orders.currency), className: "text-right tabular-nums" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false
