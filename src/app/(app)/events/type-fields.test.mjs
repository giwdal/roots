import assert from "node:assert/strict"
import { test } from "node:test"
import { readEventType } from "./type-fields.ts"

test("name is required, colour must be known, active defaults to on", () => {
  assert.equal(readEventType({ name: " " }).error, "errors.invalid_input")
  assert.equal(readEventType({ name: "A", color: "neon" }).error, "errors.invalid_input")
  assert.deepEqual(readEventType({ name: " Session ", color: "gray" }).row, { name: "Session", color: "gray", active: true })
  assert.equal(readEventType({ name: "A", active: false }).row.active, false)
  assert.equal(readEventType({ name: "A", color: "" }).row.color, null)
})
