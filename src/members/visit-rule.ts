// Which events count towards a membership type's visit limit: "event custom field <field> = <value>" (pure; App + API share it).
// No rule (both null) = every event counts. The door compares `events.custom ->> field` to the value as text, an event
// without the key does not count (member_door_rows, migration 20261124120000).
import { parseValue, type FieldDef } from "../lib/custom-fields.ts"

// shortcut: text comparison only for select / boolean / text fields; add number or date when an org needs it.
export const RULE_FIELD_TYPES = ["select", "boolean", "text"]
export type VisitRule = { visit_count_field: string | null; visit_count_value: string | null }

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim())

/** Validates a rule from the form or the API against the org's event fields (`defs`). Both empty = no rule. */
export function readVisitRule(defs: FieldDef[], field: unknown, value: unknown): { rule: VisitRule } | { error: string } {
  const key = str(field)
  const raw = str(value)
  if (!key && !raw) return { rule: { visit_count_field: null, visit_count_value: null } }
  const def = defs.find((d) => d.key === key)
  if (!def || !RULE_FIELD_TYPES.includes(def.type) || !raw) return { error: "errors.invalid_input" }
  const r = parseValue(def, raw)
  if (r.error) return { error: r.error }
  // A boolean "No" is not stored on events (parseValue drops it), so only "Yes" can be matched.
  if (r.value === undefined || (def.type === "boolean" && r.value !== true)) return { error: "errors.invalid_input" }
  const out = String(r.value)
  if (out.length > 200) return { error: "errors.invalid_input" } // column limit (migration 20261124120000)
  return { rule: { visit_count_field: key, visit_count_value: out } }
}
