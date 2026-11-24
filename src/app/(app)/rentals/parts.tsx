import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { Choice } from "@/components/choice"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { RecordPicker, type PickerOption } from "@/components/record-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import type { FieldDef } from "@/lib/custom-fields"
import { FAMILIES, KINDS, type Family } from "@/rentals/fields"
import { contactName } from "../contacts/fields"
import { saveObjectAction, searchObjects } from "./actions"

/** "studio" → "Studio"; custom kinds are shown as typed. */
export const kindLabel = (t: T, kind: string) => (t.has(`rentals.kinds.${kind}`) ? t.dynamic(`rentals.kinds.${kind}`) : kind)

type Person = { role: string; contacts: { first_name: string | null; last_name: string | null; company: string | null; email: string | null } | null }
/** "Anna, Ben (+2)": main tenants first. */
export function peopleLine(people: Person[] | null | undefined, max = 2) {
  const sorted = [...(people ?? [])].sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
  const names = sorted.map((p) => (p.contacts ? contactName(p.contacts) : "–"))
  return names.length > max ? `${names.slice(0, max).join(", ")} (+${names.length - max})` : names.join(", ")
}

/** Period as text: "seit 01.03.2026", "01.03.2026 – 28.02.2027", "02.05.2026, 10:00–12:00". */
export function period(t: T, r: { starts_at: string; ends_at: string | null; unit?: string | null }) {
  const timed = r.unit === "hour" || r.unit === "day"
  const d = (v: string) => t.date(v, timed ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" })
  const day = (v: string) => new Date(v).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  // Same day: "20.11.2026, 18:00–23:00".
  if (timed && r.ends_at && day(r.starts_at) === day(r.ends_at)) return `${d(r.starts_at)}–${t.date(r.ends_at, { timeStyle: "short" })}`
  return r.ends_at ? `${d(r.starts_at)} – ${d(r.ends_at)}` : t("rentals.since", { date: d(r.starts_at) })
}

export type ObjectLite = { id: string; name: string; parent_id: string | null; kind: string }

// A new object: what it is, where it belongs, custom fields. How it's given out (rentable, handed out, capacity,
// deposit) follows from the kind's family and is changed in place on the object page.
export function ObjectForm({ t, locations, defs, parent, kind }: { t: T; locations: { id: string; name: string }[]; defs: FieldDef[]; parent?: PickerOption | null; kind?: string | null }) {
  const current = kind && FAMILIES.some((f) => KINDS[f].includes(kind)) ? kind : "room"
  return (
    <form action={saveObjectAction} className="grid gap-6">
      <FormCard id="object" title={t("rentals.basics")}>
        <div className="grid max-w-xl gap-2">
          <Label htmlFor="o-name">{t("rentals.name")}</Label>
          <Input id="o-name" name="name" required maxLength={200} />
        </div>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="o-kind">{t("rentals.kind")}</Label>
            <KindSelect t={t} id="o-kind" defaultValue={current} />
          </div>
          <RecordPicker name="parent_id" label={t("rentals.parent")} search={searchObjects} initial={parent} placeholder={t("rentals.noParentPick")} />
        </div>
        {locations.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="o-loc">{t("rentals.location")}</Label>
            <Choice id="o-loc" name="location_id" label={t("rentals.location")} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="o-desc">{t("rentals.description")}</Label>
          <Textarea id="o-desc" name="description" rows={3} maxLength={20000} className="max-w-2xl" />
        </div>
      </FormCard>
      {defs.length > 0 && (
        <FormCard id="custom" title={t("rentals.moreFields")}>
          <CustomFieldInputs defs={defs} idPrefix="o-custom" />
        </FormCard>
      )}
      <SaveBar label={t("rentals.createObject")} always />
    </form>
  )
}

/** Kinds grouped by family (places, vehicles, items, access), "Anderes" last; a stored free-text kind stays an option. */
export function KindSelect({ t, id, name = "kind", defaultValue, kinds = FAMILIES.filter((f) => f !== "other") }: { t: T; id?: string; name?: string; defaultValue: string; kinds?: readonly Family[] }) {
  const custom = !FAMILIES.some((f) => KINDS[f].includes(defaultValue)) && defaultValue !== "other"
  return (
    <NativeSelect id={id} name={name} defaultValue={defaultValue} className="w-full">
      {kinds.map((f) => (
        <optgroup key={f} label={t.dynamic(`rentals.families.${f}`)}>
          {KINDS[f].map((k) => (
            <NativeSelectOption key={k} value={k}>
              {kindLabel(t, k)}
            </NativeSelectOption>
          ))}
        </optgroup>
      ))}
      {custom && <NativeSelectOption value={defaultValue}>{defaultValue}</NativeSelectOption>}
      <NativeSelectOption value="other">{kindLabel(t, "other")}</NativeSelectOption>
    </NativeSelect>
  )
}
