"use client"

import { useState } from "react"
import { Segment, SegmentGroup } from "@/components/choice"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"
import { STOCK_KINDS, type StockKind } from "@/shop/fields"
import { bookStockAction } from "./actions"

/** Book one stock movement: Zugang · Entnahme · Schwund · Inventur. Sales are orders (Bestellungen → Neue Bestellung). */
export function StockForm({ item, onHand, back }: { item: string; onHand: number; back: string }) {
  const t = useT()
  const [kind, setKind] = useState<StockKind>("receipt")
  return (
    <form action={bookStockAction} className="grid gap-4">
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="back" value={back} />
      <SegmentGroup label={t("store.lager.kind")}>
        {STOCK_KINDS.map((k) => (
          <Segment key={k} name="kind" value={k} label={t.dynamic(`store.lager.kinds.${k}`)} checked={kind === k} onPick={() => setKind(k)} />
        ))}
      </SegmentGroup>
      <p className="text-sm text-muted-foreground">{t.dynamic(`store.lager.hints.${kind}`)}</p>
      <div className="grid gap-2 sm:max-w-40">
        <Label htmlFor="stock-qty">{t(kind === "count" ? "store.lager.counted" : "store.lager.quantity")}</Label>
        <TypedInput kind="number" key={kind} id="stock-qty" name={kind === "count" ? "counted" : "quantity"} min={kind === "count" ? 0 : 1} defaultValue={kind === "count" ? String(onHand) : ""} required className="w-full" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="stock-note">{t("store.lager.note")}</Label>
        <Input id="stock-note" name="note" maxLength={500} placeholder={t.dynamic(`store.lager.notePlaceholder.${kind}`)} />
      </div>
      <SaveBar label={t("store.lager.book")} always />
    </form>
  )
}
