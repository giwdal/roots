// Event types: the rules the settings page and the API share (pure). The type's defaults are copied into a new event.
import { STATUS_COLORS } from "../../../projects/fields.ts"
import { EVENT_SLUG } from "./fields.ts"
import { slugify } from "./slug.ts"

export type TypeInput = { name?: unknown; slug?: unknown; color?: unknown; active?: unknown; counts_visit?: unknown; capacity?: unknown }
export type TypeDefaults = { counts_visit: boolean; capacity: number | null }
export type TypeRow = TypeDefaults & { name: string; slug: string; color: string | null; active: boolean }

const bool = (v: unknown, fallback: boolean) => (v === undefined ? fallback : v === true || v === "on")

/** Validates a type from a form or the API; `existingSlugs` = the org's other slugs (an empty slug is made from the name, then numbered). */
export function readEventType(input: TypeInput, existingSlugs: string[]): { row: TypeRow } | { error: string } {
  const name = String(input.name ?? "").trim()
  if (!name || name.length > 100) return { error: "errors.invalid_input" }
  const color = input.color === undefined || input.color === null || input.color === "" ? null : String(input.color)
  if (color && !(STATUS_COLORS as readonly string[]).includes(color)) return { error: "errors.invalid_input" }
  const capRaw = input.capacity === undefined || input.capacity === null || input.capacity === "" ? null : Number(input.capacity)
  if (capRaw !== null && !(Number.isInteger(capRaw) && capRaw >= 1)) return { error: "errors.invalid_input" }
  let slug = String(input.slug ?? "").trim()
  if (slug) {
    if (!EVENT_SLUG.test(slug)) return { error: "errors.invalid_input" }
  } else {
    const base = slugify(name)
    slug = base
    for (let n = 2; existingSlugs.includes(slug); n++) slug = `${base.slice(0, 76)}-${n}`
  }
  return { row: { name, slug, color, active: bool(input.active, true), counts_visit: bool(input.counts_visit, true), capacity: capRaw } }
}

/** Create-time defaults: only keys the row leaves out (`undefined`) come from the type; what the row sets, even `null`, wins. */
export function withTypeDefaults<T extends Record<string, unknown>>(type: TypeDefaults | null, row: T): T & Partial<TypeDefaults> {
  if (!type) return row
  const out: Record<string, unknown> = { ...row }
  if (out.counts_visit === undefined) out.counts_visit = type.counts_visit
  if (out.capacity === undefined && type.capacity !== null) out.capacity = type.capacity
  return out as T & Partial<TypeDefaults>
}
