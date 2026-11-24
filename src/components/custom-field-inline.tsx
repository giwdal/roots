import type { DetailItem } from "@/components/detail-list"
import { InlineField, type PatchAction } from "@/components/inline-field"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"

/**
 * A record's custom fields as <DetailList> rows that edit in place (Linear style), empty ones included so they can be
 * filled. `action` is the record's patch action; it gets `field` = "custom.<key>" and the raw text (German formats).
 * Read-only people get the plain values (customDetails).
 */
export function customInlineItems(t: T, defs: FieldDef[], values: unknown, action: PatchAction, id: string): DetailItem[] {
  const v = (values ?? {}) as CustomValues
  return defs.map((d) => {
    const x = v[d.key]
    const raw = x === undefined || x === null ? null : d.type === "money" && typeof x === "number" ? x.toFixed(2).replace(".", ",") : typeof x === "boolean" ? (x ? "true" : "false") : String(x)
    const common = { action, id, field: `custom.${d.key}`, label: d.label }
    const value =
      d.type === "select" ? <InlineField {...common} kind="choice" value={raw} options={d.options.map((o) => ({ value: o, label: o }))} />
      : d.type === "boolean" ? <InlineField {...common} kind="choice" value={raw === "true" ? "true" : raw === "false" ? "false" : null} options={[{ value: "true", label: t("common.yes") }, { value: "false", label: t("common.no") }]} />
      : d.type === "date" ? <InlineField {...common} kind="date" value={raw} display={raw ? t.date(`${raw}T12:00:00`, { dateStyle: "medium" }) : undefined} />
      : d.type === "email" ? <InlineField {...common} kind="email" value={raw} display={raw ? <a href={`mailto:${raw}`} className="break-all link">{raw}</a> : undefined} />
      : d.type === "url" ? <InlineField {...common} kind="url" value={raw} display={raw ? <a href={raw} target="_blank" rel="noreferrer" className="break-all link">{raw}</a> : undefined} />
      : <InlineField {...common} kind={d.type === "money" ? "money" : d.type === "number" ? "number" : "text"} value={raw} />
    return { label: d.label, value }
  })
}
