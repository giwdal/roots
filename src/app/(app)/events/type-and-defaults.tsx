"use client"

import { useRef, useState } from "react"
import { Choice } from "@/components/choice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

export type TypeOption = { id: string; name: string; slug: string; counts_visit: boolean; capacity: number | null }

// New event: the type comes first and prefills capacity and "counts towards visit limits" in the browser (no reload, so
// nothing typed is lost). A field the person already touched keeps their value when they switch the type.
// shortcut: Choice with more than 15 types becomes a search box that doesn't fire change events; no prefill then, raise the limit if an org gets there.
export function TypeAndDefaults({ types, initialSlug, showCounts }: { types: TypeOption[]; initialSlug?: string; showCounts: boolean }) {
  const t = useT()
  const first = types.find((x) => x.slug === initialSlug)
  const [cap, setCap] = useState({ key: 0, value: first?.capacity != null ? String(first.capacity) : "" })
  const [cnt, setCnt] = useState({ key: 0, value: first?.counts_visit ?? true })
  const touched = useRef({ cap: false, cnt: false })
  function pick(id: string) {
    const ty = types.find((x) => x.id === id)
    if (!touched.current.cap) setCap((c) => ({ key: c.key + 1, value: ty?.capacity != null ? String(ty.capacity) : "" }))
    if (!touched.current.cnt) setCnt((c) => ({ key: c.key + 1, value: ty?.counts_visit ?? true }))
  }
  return (
    <div className="grid gap-4">
      <div
        className="grid gap-2"
        onChange={(e) => {
          const el = e.target as HTMLInputElement
          if (el.name === "event_type") pick(el.value)
        }}
      >
        <Label htmlFor="ev-type">{t("eventsPage.type")}</Label>
        <Choice id="ev-type" name="event_type" label={t("eventsPage.type")} defaultValue={first?.id} options={types.map((x) => ({ value: x.id, label: x.name }))} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ev-capacity">{t("eventsPage.capacity")}</Label>
        <Input key={`cap${cap.key}`} id="ev-capacity" name="capacity" type="number" inputMode="numeric" min={1} step={1} defaultValue={cap.value} onInput={() => (touched.current.cap = true)} className="max-w-32" />
      </div>
      {showCounts && (
        <div className="grid gap-1">
          <input type="hidden" name="counts_visit_field" value="1" />
          <label className="flex items-center gap-2 text-sm">
            <input key={`cnt${cnt.key}`} type="checkbox" className="size-4 accent-primary" name="counts_visit" value="on" defaultChecked={cnt.value} onChange={() => (touched.current.cnt = true)} />
            {t("eventsPage.countsVisit")}
          </label>
          <p className="text-xs text-muted-foreground">{t("eventsPage.countsVisitHint")}</p>
        </div>
      )}
    </div>
  )
}
