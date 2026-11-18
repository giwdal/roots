"use client"

import { useRef, useState } from "react"
import { PlusCircleIcon, XIcon } from "lucide-react"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"

export type PositionRow = { id?: string; name: string; needed: number; location_id: string | null }

/**
 * The positions as inline rows of one form (saved with its SaveBar, savePositions): name, usual headcount, place.
 * Each row posts pos_id / pos_name / pos_needed / pos_location once, read by index; order = the order here. Removing a
 * saved position asks first (its shifts keep their times, without the position).
 */
export function PositionRows({ initial, locations }: { initial: PositionRow[]; locations: { id: string; name: string }[] }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const next = useRef(0)
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ ...r, key: r.id ?? `i${i}` })))
  // The SaveBar listens for change events inside the form: adding or removing a row is a change too.
  const changed = () => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("change", { bubbles: true })))
  const add = () => {
    setRows((r) => [...r, { key: `n${next.current++}`, name: "", needed: 1, location_id: null }])
    changed()
  }
  const remove = (key: string) => {
    setRows((r) => r.filter((x) => x.key !== key))
    changed()
  }
  return (
    <div ref={box} className="grid gap-2">
      {rows.length > 0 && (
        <ul className="grid divide-y rounded-xl border">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,11rem)_auto]">
              <input type="hidden" name="pos_id" value={r.id ?? ""} />
              <Input name="pos_name" defaultValue={r.name} required maxLength={100} placeholder={t("shifts.positionPlaceholder")} aria-label={t("shifts.position")} />
              <TypedInput kind="number" name="pos_needed" min={1} max={100} step={1} defaultValue={r.needed} aria-label={t("shifts.needed")} title={t("shifts.needed")} className="w-full" />
              {locations.length > 0 ? (
                <NativeSelect name="pos_location" defaultValue={r.location_id ?? ""} aria-label={t("shifts.location")} className="w-full max-sm:col-span-2 max-sm:row-start-2">
                  <NativeSelectOption value="">{t("shifts.anyLocation")}</NativeSelectOption>
                  {locations.map((l) => (
                    <NativeSelectOption key={l.id} value={l.id}>
                      {l.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <input type="hidden" name="pos_location" value="" />
              )}
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t("shifts.removePosition")} title={t("shifts.removePosition")} data-confirm={r.id ? "shifts.confirmDeletePosition" : undefined} onClick={() => remove(r.key)} className="max-sm:col-start-3 max-sm:row-start-1">
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={add} className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline">
        <PlusCircleIcon className="size-4" /> {t("shifts.addPosition")}
      </button>
    </div>
  )
}
