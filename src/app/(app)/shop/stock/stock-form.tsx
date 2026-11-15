"use client"

import { useState } from "react"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"
import { STOCK_KINDS, type StockKind } from "@/shop/fields"
import { bookStockAction } from "../actions"

/** Lager drawer: Zugang · Entnahme · Schwund · Inventur. Sales go through Bestellungen → Neue Bestellung. */
export function StockForm({ item, onHand }: { item: string; onHand: number }) {
  const t = useT()
  const [kind, setKind] = useState<StockKind>("receipt")
  return (
    <form action={bookStockAction} className="grid gap-4">
      <input type="hidden" name="item" value={item} />
      <div role="radiogroup" aria-label={t("store.lager.kind")} className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
        {STOCK_KINDS.map((k) => (
          <label key={k} className="cursor-pointer rounded-md px-3 py-1.5 text-sm has-checked:bg-background has-checked:shadow-sm">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {t.dynamic(`store.lager.kinds.${k}`)}
          </label>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t.dynamic(`store.lager.hints.${kind}`)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="stock-qty">{t(kind === "count" ? "store.lager.counted" : "store.lager.quantity")}</Label>
          <Input key={kind} id="stock-qty" name={kind === "count" ? "counted" : "quantity"} type="number" inputMode="numeric" min={kind === "count" ? 0 : 1} defaultValue={kind === "count" ? onHand : ""} required />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="stock-note">{t("store.lager.note")}</Label>
        <Input id="stock-note" name="note" maxLength={500} placeholder={t.dynamic(`store.lager.notePlaceholder.${kind}`)} />
      </div>
      <SubmitButton className="justify-self-start">{t("store.lager.book")}</SubmitButton>
    </form>
  )
}
