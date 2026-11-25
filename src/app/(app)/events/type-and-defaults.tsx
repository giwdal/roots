"use client"

import { useRef, useState } from "react"
import { Choice } from "@/components/choice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

export type TypeOption = { id: string; name: string; slug: string; capacity: number | null }

// New event: the type comes first and prefills the capacity in the browser (no reload, so
// nothing typed is lost). A capacity the person already touched keeps their value when they switch the type.
// shortcut: with more than 15 types Choice becomes a search box that does not fire change events, so no prefill then; raise the limit if an org gets there.
export function TypeAndDefaults({ types, initialSlug }: { types: TypeOption[]; initialSlug?: string }) {
  const t = useT()
  const first = types.find((x) => x.slug === initialSlug)
  const [cap, setCap] = useState({ key: 0, value: first?.capacity != null ? String(first.capacity) : "" })
  const touched = useRef(false)
  function pick(id: string) {
    const ty = types.find((x) => x.id === id)
    if (!touched.current) setCap((c) => ({ key: c.key + 1, value: ty?.capacity != null ? String(ty.capacity) : "" }))
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
        <Choice id="ev-type" name="event_type" label={t("eventsPage.type")} dropdown defaultValue={first?.id} options={types.map((x) => ({ value: x.id, label: x.name }))} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ev-capacity">{t("eventsPage.capacity")}</Label>
        <Input key={`cap${cap.key}`} id="ev-capacity" name="capacity" type="number" inputMode="numeric" min={1} step={1} defaultValue={cap.value} onInput={() => (touched.current = true)} className="max-w-32" />
      </div>
    </div>
  )
}
