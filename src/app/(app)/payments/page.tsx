import Link from "next/link"
import { notFound } from "next/navigation"
import { FileTextIcon, FlaskConicalIcon, ShoppingBagIcon, TicketIcon, UserIcon, XIcon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { DetailList } from "@/components/detail-list"
import { FilterMenu } from "@/components/filter-menu"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { cancelTicketAction, createTestPayment, refund } from "./actions"
import { PayStatusBadge } from "./badges"

const STATUSES = ["open", "paid", "partially_refunded", "refunded", "failed", "expired"]
const SOURCES = ["tickets", "shop", "test"]
const UUID = /^[0-9a-f-]{36}$/
type Ctx = Awaited<ReturnType<typeof requirePerm>>

// Zahlungen: every pay order (tickets, shop, tests) with its state. Filters: status, source (Wofür), one event, one
// contact (by their email). A row opens the payment sheet (?edit=<id>) with items, tickets, refunds and its links.
export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const ctx = await requirePerm("payments.view")
  if (!ctx.modules.has("payments")) notFound()
  const t = await getT()
  const sp = await searchParams
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const source = SOURCES.find((s) => s === param(sp, "source"))
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const testing = ctx.isPlatformAdmin && param(sp, "new") === "test"
  const eventId = UUID.test(param(sp, "event") ?? "") ? param(sp, "event")! : null
  const contactId = UUID.test(param(sp, "contact") ?? "") ? param(sp, "contact")! : null

  const [{ data: providers }, { data: forEvent }, { data: contact }] = await Promise.all([
    ctx.supabase.from("org_integrations").select("provider, status, config").eq("org_id", ctx.org.id).in("provider", ["stripe", "sumup"]),
    eventId ? ctx.supabase.from("events").select("id, title").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    contactId ? ctx.supabase.from("contacts").select("first_name, last_name, company, email").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  let query = ctx.supabase
    .from("pay_orders")
    .select("id, created_at, customer_email, customer_name, source_module, amount_total, currency, status")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (q) query = query.or(`customer_email.ilike.%${q}%,customer_name.ilike.%${q}%`)
  if (status) query = query.eq("status", status)
  if (source) query = query.eq("source_module", source)
  // ?event=<id>: the ticket orders of one event (linked from the event page).
  if (eventId) query = query.eq("source_module", "tickets").eq("source_id", eventId)
  // ?contact=<id>: pay orders don't point at contacts; the buyer's email is the link (exact, case-insensitive).
  if (contactId) query = query.ilike("customer_email", (contact?.email ?? "-").replace(/[%_\\]/g, "\\$&"))
  const { data } = await query
  // Any payment provider that can take payments (SumUp needs the payments right too); else a hint.
  const ready = (providers ?? []).some((p) => p.status === "connected" && (p.provider !== "sumup" || (p.config as Record<string, unknown>)?.can_take_payments))
  const pending = (providers ?? []).some((p) => p.status === "pending" || (p.provider === "sumup" && p.status === "connected"))
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const canSeeIntegrations = ctx.can("org.integrations.manage")
  const filtered = !!(q || status || source || eventId || contactId)
  const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company || contact.email || "–" : null
  const chip = (label: string, drop: string) => (
    <Button
      render={<Link href={`/payments${withParams(sp, { [drop]: undefined, page: undefined })}`} aria-label={`${label} – ${t("common.clear")}`} />}
      nativeButton={false}
      size="sm"
      variant="secondary"
    >
      {label} <XIcon />
    </Button>
  )

  return (
    <Page>
      <PageHeader
        area="finance"
        title={t("payments.title")}
        menu={
          <ActionsMenu>
            <MenuExport
              entity="payments"
              query={{
                q,
                status,
                source,
                event: eventId ?? undefined,
                contact: contactId ?? undefined,
              }}
            />
            {ctx.isPlatformAdmin && (
              <MenuLink href={withParams(sp, { new: "test", edit: undefined })} icon={<FlaskConicalIcon />}>
                {t("payments.testPayment")}
              </MenuLink>
            )}
          </ActionsMenu>
        }
      />

      {canSeeIntegrations && !ready && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
          {pending ? t("payments.notReady") : t("payments.notConnected")}
          <Link href="/settings/integrations" className="font-medium text-[var(--link)] hover:underline">
            {t("payments.toIntegrations")}
          </Link>
        </p>
      )}
      <Notice error={!editId && !testing ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <ListToolbar
        search={
          <SearchBox
            q={q}
            label={t("payments.search")}
            keep={
              Object.fromEntries(
                Object.entries({
                  status,
                  source,
                  event: eventId,
                  contact: contactId,
                }).filter(([, v]) => v),
              ) as Record<string, string>
            }
          />
        }
      >
        <FilterMenu
          param="status"
          label={t("payments.status")}
          allLabel={t("payments.all")}
          options={STATUSES.map((x) => ({
            value: x,
            label: t.dynamic(`payments.statuses.${x}`),
          }))}
        />
        <FilterMenu
          param="source"
          label={t("payments.what")}
          allLabel={t("payments.all")}
          options={SOURCES.filter((x) => x !== "test" || ctx.isPlatformAdmin || source === "test").map((x) => ({
            value: x,
            label: t.dynamic(`payments.sources.${x}`),
          }))}
        />
        {forEvent && chip(t("payments.forEvent", { title: forEvent.title }), "event")}
        {contactName && chip(contactName, "contact")}
      </ListToolbar>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={filtered ? t("payments.emptyFiltered") : <EmptyState area="finance" title={t("payments.emptyTitle")} text={t("payments.emptyText")} />}
        columns={[
          {
            header: t("payments.customer"),
            cell: (r) => (
              <span className="grid max-w-xs min-w-0">
                <span className="truncate font-medium">{r.customer_name || r.customer_email || "–"}</span>
                {r.customer_name && r.customer_email && <span className="truncate text-xs font-normal text-muted-foreground">{r.customer_email}</span>}
              </span>
            ),
          },
          {
            header: t("payments.what"),
            cell: (r) => t.dynamic(`payments.sources.${r.source_module}`),
          },
          {
            header: t("payments.date"),
            cell: (r) => t.date(r.created_at, { dateStyle: "medium", timeStyle: "short" }),
            className: "whitespace-nowrap",
          },
          {
            header: t("payments.status"),
            cell: (r) => <PayStatusBadge t={t} status={r.status} />,
          },
          {
            header: t("payments.amount"),
            cell: (r) => t.money(r.amount_total, r.currency),
            className: "text-right tabular-nums whitespace-nowrap",
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {editId && UUID.test(editId) && <PaymentSheet t={t} ctx={ctx} orderId={editId} error={param(sp, "error")} ok={param(sp, "ok")} />}

      {testing && (
        <UrlSheet params={["new"]} title={t("payments.testPayment")} description={t("payments.testHelp")}>
          <form action={createTestPayment} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            <div className="grid gap-2">
              <Label htmlFor="test-amount">{t("payments.testAmount")}</Label>
              <TypedInput kind="money" id="test-amount" name="amount" defaultValue="1,00" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="test-email">{t("payments.testEmail")}</Label>
              <TypedInput kind="email" id="test-email" name="email" />
            </div>
            <SaveBar label={t("payments.startCheckout")} always />
          </form>
        </UrlSheet>
      )}
    </Page>
  )
}

async function PaymentSheet({ t, ctx, orderId, error, ok }: { t: T; ctx: Ctx; orderId: string; error?: string; ok?: string }) {
  const { data: order } = await ctx.supabase
    .from("pay_orders")
    .select(
      "*, pay_order_items(*), pay_payments(*, pay_refunds(*)), tickets(id, code, holder_name, status, price, ticket_types(name)), shop_orders(id, number, contact_id, documents(id, number, status))",
    )
    .eq("id", orderId)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!order) return null
  const canRefund = ctx.can("payments.refund")
  const refunds = order.pay_payments.flatMap((p) => p.pay_refunds)
  const refundable = canRefund && ["paid", "partially_refunded"].includes(order.status)
  const keptFee = Number((order.metadata as Record<string, unknown> | null)?.service_fee) || 0 // not refunded
  const left = order.amount_total - keptFee - refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0)
  const shop = order.shop_orders
  const money = (c: number) => t.money(c, order.currency)
  const contactId = shop?.contact_id ?? null
  const invoice = shop?.documents && shop.documents.status !== "draft" ? shop.documents : null
  const links = (
    [
      order.source_module === "tickets" &&
        order.source_id &&
        ctx.modules.has("events") && {
          key: "event",
          href: `/events/${order.source_id}/tickets#sold`,
          icon: TicketIcon,
          title: order.pay_order_items[0]?.description.split(" · ")[0] ?? t("payments.sources.tickets"),
          detail: t("payments.link.event"),
        },
      shop &&
        ctx.modules.has("shop") &&
        ctx.can("shop.view") && {
          key: "shop",
          href: `/shop/orders/${shop.id}`,
          icon: ShoppingBagIcon,
          title: t("store.orderTitle", { number: String(shop.number) }),
          detail: t("payments.link.shopOrder"),
        },
      invoice &&
        ctx.modules.has("invoices") &&
        ctx.can("invoices.view") && {
          key: "invoice",
          href: `/invoices/${invoice.id}`,
          icon: FileTextIcon,
          title: `${t("invoices.docTitles.invoice")} ${invoice.number ?? ""}`.trim(),
          detail: t.dynamic(`invoices.statuses.invoice.${invoice.status}`),
        },
      contactId &&
        ctx.modules.has("crm") &&
        ctx.can("crm.view") && {
          key: "contact",
          href: `/contacts/${contactId}`,
          icon: UserIcon,
          title: order.customer_name || order.customer_email || "–",
          detail: t("payments.link.contact"),
        },
    ] as (LinkRow | false | null | undefined | "")[]
  ).filter((x): x is LinkRow => !!x)

  return (
    <UrlSheet
      params={["edit"]}
      title={`${t("payments.payment")} · ${money(order.amount_total)}`}
      meta={t.date(order.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    >
      <Notice error={error} ok={ok} />
      <DetailList
        items={[
          {
            label: t("payments.status"),
            value: <PayStatusBadge t={t} status={order.status} />,
          },
          { label: t("payments.customer"), value: order.customer_name },
          order.customer_email && {
            label: t("contacts.email"),
            value: (
              <a href={`mailto:${order.customer_email}`} className="break-all text-[var(--link)] hover:underline">
                {order.customer_email}
              </a>
            ),
          },
          {
            label: t("payments.what"),
            value: t.dynamic(`payments.sources.${order.source_module}`),
          },
          order.paid_at && {
            label: t("payments.paidAt"),
            value: t.date(order.paid_at, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          },
          {
            label: t("payments.fee"),
            value: <span className="tabular-nums">{money(order.application_fee)}</span>,
          },
        ]}
      />

      {links.length > 0 && (
        <Section id="pay-links" title={t("payments.links")}>
          <LinkRows rows={links} />
        </Section>
      )}

      <Section id="pay-items" title={t("payments.items")}>
        <ul className="grid divide-y rounded-lg border text-sm">
          {order.pay_order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2 px-3 py-2">
              <span>
                {i.quantity} × {i.description}
              </span>
              <span className="shrink-0 tabular-nums">{money(i.quantity * i.unit_amount)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2 px-3 py-2 font-medium">
            <span>{t("payments.total")}</span>
            <span className="tabular-nums">{money(order.amount_total)}</span>
          </li>
        </ul>
      </Section>

      {order.tickets.length > 0 && (
        <Section id="pay-tickets" title={t("payments.tickets")}>
          <ul className="grid divide-y rounded-lg border text-sm">
            {order.tickets.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-mono">{k.code}</span> · {k.ticket_types?.name}
                  {k.holder_name && <span className="text-muted-foreground"> · {k.holder_name}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t.dynamic(`tickets.statuses.${k.status}`)}</span>
                  {canRefund && ["valid", "used", "reserved"].includes(k.status) && (
                    <form action={cancelTicketAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <input type="hidden" name="order" value={order.id} />
                      <SubmitButton size="sm" variant="ghost" data-confirm="payments.confirmCancelTicket" className="text-destructive hover:text-destructive">
                        {t("payments.cancelTicket")}
                      </SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {order.pay_payments.length > 0 && (
        <Section id="pay-attempts" title={t("payments.attempts")}>
          <ul className="grid divide-y rounded-lg border text-sm">
            {order.pay_payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate">
                  {t.has(`payments.providers.${p.provider}`) ? t.dynamic(`payments.providers.${p.provider}`) : p.provider} ·{" "}
                  {t.date(p.created_at, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <PayStatusBadge t={t} status={p.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {refunds.length > 0 && (
        <Section id="pay-refunds" title={t("payments.refunds")}>
          <ul className="grid divide-y rounded-lg border text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="tabular-nums">
                  {money(r.amount)}
                  {r.reason ? ` · ${r.reason}` : ""}
                </span>
                <PayStatusBadge t={t} status={r.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {refundable && shop ? (
        // Shop orders are refunded on the order (pieces, stock, corrected invoice).
        <Link href={`/shop/orders/${shop.id}?new=refund`} className="justify-self-start text-sm text-[var(--link)] hover:underline">
          {t("payments.refundInShop")}
        </Link>
      ) : (
        refundable && (
          <Section id="pay-refund" title={t("payments.refund")}>
            <form action={refund} className="grid gap-4">
              <input type="hidden" name="id" value={order.id} />
              <div className="grid gap-2">
                <Label htmlFor="refund-amount">{t("payments.refundAmount")}</Label>
                <TypedInput kind="money" id="refund-amount" name="amount" />
                <p className="text-xs text-muted-foreground">
                  {t("payments.refundLeft", { amount: money(left) })}
                  {keptFee > 0 && ` ${t("payments.feeKept", { amount: money(keptFee) })}`}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="refund-reason">{t("payments.refundReason")}</Label>
                <Input id="refund-reason" name="reason" maxLength={200} />
              </div>
              <SubmitButton variant="destructive" className="justify-self-start" data-confirm="payments.confirmRefund">
                {t("payments.refund")}
              </SubmitButton>
            </form>
          </Section>
        )
      )}
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
