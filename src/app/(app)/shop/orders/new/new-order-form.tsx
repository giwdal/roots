"use client"

import { useRef, useState, useTransition } from "react"
import { PlusCircleIcon, Trash2Icon } from "lucide-react"
import { Segment, SegmentGroup } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { FormCard } from "@/components/page"
import { RecordPicker, type PickerOption } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { formatMoney, moneyCents } from "@/lib/inputs"
import { createTeamOrderAction, orderBuyer, searchOrderItems } from "../../actions"

export type OrderItem = PickerOption & { price: number }
type Line = { key: number; item: OrderItem | null; q: string; price: string }
type Buyer = { first_name: string; last_name: string; email: string; phone: string; company: string; street: string; postal_code: string; city: string; country: string }
const EMPTY: Buyer = { first_name: "", last_name: "", email: "", phone: "", company: "", street: "", postal_code: "", city: "", country: "DE" }
type Mode = "none" | "crm" | "new"

/**
 * "Neue Bestellung" for sales outside the online shop, in the order people think about it: what was sold (search the
 * products), who bought it (nobody = merch table, a CRM contact whose details are saved back, or a new contact), how it
 * gets to them, whether it's paid, done already, invoice, mail.
 */
export function NewOrderForm({ currency, initialItem }: { currency: string; initialItem?: OrderItem | null }) {
  const t = useT()
  const next = useRef(2)
  const [mode, setMode] = useState<Mode>("none")
  const [contact, setContact] = useState<string | null>(null)
  const [buyer, setBuyer] = useState<Buyer>(EMPTY)
  const [lines, setLines] = useState<Line[]>([{ key: 1, item: initialItem ?? null, q: "1", price: initialItem ? formatMoney(initialItem.price) : "" }])
  const [delivery, setDelivery] = useState("pickup")
  const [paid, setPaid] = useState<"cash" | "transfer" | "">("cash")
  const [openHow, setOpenHow] = useState<"pickup" | "transfer">("pickup")
  const [invoice, setInvoice] = useState<boolean | null>(null) // null = follow the default (a buyer with an address)
  const [doneWish, setDone] = useState(true)
  const [loading, start] = useTransition()
  const set = (k: keyof Buyer) => (e: React.ChangeEvent<HTMLInputElement>) => setBuyer({ ...buyer, [k]: e.target.value })
  const qty = (l: Line) => Math.max(1, Math.min(1000, Math.trunc(Number(l.q)) || 1))
  const total = lines.reduce((s, l) => s + (l.item ? qty(l) * (moneyCents(l.price) ?? 0) : 0), 0)
  const withBuyer = mode !== "none" && (mode === "new" || !!contact)
  // Free orders never get an invoice; an open order can't be "erledigt" yet (completed once the money came).
  const free = total === 0 && lines.some((l) => l.item)
  const wantInvoice = !free && (invoice ?? (withBuyer && !!buyer.street && !!buyer.city))
  const canDone = !!paid || free
  const done = canDone && doneWish
  const how = delivery === "pickup" ? openHow : "transfer"
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const field = (k: keyof Buyer, label: string, props: Omit<React.ComponentProps<typeof Input>, "kind"> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`o-${k}`}>{label}</Label>
      <Input id={`o-${k}`} name={k} value={buyer[k]} onChange={set(k)} disabled={loading} {...props} />
    </div>
  )
  const typed = (k: "email" | "phone", label: string) => (
    <div className="grid gap-2">
      <Label htmlFor={`o-${k}`}>{label}</Label>
      <TypedInput kind={k} id={`o-${k}`} name={k} value={buyer[k]} onChange={set(k)} disabled={loading} className="w-full" />
    </div>
  )

  return (
    <form action={createTeamOrderAction} className="grid gap-6">
      <input type="hidden" name="contact_id" value={mode === "crm" ? (contact ?? "") : ""} />
      <input type="hidden" name="invoice" value={wantInvoice ? "1" : ""} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.item).map((l) => ({ id: l.item!.id, q: qty(l), p: moneyCents(l.price) ?? 0 })))} />

      <FormCard title={t("store.items")}>
        <ul className="grid gap-3">
          {lines.map((l) => (
            <li key={l.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_auto] sm:items-end sm:border-0 sm:p-0">
              <RecordPicker
                name={`_item_${l.key}`}
                label={t("store.teamOrder.item")}
                placeholder={t("store.teamOrder.pickItem")}
                search={searchOrderItems}
                initial={l.item}
                onChange={(picked) => {
                  const it = picked as OrderItem | null
                  update(l.key, { item: it, price: it ? formatMoney(it.price) : l.price })
                }}
              />
              <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-end gap-2 sm:contents">
                <div className="grid gap-2">
                  <Label htmlFor={`o-q-${l.key}`}>{t("store.teamOrder.quantity")}</Label>
                  <TypedInput kind="number" id={`o-q-${l.key}`} min={1} max={1000} value={l.q} onChange={(e) => update(l.key, { q: e.currentTarget.value })} className="w-full" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`o-p-${l.key}`}>{t("store.teamOrder.unitPrice")}</Label>
                  <TypedInput kind="money" id={`o-p-${l.key}`} value={l.price} onChange={(e) => update(l.key, { price: e.currentTarget.value })} className="w-full" />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={t("store.teamOrder.removeItem")} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setLines((ls) => [...ls, { key: next.current++, item: null, q: "1", price: "" }])} className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline">
            <PlusCircleIcon className="size-4" /> {t("store.teamOrder.addItem")}
          </button>
          <span className="text-sm font-medium tabular-nums">{t("store.teamOrder.total", { amount: t.money(total, currency) })}</span>
        </div>
      </FormCard>

      <FormCard title={t("store.buyer")}>
        <SegmentGroup label={t("store.buyer")}>
          <Segment name="buyer" value="none" label={t("store.teamOrder.buyerNone")} checked={mode === "none"} onPick={() => setMode("none")} />
          <Segment name="buyer" value="crm" label={t("store.teamOrder.buyerCrm")} checked={mode === "crm"} onPick={() => setMode("crm")} />
          <Segment name="buyer" value="new" label={t("store.teamOrder.buyerNew")} checked={mode === "new"} onPick={() => (setMode("new"), setContact(null), setBuyer(EMPTY))} />
        </SegmentGroup>
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
              {field("first_name", t("store.teamOrder.firstName"), { autoComplete: "off" })}
              {field("last_name", t("store.teamOrder.lastName"), { autoComplete: "off" })}
              {typed("email", t("store.teamOrder.email"))}
              {typed("phone", t("store.teamOrder.phone"))}
              {field("company", t("store.teamOrder.company"))}
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_5rem]">
              {field("street", t("store.teamOrder.street"), { required: delivery === "shipping" })}
              {field("postal_code", t("store.teamOrder.postalCode"), { required: delivery === "shipping", inputMode: "numeric" })}
              {field("city", t("store.teamOrder.city"), { required: delivery === "shipping" })}
              {field("country", t("store.teamOrder.country"), { maxLength: 2, className: "uppercase" })}
            </div>
            <p className="text-xs text-muted-foreground">{t(mode === "new" ? "store.teamOrder.newHint" : "store.teamOrder.crmHint")}</p>
          </>
        )}
      </FormCard>

      <FormCard title={t("store.delivery")}>
        <SegmentGroup label={t("store.delivery")}>
          {["pickup", ...(withBuyer ? ["shipping"] : []), "digital"].map((d) => (
            <Segment key={d} name="delivery" value={d} label={t.dynamic(`store.deliveries.${d}`)} checked={delivery === d} onPick={setDelivery} />
          ))}
        </SegmentGroup>
        {delivery === "shipping" && (
          <div className="grid gap-2 sm:max-w-48">
            <Label htmlFor="o-ship">{t("store.teamOrder.shipping")}</Label>
            <TypedInput kind="money" id="o-ship" name="shipping" />
          </div>
        )}
      </FormCard>

      <FormCard title={t("store.payment")}>
        <SegmentGroup label={t("store.payment")}>
          <Segment name="paid" value="cash" label={t("store.teamOrder.paidCash")} checked={paid === "cash"} onPick={() => setPaid("cash")} />
          <Segment name="paid" value="transfer" label={t("store.teamOrder.paidTransfer")} checked={paid === "transfer"} onPick={() => setPaid("transfer")} />
          <Segment name="paid" value="" label={t("store.teamOrder.open")} checked={paid === ""} onPick={() => setPaid("")} />
        </SegmentGroup>
        {!paid && (
          <div className="grid gap-2">
            <Label>{t("store.teamOrder.openHow")}</Label>
            <SegmentGroup label={t("store.teamOrder.openHow")}>
              {delivery === "pickup" && <Segment name="payment" value="pickup" label={t("store.payments.pickup")} checked={how === "pickup"} onPick={() => setOpenHow("pickup")} />}
              <Segment name="payment" value="transfer" label={t("store.payments.transfer")} checked={how === "transfer"} onPick={() => setOpenHow("transfer")} />
            </SegmentGroup>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm has-disabled:text-muted-foreground">
          <input type="checkbox" name="done" value="1" checked={done} disabled={!canDone} onChange={(e) => setDone(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            {t("store.teamOrder.done")}
            {!canDone && <span className="block text-xs text-muted-foreground">{t("store.teamOrder.doneOpenHint")}</span>}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm has-disabled:text-muted-foreground">
          <input type="checkbox" checked={wantInvoice} disabled={free} onChange={(e) => setInvoice(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            {t("store.teamOrder.invoice")}
            <span className="block text-xs text-muted-foreground">{t(free ? "store.teamOrder.invoiceFree" : "store.teamOrder.invoiceHint")}</span>
          </span>
        </label>
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

      <SaveBar label={total ? `${t("store.teamOrder.create")} · ${t.money(total, currency)}` : t("store.teamOrder.create")} always />
    </form>
  )
}
