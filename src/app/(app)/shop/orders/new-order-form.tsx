"use client"

import { useState, useTransition } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { ContactPicker } from "@/components/contact-picker"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { formatMoney, moneyCents } from "@/lib/inputs"
import { createTeamOrderAction, orderBuyer } from "../actions"

type Item = { id: string; label: string; price: number }
type Line = { key: number; id: string; q: number; price: string }
type Buyer = { first_name: string; last_name: string; email: string; phone: string; company: string; street: string; postal_code: string; city: string; country: string }
const EMPTY: Buyer = { first_name: "", last_name: "", email: "", phone: "", company: "", street: "", postal_code: "", city: "", country: "DE" }
type Mode = "none" | "crm" | "new"

/**
 * "Neue Bestellung" for sales outside the online shop: no buyer (merch table), a CRM contact (search; its details
 * can be completed and are saved back) or a new contact (created). Items at editable prices, delivery, paid now
 * (cash / transfer) or open, done already, invoice, mail.
 */
export function NewOrderForm({ items, currency, initialItem }: { items: Item[]; currency: string; initialItem?: string | null }) {
  const t = useT()
  const first = items.find((i) => i.id === initialItem)
  const [mode, setMode] = useState<Mode>("none")
  const [contact, setContact] = useState<string | null>(null)
  const [buyer, setBuyer] = useState<Buyer>(EMPTY)
  const [lines, setLines] = useState<Line[]>([{ key: 1, id: first?.id ?? "", q: 1, price: first ? formatMoney(first.price) : "" }])
  const [delivery, setDelivery] = useState("pickup")
  const [paid, setPaid] = useState<"cash" | "transfer" | "">("cash")
  const [invoice, setInvoice] = useState<boolean | null>(null) // null = follow the default (a buyer with an address)
  const [loading, start] = useTransition()
  const set = (k: keyof Buyer) => (e: React.ChangeEvent<HTMLInputElement>) => setBuyer({ ...buyer, [k]: e.target.value })
  const total = lines.reduce((s, l) => s + l.q * (moneyCents(l.price) ?? 0), 0)
  const withBuyer = mode !== "none" && (mode === "new" || !!contact)
  const wantInvoice = invoice ?? (withBuyer && !!buyer.street && !!buyer.city)
  const segment = (name: string, value: string, current: string, onPick: (v: string) => void, label: string) => (
    <label key={value} className="cursor-pointer rounded-md px-3 py-1.5 text-sm has-checked:bg-background has-checked:shadow-sm">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} className="sr-only" />
      {label}
    </label>
  )
  const field = (k: keyof Buyer, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`o-${k}`}>{label}</Label>
      <Input id={`o-${k}`} name={k} value={buyer[k]} onChange={set(k)} disabled={loading} {...props} />
    </div>
  )

  return (
    <form action={createTeamOrderAction} className="grid gap-6">
      <input type="hidden" name="contact_id" value={mode === "crm" ? (contact ?? "") : ""} />
      <input type="hidden" name="invoice" value={wantInvoice ? "1" : ""} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.id).map((l) => ({ id: l.id, q: l.q, p: moneyCents(l.price) ?? 0 })))} />

      <FormCard title={t("store.buyer")}>
        <div role="radiogroup" aria-label={t("store.buyer")} className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
          {segment("buyer", "none", mode, (v) => setMode(v as Mode), t("store.teamOrder.buyerNone"))}
          {segment("buyer", "crm", mode, (v) => setMode(v as Mode), t("store.teamOrder.buyerCrm"))}
          {segment("buyer", "new", mode, (v) => (setMode(v as Mode), setContact(null), setBuyer(EMPTY)), t("store.teamOrder.buyerNew"))}
        </div>
        {mode === "none" && <p className="text-sm text-muted-foreground">{t("store.teamOrder.buyerNoneHint")}</p>}
        {mode === "crm" && (
          <ContactPicker
            name="_contact"
            label={t("store.teamOrder.buyerCrm")}
            placeholder={t("store.teamOrder.searchCrm")}
            noCreate
            onChange={(c) => {
              setContact(c?.id ?? null)
              if (!c) return setBuyer(EMPTY)
              start(async () => setBuyer({ ...EMPTY, ...((await orderBuyer(c.id)) ?? {}) }))
            }}
          />
        )}
        {withBuyer && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("first_name", t("store.teamOrder.firstName"))}
              {field("last_name", t("store.teamOrder.lastName"))}
              {field("email", t("store.teamOrder.email"), { type: "email" })}
              {field("phone", t("store.teamOrder.phone"), { type: "tel" })}
              {field("company", t("store.teamOrder.company"))}
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_5rem]">
              {field("street", t("store.teamOrder.street"), { required: delivery === "shipping" })}
              {field("postal_code", t("store.teamOrder.postalCode"), { required: delivery === "shipping" })}
              {field("city", t("store.teamOrder.city"), { required: delivery === "shipping" })}
              {field("country", t("store.teamOrder.country"), { maxLength: 2, className: "uppercase" })}
            </div>
            <p className="text-xs text-muted-foreground">{t(mode === "new" ? "store.teamOrder.newHint" : "store.teamOrder.crmHint")}</p>
          </>
        )}
      </FormCard>

      <FormCard title={t("store.items")}>
        <ul className="grid gap-2">
          {lines.map((l, i) => (
            <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem_7rem_auto] items-center gap-2">
              <NativeSelect
                aria-label={t("store.teamOrder.item")}
                value={l.id}
                className="w-full"
                onChange={(e) => {
                  const it = items.find((x) => x.id === e.target.value)
                  setLines(lines.map((x, j) => (j === i ? { ...x, id: e.target.value, price: it ? formatMoney(it.price) : x.price } : x)))
                }}
              >
                <NativeSelectOption value="">{t("store.teamOrder.pickItem")}</NativeSelectOption>
                {items.map((it) => (
                  <NativeSelectOption key={it.id} value={it.id}>
                    {it.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input aria-label={t("store.stock")} type="number" min={1} max={1000} value={l.q} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, q: Math.max(1, Number(e.target.value) || 1) } : x)))} />
              <TypedInput kind="money" aria-label={t("store.teamOrder.unitPrice")} value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.currentTarget.value } : x)))} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("store.teamOrder.removeItem")} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { key: Date.now(), id: "", q: 1, price: "" }])}>
            <PlusIcon /> {t("store.teamOrder.addItem")}
          </Button>
          <span className="text-sm font-medium tabular-nums">{t("store.teamOrder.total", { amount: t.money(total, currency) })}</span>
        </div>
      </FormCard>

      <FormCard title={t("store.delivery")}>
        <div role="radiogroup" aria-label={t("store.delivery")} className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
          {["pickup", ...(withBuyer ? ["shipping"] : []), "digital"].map((d) => segment("delivery", d, delivery, setDelivery, t.dynamic(`store.deliveries.${d}`)))}
        </div>
        {delivery === "shipping" && (
          <div className="grid gap-2 sm:max-w-48">
            <Label htmlFor="o-ship">{t("store.teamOrder.shipping")}</Label>
            <TypedInput kind="money" id="o-ship" name="shipping" />
          </div>
        )}
      </FormCard>

      <FormCard title={t("store.payment")}>
        <div role="radiogroup" aria-label={t("store.payment")} className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
          {segment("paid", "cash", paid, (v) => setPaid(v as "cash"), t("store.teamOrder.paidCash"))}
          {segment("paid", "transfer", paid, (v) => setPaid(v as "transfer"), t("store.teamOrder.paidTransfer"))}
          {segment("paid", "", paid, () => setPaid(""), t("store.teamOrder.open"))}
        </div>
        {!paid && (
          <NativeSelect name="payment" defaultValue={delivery === "pickup" ? "pickup" : "transfer"} aria-label={t("store.teamOrder.openHow")} className="w-full sm:w-72">
            {delivery === "pickup" && <NativeSelectOption value="pickup">{t("store.payments.pickup")}</NativeSelectOption>}
            <NativeSelectOption value="transfer">{t("store.payments.transfer")}</NativeSelectOption>
          </NativeSelect>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="done" value="1" defaultChecked className="size-4 accent-primary" />
          {t("store.teamOrder.done")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wantInvoice} onChange={(e) => setInvoice(e.target.checked)} className="size-4 accent-primary" />
          {t("store.teamOrder.invoice")}
        </label>
        <p className="text-xs text-muted-foreground">{t("store.teamOrder.invoiceHint")}</p>
      </FormCard>

      <FormCard title={t("store.teamOrder.more")}>
        <Textarea name="note" rows={2} maxLength={2000} placeholder={t("store.teamOrder.notePlaceholder")} aria-label={t("store.teamOrder.notePlaceholder")} />
        {withBuyer && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify" value="1" disabled={!buyer.email} className="size-4 accent-primary" />
            {t("store.teamOrder.notify")}
          </label>
        )}
      </FormCard>

      <SaveBar label={t("store.teamOrder.create")} always />
    </form>
  )
}
