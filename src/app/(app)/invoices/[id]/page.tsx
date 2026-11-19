import Link from "next/link"
import { notFound } from "next/navigation"
import { BanIcon, BookOpenIcon, CheckIcon, CopyIcon, FileDownIcon, FileOutputIcon, FileTextIcon, PrinterIcon, ShoppingBagIcon, Trash2Icon, Undo2Icon, WalletIcon, XIcon } from "lucide-react"
import { ActionsMenu, MenuDownload, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { DetailList } from "@/components/detail-list"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader, RecordLayout } from "@/components/page"
import { Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { lineNet, totals } from "@/documents/calc"
import { contactName } from "@/app/(app)/contacts/fields"
import { cancelInvoice, copyDocument, deleteDraft, issueDocument, setDocumentStatus } from "../actions"
import { DocBadge, isOverdue } from "../badges"
import { DocumentEditor } from "./editor"

const UUID = /^[0-9a-f-]{36}$/

// One quote / invoice. A draft opens as its editor (one form + SaveBar, "Ausstellen" as the header's main button,
// asked first: number + frozen). An issued document opens on its state: badge, amount, due date, the next step
// (Als bezahlt markieren / In Rechnung umwandeln) as the main button, then positions, recipient and its connections
// (shop order, payment, cash book entries, source / derived documents).
export default async function DocumentPage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  const ctx = await requirePerm("invoices.view")
  const { id } = await params
  if (!ctx.modules.has("invoices") || !UUID.test(id)) notFound()
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("invoices.manage")
  const on = (module: string, perm: string) => ctx.modules.has(module) && ctx.can(perm)
  const none = Promise.resolve({ data: null })
  const [{ data: doc }, { data: billing }, { data: derived }, { data: cash }, { data: shopOrder }] = await Promise.all([
    ctx.supabase.from("documents").select("*, document_items(*)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("org_billing").select("legal_name, street, city, tax_number, vat_id, tax_mode").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("documents").select("id, kind, status, number, due_date").eq("org_id", ctx.org.id).eq("source_id", id).order("created_at"),
    on("cashbook", "cashbook.view")
      ? ctx.supabase.from("cash_entries").select("id, number, account_id, booked_on, amount_cents, cash_accounts(name)").eq("org_id", ctx.org.id).eq("document_id", id).order("booked_on")
      : none,
    // A shop invoice follows its order (paid / refunded / cancelled there).
    ctx.modules.has("shop") ? ctx.supabase.from("shop_orders").select("id, number, order_id").eq("org_id", ctx.org.id).eq("invoice_id", id).maybeSingle() : none,
  ])
  if (!doc) notFound()
  const [{ data: source }, { data: contact }] = await Promise.all([
    doc.source_id ? ctx.supabase.from("documents").select("id, kind, status, number").eq("id", doc.source_id).eq("org_id", ctx.org.id).maybeSingle() : none,
    doc.contact_id && on("crm", "crm.view") ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", doc.contact_id).eq("org_id", ctx.org.id).maybeSingle() : none,
  ])
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  })
  const draft = doc.status === "draft"
  const editing = draft && canManage
  const kind = doc.kind as "invoice" | "quote" | "cancellation"
  const title = `${t.dynamic(`invoices.docTitles.${kind}`)} ${doc.number ?? ""}`.trim()
  const money = (c: number) => t.money(c, doc.currency)
  const day = (d: string | null) => (d ? t.date(`${d.slice(0, 10)}T12:00:00Z`) : null)
  const items = [...doc.document_items].sort((a, b) => a.position - b.position)
  const overdue = isOverdue(doc, today)
  // Shop invoices are paid, refunded and cancelled with their order, never on their own.
  const own = !shopOrder
  const canCancel = canManage && own && kind === "invoice" && (doc.status === "sent" || doc.status === "paid")
  const billingMissing = !billing?.legal_name || !billing.street || !billing.city || (kind === "invoice" && !billing.tax_number && !billing.vat_id)
  const hidden = <input type="hidden" name="id" value={doc.id} />

  const statusForm = (status: string, label: string, icon: React.ReactNode, confirm?: string, variant: "default" | "outline" = "default") => (
    <form action={setDocumentStatus}>
      {hidden}
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant} data-confirm={confirm}>
        {icon} {label}
      </SubmitButton>
    </form>
  )
  const toInvoice = (
    <form action={copyDocument}>
      {hidden}
      <input type="hidden" name="as" value="invoice" />
      <SubmitButton size="sm">
        <FileOutputIcon /> {t("invoices.toInvoice")}
      </SubmitButton>
    </form>
  )
  // The next step of an issued document is the header's main button.
  const primary = editing ? (
    <SubmitButton size="sm" form="doc-form" formAction={issueDocument} data-confirm={kind === "quote" ? "invoices.confirmIssueQuote" : "invoices.confirmIssue"}>
      <CheckIcon /> {t(kind === "quote" ? "invoices.issueQuote" : "invoices.issueInvoice")}
    </SubmitButton>
  ) : !canManage ? undefined : kind === "invoice" && own && doc.status === "sent" ? (
    statusForm("paid", t("invoices.markPaid"), <WalletIcon />, "invoices.confirmPaid")
  ) : kind === "quote" && (doc.status === "sent" || doc.status === "accepted") ? (
    toInvoice
  ) : undefined

  const preview = (
    <Button render={<a href={`/print/documents/${doc.id}`} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
      <PrinterIcon /> {t("invoices.pdf")}
    </Button>
  )
  const links = (
    [
      source && {
        key: source.id,
        href: `/invoices/${source.id}`,
        icon: FileTextIcon,
        title: `${t.dynamic(`invoices.docTitles.${source.kind}`)} ${source.number ?? ""}`.trim(),
        detail: t(kind === "cancellation" ? "invoices.link.cancels" : "invoices.link.source"),
        badge: <DocBadge t={t} doc={source} today={today} />,
      },
      ...(derived ?? []).map((d) => ({
        key: d.id,
        href: `/invoices/${d.id}`,
        icon: FileTextIcon,
        title: `${t.dynamic(`invoices.docTitles.${d.kind}`)} ${d.number ?? ""}`.trim(),
        detail: t(d.kind === "cancellation" ? "invoices.link.cancelledBy" : "invoices.link.derived"),
        badge: <DocBadge t={t} doc={d} today={today} />,
      })),
      shopOrder &&
        on("shop", "shop.view") && {
          key: shopOrder.id,
          href: `/shop/orders/${shopOrder.id}`,
          icon: ShoppingBagIcon,
          title: t("invoices.fromShopOrder", {
            number: String(shopOrder.number),
          }),
          detail: t("invoices.link.shopOrder"),
        },
      shopOrder &&
        on("payments", "payments.view") && {
          key: shopOrder.order_id,
          href: `/payments?edit=${shopOrder.order_id}`,
          icon: WalletIcon,
          title: t("invoices.link.payment"),
          detail: t("invoices.link.paymentDetail"),
        },
      ...(cash ?? []).map((e) => ({
        key: e.id,
        href: `/cashbook?account=${e.account_id}&month=${e.booked_on.slice(0, 7)}&edit=${e.id}`,
        icon: BookOpenIcon,
        title: `${e.number ?? ""} · ${money(e.amount_cents)}`,
        detail: [e.cash_accounts?.name, day(e.booked_on)].filter(Boolean).join(" · "),
      })),
    ] as (LinkRow | false | null | undefined | "")[]
  ).filter((x): x is LinkRow => !!x)
  const sum = totals(
    items.map((i) => ({
      quantity: Number(i.quantity),
      unit_price: i.unit_price,
      tax_rate: Number(i.tax_rate),
    })),
    doc.tax_mode === "small_business",
    doc.prices_gross,
  )

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: `/invoices?kind=${kind}`, label: t("invoices.nav") }, { label: title }]}
        title={title}
        badge={<DocBadge t={t} doc={doc} today={today} />}
        meta={doc.recipient_name || undefined}
        actions={
          <>
            {preview}
            {canManage && kind === "quote" && doc.status === "sent" && statusForm("accepted", t("invoices.markAccepted"), <CheckIcon />, undefined, "outline")}
          </>
        }
        menu={
          <ActionsMenu>
            <MenuDownload href={`/print/documents/${doc.id}/pdf`} icon={<FileDownIcon />}>
              {t("invoices.pdfDownload")}
            </MenuDownload>
            {canManage && !draft && kind !== "cancellation" && (
              <MenuSubmit form="copy-doc" icon={<CopyIcon />}>
                {t("invoices.duplicate")}
              </MenuSubmit>
            )}
            {canManage && own && kind === "invoice" && doc.status === "paid" && (
              <MenuSubmit form="mark-unpaid" icon={<Undo2Icon />} confirm="invoices.confirmUnpaid">
                {t("invoices.markUnpaid")}
              </MenuSubmit>
            )}
            {canManage && kind === "quote" && doc.status === "sent" && (
              <MenuSubmit form="mark-declined" icon={<XIcon />} confirm="invoices.confirmDeclined">
                {t("invoices.markDeclined")}
              </MenuSubmit>
            )}
            {canCancel && (
              <>
                <MenuSeparator />
                <MenuSubmit form="cancel-invoice" icon={<BanIcon />} destructive confirm="invoices.confirmCancel">
                  {t("invoices.cancel")}
                </MenuSubmit>
              </>
            )}
            {editing && (
              <>
                <MenuSeparator />
                <MenuSubmit form="delete-draft" icon={<Trash2Icon />} destructive confirm="common.confirmDelete">
                  {t("invoices.deleteDraft")}
                </MenuSubmit>
              </>
            )}
          </ActionsMenu>
        }
        primary={primary}
      />
      {canManage && (
        <>
          <form id="copy-doc" action={copyDocument} hidden>
            {hidden}
          </form>
          <form id="mark-unpaid" action={setDocumentStatus} hidden>
            {hidden}
            <input type="hidden" name="status" value="sent" />
          </form>
          <form id="mark-declined" action={setDocumentStatus} hidden>
            {hidden}
            <input type="hidden" name="status" value="declined" />
          </form>
        </>
      )}
      {canCancel && (
        <form id="cancel-invoice" action={cancelInvoice} hidden>
          {hidden}
        </form>
      )}
      {editing && (
        <form id="delete-draft" action={deleteDraft} hidden>
          {hidden}
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {/* Phones: the next step as a full-width button under the header (the top bar only has the ⋯). */}
      {primary && <div className="grid md:hidden [&_button]:h-(--control) [&_button]:w-full [&_form]:grid">{primary}</div>}

      {editing ? (
        <>
          {billingMissing && (
            <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
              {t("invoices.billingMissing")}{" "}
              <Link href="/invoices/settings" className="link">
                {t("invoices.settings")}
              </Link>
            </p>
          )}
          <DocumentEditor
            doc={{ ...doc, kind: kind as "quote" | "invoice" }}
            items={items.map((i) => ({
              ...i,
              quantity: Number(i.quantity),
              tax_rate: Number(i.tax_rate),
            }))}
            contact={
              on("crm", "crm.view")
                ? contact
                  ? {
                      id: contact.id,
                      label: contactName(contact),
                      detail: contact.email ?? "",
                    }
                  : null
                : undefined
            }
            defaultTax={billing?.tax_mode === "small_business" ? 0 : 19}
          />
        </>
      ) : (
        <>
          <Stats>
            <Stat label={t("invoices.gross")} value={money(doc.gross_total)} />
            <Stat label={t("invoices.issueDate")} value={day(doc.issue_date) ?? "–"} />
            {kind === "invoice" && (
              <Stat label={t("invoices.dueDate")} value={day(doc.due_date) ?? "–"} tone={overdue ? "warn" : undefined} hint={overdue ? t("invoices.filters.overdue") : undefined} />
            )}
            {kind === "quote" && <Stat label={t("invoices.validUntil")} value={day(doc.valid_until) ?? "–"} />}
            {doc.paid_at && <Stat label={t("invoices.paidAt")} value={day(doc.paid_at)} tone="good" />}
          </Stats>
          <RecordLayout
            aside={
              <>
                <Section id="recipient" title={t("invoices.recipient")}>
                  <DetailList
                    items={[
                      {
                        label: t("invoices.recipientName"),
                        value: contact ? (
                          <Link href={`/contacts/${contact.id}`} className="link">
                            {doc.recipient_name || contactName(contact)}
                          </Link>
                        ) : (
                          doc.recipient_name
                        ),
                      },
                      doc.recipient_address && {
                        label: t("invoices.recipientAddress"),
                        value: <span className="whitespace-pre-line">{doc.recipient_address}</span>,
                      },
                      doc.recipient_email && {
                        label: t("invoices.recipientEmail"),
                        value: (
                          <a href={`mailto:${doc.recipient_email}`} className="link break-all">
                            {doc.recipient_email}
                          </a>
                        ),
                      },
                      doc.recipient_vat_id && {
                        label: t("invoices.vatId"),
                        value: doc.recipient_vat_id,
                      },
                      (doc.service_from || doc.service_to) && {
                        label: t("invoices.serviceDate"),
                        value: [day(doc.service_from), day(doc.service_to)].filter(Boolean).join(" – "),
                      },
                    ]}
                  />
                  {contact && (
                    <Link href={`/invoices?contact=${contact.id}`} className="link text-sm">
                      {t("invoices.allOfContact")}
                    </Link>
                  )}
                </Section>
                {links.length > 0 && (
                  <Section id="links" title={t("invoices.links")}>
                    <LinkRows rows={links} />
                  </Section>
                )}
              </>
            }
          >
            <Section id="items" title={t("invoices.items")}>
              <ul className="grid divide-y text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{i.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t.number(Number(i.quantity))} {t.has(`invoices.units.${i.unit}`) ? t.dynamic(`invoices.units.${i.unit}`) : i.unit} × {money(i.unit_price)}
                        {doc.tax_mode !== "small_business" && ` · ${t.number(Number(i.tax_rate))} %`}
                      </span>
                      {i.description && <span className="block text-xs whitespace-pre-line text-muted-foreground">{i.description}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {money(
                        lineNet({
                          quantity: Number(i.quantity),
                          unit_price: i.unit_price,
                          tax_rate: Number(i.tax_rate),
                        }),
                      )}
                    </span>
                  </li>
                ))}
                {doc.tax_mode !== "small_business" && !doc.prices_gross && (
                  <li className="flex justify-between gap-3 py-2 text-muted-foreground">
                    <span>{t("invoices.net")}</span>
                    <span className="tabular-nums">{money(sum.net)}</span>
                  </li>
                )}
                {doc.tax_mode !== "small_business" &&
                  sum.taxes.map((x) => (
                    <li key={x.rate} className="flex justify-between gap-3 py-2 text-muted-foreground">
                      <span>{t(doc.prices_gross ? "invoices.vatIncluded" : "invoices.vat", { rate: String(x.rate) })}</span>
                      <span className="tabular-nums">{money(x.tax)}</span>
                    </li>
                  ))}
                <li className="flex justify-between gap-3 py-2 font-medium">
                  <span>{t("invoices.gross")}</span>
                  <span className="tabular-nums">{money(doc.gross_total)}</span>
                </li>
              </ul>
            </Section>
            {doc.notes && (
              <Section id="notes" title={t("invoices.notesTitle")}>
                <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">{doc.notes}</p>
              </Section>
            )}
          </RecordLayout>
        </>
      )}
    </Page>
  )
}

export const instant = false
