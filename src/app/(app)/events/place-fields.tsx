"use client"

import { useRef } from "react"
import { Choice } from "@/components/choice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

export type Place = { id: string; name: string; address: string | null; capacity: number | null }
type Values = { location_id: string | null; venue_name: string | null; venue_address: string | null; capacity: number | null }

// Wo: picking a saved place fills name, address and capacity (a copy, still editable per event); the event keeps the link.
// ponytail: with more than 15 places Choice becomes a search box that fires no change event, so no filling then; raise the limit when an org gets there.
export function PlaceFields({ places, ev }: { places: Place[]; ev?: Values }) {
  const t = useT()
  const name = useRef<HTMLInputElement>(null)
  const address = useRef<HTMLInputElement>(null)
  const capacity = useRef<HTMLInputElement>(null)
  function pick(id: string) {
    const p = places.find((x) => x.id === id)
    if (!p) return
    if (name.current) name.current.value = p.name
    if (address.current) address.current.value = p.address ?? ""
    if (capacity.current && p.capacity) capacity.current.value = String(p.capacity)
  }
  return (
    <>
      {places.length > 0 && (
        <div
          className="grid gap-2"
          onChange={(e) => {
            const el = e.target as HTMLInputElement
            if (el.name === "location") pick(el.value)
          }}
        >
          <Label htmlFor="ev-location">{t("eventsPage.savedPlace")}</Label>
          <Choice id="ev-location" name="location" label={t("eventsPage.savedPlace")} defaultValue={ev?.location_id} options={places.map((l) => ({ value: l.id, label: l.name }))} />
        </div>
      )}
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ev-venue">{t("eventsPage.venueNameShort")}</Label>
          <Input ref={name} id="ev-venue" name="venue_name" defaultValue={ev?.venue_name ?? ""} maxLength={200} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-address">{t("eventsPage.venueAddressShort")}</Label>
          <Input ref={address} id="ev-address" name="venue_address" defaultValue={ev?.venue_address ?? ""} maxLength={500} autoComplete="off" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ev-capacity">{t("eventsPage.capacity")}</Label>
        <Input ref={capacity} id="ev-capacity" name="capacity" type="number" inputMode="numeric" min={1} step={1} defaultValue={ev?.capacity ?? ""} className="max-w-32" />
      </div>
    </>
  )
}
