"use client"

import { useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusCircleIcon, XIcon } from "lucide-react"
import { ContactPicker } from "@/components/contact-picker"
import { DateInput } from "@/components/date-input"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { TAX_RATES, totals, UNITS } from "@/documents/calc"
import { parsePrice, priceInput } from "@/tickets/price"
import { recipientFor, saveDocument } from "../actions"

export type EditorDoc = {
  id: string | null // null = not created yet (/invoices/new): the first save creates the draft
  kind: "quote" | "invoice"
  title: string | null
  contact_id: string | null
  recipient_name: string | null
  recipient_address: string | null
  recipient_email: string | null
  recipient_vat_id: string | null
  issue_date: string | null
  service_from: string | null
  service_to: string | null
  due_date: string | null
  valid_until: string | null
  intro: string | null
  outro: string | null
  notes: string | null
  tax_mode: string
  currency: string
  prices_gross?: boolean
}
type Row = {
  key: number
  title: string
  description: string
  quantity: string
  unit: string
  unit_price: string
  tax_rate: number
}
type Item = {
  title: string
  description: string | null
  quantity: number
  unit: string
  unit_price: number
  tax_rate: number
}

let seq = 0
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || Number(s) || 0

/**
 * The quote / invoice draft as one form (id `doc-form`) with one SaveBar: recipient (ContactPicker fills name, address,
 * email), positions as inline rows (card on phones, one grid row from md; they go up as JSON in `items`), details and
 * texts. "Ausstellen" lives in the page header and submits this form with `formAction`.
 * `contact`: the picker's start value; undefined = the person can't see contacts (no picker).
 */
