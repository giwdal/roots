// Which events count towards a membership type's visit limit: a list of the org's event types (pure; App + API share it).
// No list (null) = every event counts; with a list, an event without one of these types does not count (member_door_rows).

/** Validates the ticked/given type ids against the org's event types. Nothing ticked = null (every event counts). */
export function readVisitTypes(ids: unknown, orgTypeIds: string[]): { types: string[] | null } | { error: string } {
  if (ids === undefined || ids === null) return { types: null }
  if (!Array.isArray(ids)) return { error: "errors.invalid_input" }
  const out = [...new Set(ids.map(String).filter(Boolean))]
  if (out.some((id) => !orgTypeIds.includes(id))) return { error: "errors.invalid_input" }
  return { types: out.length ? out : null }
}
