import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { BanIcon, CheckCircle2Icon, CircleIcon, FileTextIcon, MailIcon, PackageCheckIcon, RotateCcwIcon, TruckIcon, Undo2Icon, WalletIcon } from "lucide-react"
import { ActionsMenu, MenuGroup, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { DetailList } from "@/components/detail-list"
import { Notice } from "@/components/notice"
import { Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { cn } from "@/lib/utils"
import { MAIL_KINDS } from "@/shop/fields"
import { cancelOrderAction, invoiceAction, markPaidAction, orderStatusAction, resendMailAction } from "../../actions"
import { isPaid, OrderBadge, PayBadge } from "../../badges"
import { RefundForm } from "./refund-form"

type Step = { status: "ready" | "shipped" | "completed"; label: string; icon: typeof TruckIcon; sheet?: boolean }

// One shop order, opened on its state: paid? handed over? The next step is the header's main button (mark paid →
// ready / shipped → done); items, delivery and note on the left, buyer, payment and invoice (each linked) on the right.
export default async function OrderPage({ params, searchParams }: PageProps<"/shop/orders/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const sp = await searchParams
  if (param(sp, "refund")) redirect(`/shop/orders/${id}?new=refund`)
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const canManage = ctx.can("shop.manage")
  const { data: o } = await ctx.supabase
    .from("shop_orders")
    .select("*, contacts(id, first_name, last_name), documents(id, number, status), pay_orders!inner(id, status, amount_total, currency, customer_email, expires_at, paid_at, provider, pay_order_items(id, description, quantity, refunded_quantity, unit_amount, metadata), pay_payments(amount, status, pay_refunds(id, amount, status, reason, created_at)))")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!o) notFound()
  const pay = o.pay_orders
  const cur = pay.currency
  const paid = isPaid(pay.status)
  const live = o.status !== "cancelled"
  const payment = pay.pay_payments.find((x) => x.status === "succeeded")
  const refunds = (payment?.pay_refunds ?? []).filter((r) => r.status !== "failed").sort((a, b) => a.created_at.localeCompare(b.created_at))
  const refundLeft = (payment?.amount ?? 0) - refunds.reduce((s, r) => s + r.amount, 0)
  const canRefund = live && paid && refundLeft > 0 && ctx.can("payments.refund")
  const canCancel = canManage && live && (!paid || ctx.can("payments.refund"))
  const hidden = <input type="hidden" name="id" value={o.id} />

  // The next fulfilment step for this kind of delivery (none once completed or cancelled).
  const fulfil: Step | null =
    !live || o.status === "completed"
      ? null
      : o.delivery === "pickup"
        ? o.status === "new"
          ? { status: "ready", label: t("store.markReady"), icon: PackageCheckIcon }
          : { status: "completed", label: t("store.markPickedUp"), icon: CheckCircle2Icon }
        : o.delivery === "shipping" && o.status !== "shipped"
          ? { status: "shipped", label: t("store.markShipped"), icon: TruckIcon, sheet: true }
          : { status: "completed", label: t("store.markCompleted"), icon: CheckCircle2Icon }
  const markPaid = canManage && live && !paid && o.payment !== "online"
  const stepButton = (s: Step, variant: "default" | "outline") =>
    s.sheet ? (
      <Button render={<Link href={withParams(sp, { new: "shipment" })} scroll={false} />} nativeButton={false} size="sm" variant={variant}>
        <s.icon /> {s.label}
      </Button>
    ) : (
      <form action={orderStatusAction}>
        {hidden}
        <input type="hidden" name="status" value={s.status} />
        <SubmitButton size="sm" variant={variant}>
          <s.icon /> {s.label}
        </SubmitButton>
      </form>
    )
  const markPaidButton = (
    <form action={markPaidAction}>
      {hidden}
      <input type="hidden" name="method" value={o.payment === "transfer" ? "transfer" : "cash"} />
      <SubmitButton size="sm" data-confirm={o.payment === "transfer" ? "store.confirmTransferReceived" : "store.confirmCashReceived"}>
        <WalletIcon /> {o.payment === "transfer" ? t("store.markTransferReceived") : t("store.markCashReceived")}
      </SubmitButton>
    </form>
  )
  const primary = !canManage ? undefined : markPaid ? markPaidButton : fulfil ? stepButton(fulfil, "default") : undefined

  // Progress: placed → paid → ready / shipped → done (the middle step only where it exists).
  const middle = o.delivery === "pickup" ? "ready" : o.delivery === "shipping" ? "shipped" : null
  const steps = [
    { label: t("store.steps.placed"), done: true },
    { label: t("store.steps.paid"), done: paid || pay.status === "refunded" },
    ...(middle ? [{ label: t.dynamic(`store.orderStatus.${middle}`), done: o.status === middle || o.status === "completed" || (middle === "ready" && o.status === "shipped") }] : []),
    { label: t("store.orderStatus.completed"), done: o.status === "completed" },
  ]
  const items = pay.pay_order_items.filter((i) => !(i.metadata as Record<string, unknown> | null)?.shipping)
  const shippingLines = pay.pay_order_items.filter((i) => (i.metadata as Record<string, unknown> | null)?.shipping)
  const address = [o.company, o.name, o.street, [o.postal_code, o.city].filter(Boolean).join(" "), o.country].filter(Boolean).join("\n")
  const doc = o.documents && o.documents.status !== "draft" ? o.documents : null
  const docVariant = doc?.status === "paid" ? "success" : doc?.status === "cancelled" ? "destructive" : "info"

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/shop/orders", label: t("store.orders") }, { label: `#${o.number}` }]}
        title={t("store.orderTitle", { number: String(o.number) })}
        badge={
          <span className="flex flex-wrap gap-1">
            <PayBadge t={t} status={pay.status} />
            <OrderBadge t={t} status={o.status} />
          </span>
        }
        meta={[o.placed_at && t.date(o.placed_at, { dateStyle: "medium", timeStyle: "short" }), o.name, t.money(pay.amount_total, cur)].filter(Boolean).join(" · ")}
        actions={
          <>
            {markPaid && fulfil && stepButton(fulfil, "outline")}
            {canRefund && (
              <Button variant="outline" size="sm" render={<Link href={withParams(sp, { new: "refund" })} scroll={false} />} nativeButton={false}>
                <Undo2Icon /> {t("store.refund")}
              </Button>
            )}
          </>
        }
        menu={
          canManage && (
            <ActionsMenu>
              <MenuGroup label={t("store.resendMailTitle")}>
                {MAIL_KINDS.filter((k) => k !== "refunded" || refunds.length).map((k) => (
                  <MenuSubmit key={k} form={`mail-${k}`} icon={<MailIcon />} confirm="store.confirmResend">
                    {t.dynamic(`store.mailKinds.${k}`)}
                  </MenuSubmit>
                ))}
              </MenuGroup>
              {live && o.status !== "new" && (
                <MenuSubmit form="reopen-order" icon={<RotateCcwIcon />} confirm="store.confirmReopen">
                  {t("store.reopen")}
                </MenuSubmit>
              )}
              {canCancel && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="cancel-order" icon={<BanIcon />} destructive confirm={paid ? "store.confirmCancelPaid" : "store.confirmCancel"}>
                    {t("store.cancelOrder")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
        primary={primary}
      />
      {canManage &&
        MAIL_KINDS.map((k) => (
          <form key={k} id={`mail-${k}`} action={resendMailAction} hidden>
            {hidden}
            <input type="hidden" name="kind" value={k} />
          </form>
        ))}
      {canManage && live && (
        <form id="reopen-order" action={orderStatusAction} hidden>
          {hidden}
          <input type="hidden" name="status" value="new" />
        </form>
      )}
      {canCancel && (
        <form id="cancel-order" action={cancelOrderAction} hidden>
          {hidden}
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {live && (
        <ol aria-label={t("store.steps.label")} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className={cn("h-px w-4 sm:w-8", s.done ? "bg-foreground/40" : "bg-border")} />}
              {s.done ? <CheckCircle2Icon className="size-4 text-[var(--success)]" aria-hidden /> : <CircleIcon className="size-4 text-muted-foreground" aria-hidden />}
              <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      <RecordLayout
        aside={
          <>
            <Section id="buyer" title={t("store.buyer")}>
              <DetailList
                items={[
                  {
                    label: t("store.fields.name"),
                    value: o.contacts ? (
                      <Link href={`/contacts/${o.contacts.id}`} className="underline underline-offset-4">
                        {o.name}
                      </Link>
                    ) : (
                      o.name
                    ),
                  },
                  o.company && { label: t("store.fields.company"), value: o.company },
                  pay.customer_email && {
                    label: t("store.fields.email"),
                    value: (
                      <a href={`mailto:${pay.customer_email}`} className="break-all underline underline-offset-4">
                        {pay.customer_email}
                      </a>
                    ),
                  },
                  o.phone && {
                    label: t("store.fields.phone"),
                    value: (
                      <a href={`tel:${o.phone}`} className="underline underline-offset-4">
                        {o.phone}
                      </a>
                    ),
                  },
                ]}
              />
              {o.contacts && (
                <Link href={`/shop/orders?contact=${o.contacts.id}&view=all`} className="text-sm text-[var(--link)] hover:underline">
                  {t("store.allOrdersOf")}
                </Link>
              )}
            </Section>
            <Section id="payment" title={t("store.payment")}>
              <DetailList
                items={[
                  { label: t("store.paymentMethod"), value: t.dynamic(`store.payments.${o.payment}`) },
                  { label: t("store.status"), value: <PayBadge t={t} status={pay.status} /> },
                  pay.paid_at && { label: t("store.paidAt"), value: t.date(pay.paid_at, { dateStyle: "medium", timeStyle: "short" }) },
                  !paid && live && o.payment === "transfer" && pay.expires_at && { label: t("store.heldUntilLabel"), value: t.date(pay.expires_at, { dateStyle: "medium" }) },
                ]}
              />
              {ctx.can("payments.view") && (
                <Link href={`/payments?edit=${pay.id}`} className="text-sm text-[var(--link)] hover:underline">
                  {t("store.toPayment")}
                </Link>
              )}
            </Section>
            {ctx.modules.has("invoices") && (
              <Section id="invoice" title={t("store.invoice")}>
                {doc ? (
                  <Link href={`/invoices/${doc.id}`} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted">
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{doc.number}</span>
                    <Badge variant={docVariant}>{t.dynamic(`invoices.statuses.invoice.${doc.status}`)}</Badge>
                  </Link>
                ) : (
                  <div className="grid gap-2 text-sm">
                    {o.invoice_error && <p className="text-destructive">{t.has(`errors.${o.invoice_error}`) ? t.dynamic(`errors.${o.invoice_error}`) : o.invoice_error}</p>}
                    {o.documents && (
                      <Link href={`/invoices/${o.documents.id}`} className="text-[var(--link)] hover:underline">
                        {t("store.openDraft")}
                      </Link>
                    )}
                    {!o.documents && !o.invoice_error && <p className="text-muted-foreground">{t("store.noInvoiceYet")}</p>}
                    {canManage && live && (
                      <form action={invoiceAction}>
                        {hidden}
                        <SubmitButton size="sm" variant="outline" data-confirm="store.confirmIssueInvoice">
                          {t("store.issueInvoice")}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </Section>
            )}
          </>
        }
      >
        <Section id="items" title={t("store.items")}>
          <ul className="grid divide-y text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  {i.quantity}× {i.description}
                  {i.refunded_quantity > 0 && (
                    <Badge variant="info" className="ml-2">
                      {t("store.piecesRefunded", { count: i.refunded_quantity })}
                    </Badge>
                  )}
                  {i.quantity > 1 && <span className="block text-xs text-muted-foreground">{t("store.perPiece", { amount: t.money(i.unit_amount, cur) })}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{t.money(i.quantity * i.unit_amount, cur)}</span>
              </li>
            ))}
            {shippingLines.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2 text-muted-foreground">
                <span className="min-w-0">{i.description}</span>
                <span className="shrink-0 tabular-nums">{t.money(i.quantity * i.unit_amount, cur)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 py-2 font-medium">
              <span>{t("store.total")}</span>
              <span className="tabular-nums">{t.money(pay.amount_total, cur)}</span>
            </li>
            {refunds.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2 text-muted-foreground">
                <span>
                  {t("store.refundedOn", { date: t.date(r.created_at, { dateStyle: "medium" }) })}
                  {r.status === "pending" && ` · ${t("store.refundPendingShort")}`}
                  {r.reason && <span className="block text-xs">{r.reason}</span>}
                </span>
                <span className="tabular-nums">−{t.money(r.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section
          id="delivery"
          title={t.dynamic(`store.deliveries.${o.delivery}`)}
          action={
            canManage &&
            o.status === "shipped" && (
              <Button render={<Link href={withParams(sp, { new: "shipment" })} scroll={false} />} nativeButton={false} size="sm" variant="ghost">
                {t("store.changeTracking")}
              </Button>
            )
          }
        >
          <DetailList
            items={[
              { label: t("store.status"), value: <OrderBadge t={t} status={o.status} /> },
              address && o.delivery === "shipping" && { label: t("store.shippingAddress"), value: <span className="whitespace-pre-line">{address}</span> },
              o.shipping_name && { label: t("store.shippingMethod"), value: o.shipping_name },
              o.delivery === "shipping" && { label: t("store.tracking"), value: o.tracking },
            ]}
          />
        </Section>
        {o.note && (
          <Section id="note" title={t("store.noteInternal")}>
            <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">{o.note}</p>
          </Section>
        )}
      </RecordLayout>

      {canRefund && param(sp, "new") === "refund" && (
        <UrlSheet params={["new"]} title={t("store.refundTitle", { number: String(o.number) })} meta={t("store.refundMeta", { paid: t.money(payment?.amount ?? 0, cur), left: t.money(refundLeft, cur) })}>
          <RefundForm
            orderId={o.id}
            items={pay.pay_order_items.map((i) => ({ id: i.id, description: i.description, left: i.quantity - i.refunded_quantity, unit: i.unit_amount }))}
            left={refundLeft}
            currency={cur}
            manual={o.payment !== "online"}
          />
        </UrlSheet>
      )}
      {canManage && live && o.delivery === "shipping" && param(sp, "new") === "shipment" && (
        <UrlSheet params={["new"]} title={o.status === "shipped" ? t("store.changeTracking") : t("store.markShipped")} description={o.status === "shipped" ? undefined : t("store.shipHint")}>
          <form action={orderStatusAction} className="grid gap-4">
            {hidden}
            <input type="hidden" name="status" value="shipped" />
            <div className="grid gap-2">
              <Label htmlFor="tracking">{t("store.tracking")}</Label>
              <Input id="tracking" name="tracking" maxLength={300} defaultValue={o.tracking ?? ""} placeholder={t("store.trackingPlaceholder")} autoFocus />
            </div>
            <SaveBar label={o.status === "shipped" ? t("store.saveTracking") : t("store.markShipped")} always />
          </form>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
