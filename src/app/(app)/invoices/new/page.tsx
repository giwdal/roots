import { notFound } from "next/navigation"
import { CheckIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { addDays, billing as loadBilling, recipientOf, today } from "@/documents/drafts"
import { contactName } from "@/app/(app)/contacts/fields"
import { issueDocument } from "../actions"
import { DocumentEditor } from "../[id]/editor"

const UUID = /^[0-9a-f-]{36}$/

// "+ Neue Rechnung" / "Neues Angebot": the draft editor with the org's defaults, nothing stored yet. "Entwurf anlegen"
// (SaveBar) or "Ausstellen" (header) create the document; leaving the page leaves nothing behind.
// ?kind=quote → a quote; ?contact=<id> → recipient from that contact.
export default async function NewDocumentPage({ searchParams }: PageProps<"/invoices/new">) {
  const ctx = await requirePerm("invoices.manage")
  if (!ctx.modules.has("invoices")) notFound()
  const t = await getT()
  const sp = await searchParams
  const kind = param(sp, "kind") === "quote" ? "quote" : "invoice"
  const contactId = UUID.test(param(sp, "contact") ?? "") ? param(sp, "contact")! : null
  const crm = ctx.modules.has("crm") && ctx.can("crm.view")
  const [b, recipient, { data: contact }] = await Promise.all([
    loadBilling(ctx.supabase, ctx.org.id),
    contactId ? recipientOf(ctx.supabase, ctx.org.id, contactId) : null,
    contactId && crm ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const d = today()
  const title = t(kind === "quote" ? "invoices.newQuote" : "invoices.newInvoice")

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: `/invoices?kind=${kind}`, label: t("invoices.nav") }, { label: title }]}
        title={title}
        primary={
          <SubmitButton size="sm" form="doc-form" formAction={issueDocument} data-confirm={kind === "quote" ? "invoices.confirmIssueQuote" : "invoices.confirmIssue"}>
            <CheckIcon /> {t(kind === "quote" ? "invoices.issueQuote" : "invoices.issueInvoice")}
          </SubmitButton>
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <DocumentEditor
        doc={{
          id: null,
          kind,
          title: null,
          contact_id: recipient?.contact_id ?? null,
          recipient_name: recipient?.recipient_name ?? null,
          recipient_address: recipient?.recipient_address ?? null,
          recipient_email: recipient?.recipient_email ?? null,
          recipient_vat_id: null,
          issue_date: null,
          service_from: kind === "invoice" ? d : null,
          service_to: null,
          due_date: null,
          valid_until: kind === "quote" ? addDays(d, b?.quote_days ?? 30) : null,
          intro: (kind === "quote" ? b?.quote_intro : b?.invoice_intro) ?? null,
          outro: (kind === "quote" ? b?.quote_outro : b?.invoice_outro) ?? null,
          notes: null,
          tax_mode: b?.tax_mode ?? "standard",
          currency: "eur",
        }}
        items={[
          {
            title: "",
            description: null,
            quantity: 1,
            unit: "flat",
            unit_price: 0,
            tax_rate: b?.tax_mode === "small_business" ? 0 : 19,
          },
        ]}
        contact={
          crm
            ? contact
              ? {
                  id: contact.id,
                  label: contactName(contact),
                  detail: contact.email ?? "",
                }
              : null
            : undefined
        }
        defaultTax={b?.tax_mode === "small_business" ? 0 : 19}
      />
    </Page>
  )
}

export const instant = false
