// Event types: the rules the settings page and the API share (pure). A type is a label: name, colour, active.
import { STATUS_COLORS } from "../../../projects/fields.ts"

export type TypeInput = { name?: unknown; color?: unknown; active?: unknown }
export type TypeRow = { name: string; color: string | null; active: boolean }

/** Validates a type from a form or the API. */
export function readEventType(input: TypeInput): { row: TypeRow } | { error: string } {
  const name = String(input.name ?? "").trim()
  if (!name || name.length > 100) return { error: "errors.invalid_input" }
  const color = input.color === undefined || input.color === null || input.color === "" ? null : String(input.color)
  if (color && !(STATUS_COLORS as readonly string[]).includes(color)) return { error: "errors.invalid_input" }
  return { row: { name, color, active: input.active === undefined ? true : input.active === true || input.active === "on" } }
}
