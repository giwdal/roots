import assert from "node:assert/strict"
import { test } from "node:test"
import { contactSearch } from "./search.ts"

test("contactSearch: every column, characters that break the filter dropped", () => {
  assert.equal(contactSearch(" "), "")
  assert.equal(contactSearch("%,()*"), "")
  const f = contactSearch("TA-90, (x)")
  assert.equal(f.split(",").length, 7)
  assert.ok(f.includes("custom_search.ilike.%TA-90 x%"))
})
