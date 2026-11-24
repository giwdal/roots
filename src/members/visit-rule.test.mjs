import test from "node:test"
import assert from "node:assert/strict"
import { readVisitRule, visitRuleProblem } from "./visit-rule.ts"

const defs = [
  { key: "zaehlt", label: "Zählt", type: "boolean", options: [], required: false },
  { key: "typ", label: "Typ", type: "select", options: ["Session", "Klubnacht"], required: false },
  { key: "reihe", label: "Reihe", type: "text", options: [], required: false },
  { key: "anzahl", label: "Anzahl", type: "number", options: [], required: false },
]
const none = { visit_count_field: null, visit_count_value: null }

test("no rule: both empty means every event counts", () => {
  assert.deepEqual(readVisitRule(defs, "", "").rule, none)
  assert.deepEqual(readVisitRule(defs, undefined, null).rule, none)
})

test("a select rule keeps the field's own spelling of the option", () => {
  assert.deepEqual(readVisitRule(defs, "typ", "session").rule, { visit_count_field: "typ", visit_count_value: "Session" })
  assert.equal(readVisitRule(defs, "typ", "Konzert").error, "errors.invalid_option")
})

test("a boolean rule means Yes: a No is not stored on events, so it can't be matched", () => {
  assert.deepEqual(readVisitRule(defs, "zaehlt", "ja").rule, { visit_count_field: "zaehlt", visit_count_value: "true" })
  assert.deepEqual(readVisitRule(defs, "zaehlt", "true").rule, { visit_count_field: "zaehlt", visit_count_value: "true" })
  assert.equal(readVisitRule(defs, "zaehlt", "nein").error, "errors.invalid_input")
})

test("a text rule is compared as typed (trimmed)", () => {
  assert.deepEqual(readVisitRule(defs, "reihe", "  Sommer ").rule, { visit_count_field: "reihe", visit_count_value: "Sommer" })
})

test("field and value go together, the field must be an event field of an allowed type", () => {
  assert.equal(readVisitRule(defs, "typ", "").error, "errors.invalid_input") // field without value
  assert.equal(readVisitRule(defs, "", "Session").error, "errors.invalid_input") // value without field
  assert.equal(readVisitRule(defs, "gibtsnicht", "x").error, "errors.invalid_input") // unknown field
  assert.equal(readVisitRule(defs, "anzahl", "3").error, "errors.invalid_input") // number is not offered
  assert.equal(readVisitRule(defs, "reihe", "x".repeat(201)).error, "errors.invalid_input") // the column holds at most 200 characters
})

test("a rule whose field or value no longer exists is reported (the door then counts nothing)", () => {
  assert.equal(visitRuleProblem(defs, none), null)
  assert.equal(visitRuleProblem(defs, { visit_count_field: "typ", visit_count_value: "Session" }), null)
  assert.equal(visitRuleProblem(defs, { visit_count_field: "weg", visit_count_value: "x" }), "field_missing")
  assert.equal(visitRuleProblem(defs, { visit_count_field: "typ", visit_count_value: "Gelöscht" }), "value_missing")
  assert.equal(visitRuleProblem(defs, { visit_count_field: "anzahl", visit_count_value: "3" }), "field_missing") // type changed away
})
