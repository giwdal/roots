import test from "node:test"
import assert from "node:assert/strict"
import { readVisitTypes } from "./visit-rule.ts"

const org = ["a", "b"]

test("nothing ticked or given means every event counts", () => {
  assert.deepEqual(readVisitTypes([], org), { types: null })
  assert.deepEqual(readVisitTypes(null, org), { types: null })
  assert.deepEqual(readVisitTypes(undefined, org), { types: null })
})

test("the org's own types are kept once each, others refused", () => {
  assert.deepEqual(readVisitTypes(["a", "a", "b"], org), { types: ["a", "b"] })
  assert.equal(readVisitTypes(["a", "x"], org).error, "errors.invalid_input")
  assert.equal(readVisitTypes("a", org).error, "errors.invalid_input")
})
