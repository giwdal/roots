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
type Buyer = { name: string; email: string; phone: string; company: string; street: string; postal_code: string; city: string; country: string }
const EMPTY: Buyer = { name: "", email: "", phone: "", company: "", street: "", postal_code: "", city: "", country: "DE" }

/**
 * "Neue Bestellung" for orders that happened offline: buyer from the CRM (search or create) or typed in, items with
 * their price (editable), delivery, paid now (cash / transfer) or still open, done already, mail to the buyer.
 */
export function NewOrderForm({ items, currency }: { items: Item[]; currency: string }) {
  const t = useT()
  const [contact, setContact] = useState<string | null>(null)
  const [buyer, setBuyer] = useState<Buyer>(EMPTY)
  const [lines, setLines] = useState<Line[]>([{ key: 1, id: "", q: 1, price: "" }])
  const [delivery, setDelivery] = useState("pickup")
  const [paid, setPaid] = useState<"cash" | "transfer" | "">("cash")
  const [loading, start] = useTransition()
  const set = (k: keyof Buyer) => (e: React.ChangeEvent<HTMLInputElement>) => setBuyer({ ...buyer, [k]: e.target.value })
  const total = lines.reduce((s, l) => s + l.q * (moneyCents(l.price) ?? 0), 0)
  const segment = (name: string, value: string, current: string, onPick: (v: string) => void, label: string) => (
    <label key={value} className="cursor-pointer rounded-md px-3 py-1.5 text-sm has-checked:bg-background has-checked:shadow-sm">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} className="sr-only" />
      {label}
    </label>
  )

  return (
    <form action={createTeamOrderAction} className="grid gap-6">
      <input type="hidden" name="contact_id" value={contact ?? ""} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.id).map((l) => ({ id: l.id, q: l.q, p: moneyCents(l.price) ?? 0 })))} />

      <FormCard title={t("store.buyer")}>
        <ContactPicker
          name="_contact"
          label={t("store.teamOrder.fromCrm")}
          placeholder={t("store.teamOrder.searchCrm")}
          onChange={(c) => {
            setContact(c?.id ?? null)
            if (c) start(async () => setBuyer({ ...EMPTY, ...((await orderBuyer(c.id)) ?? {}) }))
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="o-name">{t("store.teamOrder.name")}</Label>
            <Input id="o-name" name="name" required maxLength={200} value={buyer.name} onChange={set("name")} disabled={loading} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="o-email">{t("store.teamOrder.email")}</Label>
            <Input id="o-email" name="email" type="email" value={buyer.email} onChange={set("email")} disabled={loading} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="o-phone">{t("store.teamOrder.phone")}</Label>
            <Input id="o-phone" name="phone" type="tel" value={buyer.phone} onChange={set("phone")} disabled={loading} />
          </div>
        </div>
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
          {["pickup", "shipping", "digital"].map((d) => segment("delivery", d, delivery, setDelivery, t.dynamic(`store.deliveries.${d}`)))}
        </div>
        {delivery === "shipping" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="o-street">{t("store.teamOrder.street")}</Label>
              <Input id="o-street" name="street" required value={buyer.street} onChange={set("street")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-zip">{t("store.teamOrder.postalCode")}</Label>
              <Input id="o-zip" name="postal_code" required value={buyer.postal_code} onChange={set("postal_code")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-city">{t("store.teamOrder.city")}</Label>
              <Input id="o-city" name="city" required value={buyer.city} onChange={set("city")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-country">{t("store.teamOrder.country")}</Label>
              <Input id="o-country" name="country" maxLength={2} value={buyer.country} onChange={set("country")} className="w-20 uppercase" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-ship">{t("store.teamOrder.shipping")}</Label>
              <TypedInput kind="money" id="o-ship" name="shipping" />
            </div>
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
      </FormCard>

      <FormCard title={t("store.teamOrder.more")}>
        <Textarea name="note" rows={2} maxLength={2000} placeholder={t("store.teamOrder.notePlaceholder")} aria-label={t("store.teamOrder.notePlaceholder")} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" value="1" disabled={!buyer.email} className="size-4 accent-primary" />
          {t("store.teamOrder.notify")}
        </label>
      </FormCard>

      <SaveBar label={t("store.teamOrder.create")} always />
    </form>
  )
}
