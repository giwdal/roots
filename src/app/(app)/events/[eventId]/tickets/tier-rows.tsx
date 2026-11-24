"use client"

import { useRef, useState } from "react"
import { PlusCircleIcon, Trash2Icon } from "lucide-react"
import { DateInput } from "@/components/date-input"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"

export type TierRow = { id?: string; name: string; price: string; quota: string; sales_end: string; sold: number }

/**
 * Price tiers of a ticket type (Early Bird → Regulär …) inside the type's form: saved with its SaveBar. Order = the
 * order shown here. Each row posts tier_id / tier_name / tier_price / tier_quota / tier_end once, so the server reads
 * them by index; removed rows are deleted on save (asked first).
 */
export function TierRows({ initial }: { initial: TierRow[] }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const next = useRef(0)
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ ...r, key: r.id ?? `i${i}` })))
  // The SaveBar listens for change events inside the form: adding or removing a row is a change too.
  const changed = () => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("change", { bubbles: true })))
  const add = () => {
    setRows((r) => [...r, { key: `n${next.current++}`, name: "", price: "", quota: "", sales_end: "", sold: 0 }])
    changed()
  }
  const remove = (key: string) => {
    setRows((r) => r.filter((x) => x.key !== key))
    changed()
  }
  return (
    <div ref={box} className="grid gap-2">
      <input type="hidden" name="tiers_present" value="1" />
      {rows.map((r) => (
        <div key={r.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_6rem] sm:items-center">
          <input type="hidden" name="tier_id" value={r.id ?? ""} />
          <Input name="tier_name" defaultValue={r.name} maxLength={100} placeholder={t("tickets.tierNamePlaceholder")} aria-label={t("tickets.tierName")} />
          <TypedInput kind="money" name="tier_price" defaultValue={r.price} aria-label={t("tickets.price")} />
          <TypedInput kind="number" name="tier_quota" min={1} step={1} defaultValue={r.quota} placeholder="∞" aria-label={t("tickets.tierQuota")} />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <span className="text-xs text-muted-foreground">{t("tickets.tierEnd")}</span>
            <DateInput name="tier_end" type="datetime-local" defaultValue={r.sales_end || undefined} aria-label={t("tickets.tierEnd")} />
            {r.id && <span className="text-xs text-muted-foreground">{t("tickets.tierSold", { count: r.sold })}</span>}
            <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" aria-label={t("tickets.deleteTier")} title={t("tickets.deleteTier")} data-confirm={r.id ? "tickets.confirmDeleteTier" : undefined} onClick={() => remove(r.key)}>
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline">
        <PlusCircleIcon className="size-4" /> {t("tickets.addTier")}
      </button>
    </div>
  )
}
