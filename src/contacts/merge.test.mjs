import { test } from "node:test"
import assert from "node:assert/strict"
import { conflicts, defaultTake, mergeValue, readTake } from "./merge.ts"

const empty = {
  first_name: null, last_name: null, company: null, email: null, phone: null, street: null, postal_code: null,
  city: null, country: null, birthday: null, member_code: null, user_id: null, custom: {},
}
const c = (o) => ({ ...empty, ...o })

test("defaultTake fills empty fields", () => {
  assert.ok(defaultTake(c({}), c({ phone: "030 1" }), []).includes("phone"))
  assert.ok(!defaultTake(c({ email: "k@x.de" }), c({ email: "d@x.de" }), []).includes("email"))
})

test("address is one field", () => {
  const k = c({ city: "Köln" })
  const d = c({ street: "Weg 1", postal_code: "50667", city: "Berlin", country: "DE" })
  assert.ok(!defaultTake(k, d, []).includes("address"))
  assert.ok(conflicts(k, d, []).includes("address"))
  assert.equal(mergeValue(d, "address"), "Weg 1, 50667 Berlin, DE")
})

test("conflicts ignores equal values", () => {
  assert.ok(!conflicts(c({ first_name: "Anna" }), c({ first_name: "Anna" }), []).includes("first_name"))
})

test("custom keys", () => {
  assert.ok(defaultTake(c({}), c({ custom: { dj_name: "X" } }), ["dj_name"]).includes("custom.dj_name"))
  assert.equal(mergeValue(c({ custom: { dj_name: "X" } }), "custom.dj_name"), "X")
})

test("readTake rejects unknown", () => {
  assert.equal(readTake(["email", "custom.nope"], ["dj_name"]), null)
  assert.equal(readTake("email", []), null)
  assert.deepEqual(readTake(["email", "email"], []), ["email"])
  assert.deepEqual(readTake(["custom.dj_name", "address"], ["dj_name"]), ["custom.dj_name", "address"])
})
