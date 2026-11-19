// Every contact search (lists, pickers, ⌘K, exports, API) looks at the same columns. `custom_search` = all custom
// field values, generated in the database.
export const CONTACT_SEARCH = ["first_name", "last_name", "company", "email", "phone", "city", "custom_search"]

/** PostgREST `.or()` filter for a search term; drops the characters that would break the filter. "" = no search. */
export function contactSearch(term: string | null | undefined) {
  const s = String(term ?? "").replace(/[%,()*]/g, "").trim()
  return s ? CONTACT_SEARCH.map((c) => `${c}.ilike.%${s}%`).join(",") : ""
}
