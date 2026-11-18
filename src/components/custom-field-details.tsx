import type { DetailItem } from "@/components/detail-list"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"

/** A record's custom field values as <DetailList> items (empty ones left out), in the order of the definitions. */
export function customDetails(t: T, defs: FieldDef[], values: unknown): DetailItem[] {
  const v = (values ?? {}) as CustomValues
  return defs.flatMap((d) => {
    const x = v[d.key]
    if (x === undefined || x === null || x === "") return []
    const value =
      typeof x === "boolean" ? t(x ? "common.yes" : "common.no")
      : d.type === "money" && typeof x === "number" ? t.money(Math.round(x * 100))
      : d.type === "date" && typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? t.date(`${x}T12:00:00`, { dateStyle: "medium" })
      : d.type === "url" ? (
        <a href={String(x)} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
          {String(x)}
        </a>
      )
      : d.type === "email" ? (
        <a href={`mailto:${x}`} className="break-all underline underline-offset-4">
          {String(x)}
        </a>
      )
      : String(x)
    return [{ label: d.label, value }]
  })
}