export function DocumentEditor({ doc, items, contact, defaultTax }: { doc: EditorDoc; items: Item[]; contact?: { id: string; label: string; detail: string } | null; defaultTax: number }) {
  const t = useT()
  const box = useRef<HTMLFormElement>(null)
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((i) => ({
      key: ++seq,
      title: i.title,
      description: i.description ?? "",
      quantity: t.number(Number(i.quantity)),
      unit: i.unit,
      unit_price: priceInput(i.unit_price),
      tax_rate: Number(i.tax_rate),
    })),
  )
  const [small, setSmall] = useState(doc.tax_mode === "small_business")
  const [recipient, setRecipient] = useState({
    name: doc.recipient_name ?? "",
    address: doc.recipient_address ?? "",
    email: doc.recipient_email ?? "",
  })
  // The SaveBar listens for change events: adding, moving or removing a row and picking a contact are changes too.
  const changed = () => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("change", { bubbles: true })))

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const move = (i: number, d: number) => {
    setRows((rs) => {
      const next = [...rs]
      const [r] = next.splice(i, 1)
      next.splice(i + d, 0, r)
      return next
    })
    changed()
  }
  const add = () => {
    setRows((rs) => [
      ...rs,
      {
        key: ++seq,
        title: "",
        description: "",
        quantity: "1",
        unit: "flat",
        unit_price: "",
        tax_rate: small ? 0 : defaultTax,
      },
    ])
    changed()
  }
  const sum = totals(
    rows.map((r) => ({
      quantity: num(r.quantity),
      unit_price: parsePrice(r.unit_price) ?? 0,
      tax_rate: r.tax_rate,
    })),
    small,
    !!doc.prices_gross,
  )
  const money = (c: number) => t.money(c, doc.currency)
  const payload = JSON.stringify(
    rows.map((r) => ({
      title: r.title,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      unit_price: r.unit_price,
      tax_rate: small ? 0 : r.tax_rate,
    })),
  )
  const priceLabel = t(doc.prices_gross ? "invoices.unitPriceGross" : "invoices.unitPriceNet")
  const quote = doc.kind === "quote"

  return (
    <form ref={box} id="doc-form" action={saveDocument} className="grid gap-6">
      {doc.id && <input type="hidden" name="id" value={doc.id} />}
      <input type="hidden" name="kind" value={doc.kind} />
      <input type="hidden" name="items" value={payload} />

      <FormCard id="recipient" title={t("invoices.recipient")}>
        {contact !== undefined ? (
          <ContactPicker
            name="contact_id"
            label={t("invoices.contact")}
            initial={contact}
            placeholder={t("invoices.pickContact")}
            onChange={async (o) => {
              changed()
              const r = o ? await recipientFor(o.id) : null
              if (r) setRecipient(r)
            }}
          />
        ) : (
          <input type="hidden" name="contact_id" value={doc.contact_id ?? ""} />
        )}
        <div className="grid gap-2">
          <Label htmlFor="d-rname">{t("invoices.recipientName")}</Label>
          <Input id="d-rname" name="recipient_name" value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} maxLength={200} autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="d-raddr">{t("invoices.recipientAddress")}</Label>
          <Textarea
            id="d-raddr"
            name="recipient_address"
            rows={3}
            value={recipient.address}
            onChange={(e) => setRecipient({ ...recipient, address: e.target.value })}
            maxLength={500}
            placeholder={t("invoices.addressPlaceholder")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="d-remail">{t("invoices.recipientEmail")}</Label>
            {/* key: the picked contact's email replaces the typed one (TypedInput keeps its own value). */}
            <TypedInput key={recipient.email} kind="email" id="d-remail" name="recipient_email" defaultValue={recipient.email} autoComplete="off" />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="d-rvat">{t("invoices.recipientVat")}</Label>
            <Input id="d-rvat" name="recipient_vat_id" defaultValue={doc.recipient_vat_id ?? ""} maxLength={20} placeholder="DE123456789" autoComplete="off" />
          </div>
        </div>
      </FormCard>

      <FormCard id="items" title={t("invoices.items")}>
        {rows.length > 0 && (
          <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_8.5rem_5.5rem_6.5rem_5.5rem] gap-2 text-xs text-muted-foreground md:grid">
            <span>{t("invoices.itemTitle")}</span>
            <span>{t("invoices.quantity")}</span>
            <span>{t("invoices.unit")}</span>
            <span>{priceLabel}</span>
            <span>{t("invoices.taxRate")}</span>
            <span className="text-right">{t("invoices.lineTotal")}</span>
            <span />
          </div>
        )}
        <ol className="grid gap-3 md:gap-0">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_8.5rem_5.5rem_6.5rem_5.5rem] md:items-start md:rounded-none md:border-0 md:border-t md:px-0 md:py-3"
            >
              <div className="grid gap-2">
                <Input
                  value={r.title}
                  onChange={(e) => update(r.key, { title: e.target.value })}
                  placeholder={t("invoices.itemTitle")}
                  aria-label={t("invoices.itemTitleN", { n: i + 1 })}
                  required
                  maxLength={300}
                  className="font-medium"
                />
                <Textarea
                  value={r.description}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  placeholder={t("invoices.itemDescription")}
                  aria-label={t("invoices.itemDescription")}
                  rows={1}
                  maxLength={5000}
                  className="min-h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 md:contents">
                <Input
                  value={r.quantity}
                  onChange={(e) => update(r.key, { quantity: e.target.value })}
                  inputMode="decimal"
                  aria-label={t("invoices.quantity")}
                  required
                  className="text-right tabular-nums"
                />
                <NativeSelect value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} aria-label={t("invoices.unit")} className="w-full">
                  {UNITS.map((u) => (
                    <NativeSelectOption key={u} value={u}>
                      {t.dynamic(`invoices.units.${u}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <TypedInput kind="money" defaultValue={r.unit_price} onChange={(e) => update(r.key, { unit_price: e.target.value })} aria-label={priceLabel} required className="w-full max-w-none" />
                <NativeSelect
                  value={small ? 0 : r.tax_rate}
                  disabled={small}
                  onChange={(e) => update(r.key, { tax_rate: Number(e.target.value) })}
                  aria-label={t("invoices.taxRate")}
                  className="w-full"
                >
                  {TAX_RATES.map((x) => (
                    <NativeSelectOption key={x} value={x}>
                      {x} %
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex items-center justify-between gap-2 md:contents">
                <span className="text-sm font-medium tabular-nums md:pt-2 md:text-right">{money(Math.round(num(r.quantity) * (parsePrice(r.unit_price) ?? 0)))}</span>
                <span className="flex items-center justify-end gap-0.5">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("invoices.up")} title={t("invoices.up")} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("invoices.down")} title={t("invoices.down")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("invoices.removeItem")}
                    title={t("invoices.removeItem")}
                    onClick={() => {
                      setRows((rs) => rs.filter((x) => x.key !== r.key))
                      changed()
                    }}
                  >
                    <XIcon />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={add} className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline">
          <PlusCircleIcon className="size-4" /> {t("invoices.addItem")}
        </button>
        <dl className="grid w-full grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm sm:ml-auto sm:w-auto sm:min-w-64">
          {!small && (
            <>
              <dt className="text-muted-foreground">{t("invoices.net")}</dt>
              <dd className="text-right tabular-nums">{money(sum.net)}</dd>
              {sum.taxes.map((x) => (
                <div key={x.rate} className="contents">
                  <dt className="text-muted-foreground">{t(doc.prices_gross ? "invoices.vatIncluded" : "invoices.vat", { rate: String(x.rate) })}</dt>
                  <dd className="text-right tabular-nums">{money(x.tax)}</dd>
                </div>
              ))}
            </>
          )}
          <dt className="border-t pt-1 font-semibold">{t(small ? "invoices.total" : "invoices.gross")}</dt>
          <dd className="border-t pt-1 text-right font-semibold tabular-nums">{money(sum.gross)}</dd>
        </dl>
      </FormCard>

      <FormCard id="details" title={t("invoices.details")} description={t("invoices.datesHint")}>
        <div className="grid gap-2">
          <Label htmlFor="d-title">{t("invoices.titleLabel")}</Label>
          <Input id="d-title" name="title" defaultValue={doc.title ?? ""} maxLength={200} placeholder={t(quote ? "invoices.quoteTitle" : "invoices.invoiceTitle")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="d-issue">{t("invoices.issueDate")}</Label>
            <DateInput id="d-issue" name="issue_date" type="date" defaultValue={doc.issue_date ?? ""} />
          </div>
          {quote ? (
            <div className="grid content-start gap-2">
              <Label htmlFor="d-valid">{t("invoices.validUntil")}</Label>
              <DateInput id="d-valid" name="valid_until" type="date" defaultValue={doc.valid_until ?? ""} />
            </div>
          ) : (
            <div className="grid content-start gap-2">
              <Label htmlFor="d-due">{t("invoices.dueDate")}</Label>
              <DateInput id="d-due" name="due_date" type="date" defaultValue={doc.due_date ?? ""} />
            </div>
          )}
        </div>
        {!quote && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="d-sfrom">{t("invoices.serviceFrom")}</Label>
              <DateInput id="d-sfrom" name="service_from" type="date" defaultValue={doc.service_from ?? ""} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="d-sto">{t("invoices.serviceTo")}</Label>
              <DateInput id="d-sto" name="service_to" type="date" defaultValue={doc.service_to ?? ""} />
            </div>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="tax_mode" value="small_business" checked={small} onChange={(e) => setSmall(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            {t("invoices.smallBusiness")}
            <span className="block text-xs text-muted-foreground">{t("invoices.smallBusinessHint")}</span>
          </span>
        </label>
      </FormCard>

      <FormCard id="texts" title={t("invoices.texts")}>
        <div className="grid gap-2">
          <Label htmlFor="d-intro">{t("invoices.intro")}</Label>
          <Textarea id="d-intro" name="intro" rows={3} defaultValue={doc.intro ?? ""} maxLength={5000} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="d-outro">{t("invoices.outro")}</Label>
          <Textarea id="d-outro" name="outro" rows={3} defaultValue={doc.outro ?? ""} maxLength={5000} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="d-notes">{t("invoices.notes")}</Label>
          <Textarea id="d-notes" name="notes" rows={2} defaultValue={doc.notes ?? ""} maxLength={5000} />
        </div>
      </FormCard>

      {doc.id ? <SaveBar /> : <SaveBar label={t("invoices.createDraft")} always />}
    </form>
  )
}
