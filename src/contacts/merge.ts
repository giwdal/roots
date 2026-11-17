// Merging two contacts (#27): which fields can come from the other contact. Pure (App, API, node --test).
// The merge itself is the DB function merge_contacts(); `take` = keys whose value comes from the dropped contact.

export const MERGE_FIELDS = ["first_name", "last_name", "company", "email", "phone", "address", "birthday", "member_code", "user_id"] as const

export type MergeContact = {
  first_name: string | null
  last_name: string | null
  company: string | null
  email: string | null
  phone: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  birthday: string | null
  member_code: string | null
  user_id: string | null
  custom: Record<string, unknown>
}

const keysOf = (customKeys: string[]) => [...MERGE_FIELDS, ...customKeys.map((k) => `custom.${k}`)]

// Value as shown on the merge page; "" = empty.
export function mergeValue(c: MergeContact, key: string): string {
  if (key === "address") {
    const place = [c.postal_code, c.city].filter(Boolean).join(" ")
    return [c.street, place, c.country].filter(Boolean).join(", ")
  }
  const v = key.startsWith("custom.") ? c.custom?.[key.slice(7)] : c[key as keyof Omit<MergeContact, "custom">]
  return v === null || v === undefined ? "" : String(v).trim()
}

// Preselected from the dropped contact: wherever the kept one is empty.
export const defaultTake = (keep: MergeContact, drop: MergeContact, customKeys: string[]) =>
  keysOf(customKeys).filter((k) => !mergeValue(keep, k) && mergeValue(drop, k))

// The team has to choose only where both have a value and they differ.
export const conflicts = (keep: MergeContact, drop: MergeContact, customKeys: string[]) =>
  keysOf(customKeys).filter((k) => mergeValue(keep, k) && mergeValue(drop, k) && mergeValue(keep, k) !== mergeValue(drop, k))

// What a merge takes from the dropped contact: the caller's choice plus every field the kept one has empty, so the
// App, the API, MCP and Sprout merge the same way. null = invalid choice.
export function takeFor(keep: MergeContact, drop: MergeContact, raw: unknown, customKeys: string[]): string[] | null {
  const take = readTake(raw, customKeys)
  return take && [...new Set([...take, ...defaultTake(keep, drop, customKeys)])]
}

export function readTake(raw: unknown, customKeys: string[]): string[] | null {
  if (!Array.isArray(raw)) return null
  const allowed = new Set(keysOf(customKeys))
  if (!raw.every((k) => typeof k === "string" && allowed.has(k))) return null
  return [...new Set(raw as string[])]
}
