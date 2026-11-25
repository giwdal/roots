import assert from "node:assert/strict"
import { test } from "node:test"
import { readEventType, withTypeDefaults } from "./type-fields.ts"

test("slug is made from the name and stays unique per org", () => {
  assert.equal(readEventType({ name: "Klub Nacht" }, []).row.slug, "klub-nacht")
  assert.equal(readEventType({ name: "Klub Nacht" }, ["klub-nacht"]).row.slug, "klub-nacht-2")
  assert.equal(readEventType({ name: "X", slug: "Eigener Slug!" }, []).error, "errors.invalid_input")
  assert.match(readEventType({ name: "A" }, []).row.slug, /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/) // one-letter name still gives a valid slug
})

test("name is required, colour must be known, capacity is a positive whole number", () => {
  assert.equal(readEventType({ name: " " }, []).error, "errors.invalid_input")
  assert.equal(readEventType({ name: "A", color: "neon" }, []).error, "errors.invalid_input")
  assert.equal(readEventType({ name: "A", capacity: 0 }, []).error, "errors.invalid_input")
  assert.equal(readEventType({ name: "A", capacity: "2.5" }, []).error, "errors.invalid_input")
  const ok = readEventType({ name: "A", color: "gray", capacity: "300" }, []).row
  assert.deepEqual([ok.color, ok.capacity, ok.active], ["gray", 300, true])
  assert.equal("counts_visit" in ok, false) // which events count lives on the membership type, not on the event type
  assert.equal(readEventType({ name: "A", capacity: "" }, []).row.capacity, null)
})

test("type defaults fill what the row leaves out, the row wins (API semantics)", () => {
  const t = { capacity: 300 }
  assert.deepEqual(withTypeDefaults(t, { title: "x" }), { title: "x", capacity: 300 })
  assert.equal(withTypeDefaults(t, { capacity: null }).capacity, null) // cleared on purpose = stays cleared
  assert.equal(withTypeDefaults(t, { capacity: 50 }).capacity, 50)
  assert.deepEqual(withTypeDefaults({ capacity: null }, { title: "x" }), { title: "x" }) // no capacity preset
  assert.deepEqual(withTypeDefaults(null, { title: "x" }), { title: "x" }) // no type = no change
})
