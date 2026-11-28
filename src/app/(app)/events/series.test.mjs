import assert from "node:assert/strict"
import { test } from "node:test"
import { atTime, nextStarts } from "./series.ts"

test("weekly and every two weeks keep the wall-clock time", () => {
  assert.deepEqual(nextStarts("2026-10-20T20:00", "week", 2), ["2026-10-27T20:00", "2026-11-03T20:00"]) // across the DST change
  assert.deepEqual(nextStarts("2026-12-29T22:00", "2weeks", 1), ["2027-01-12T22:00"])
  assert.deepEqual(nextStarts("2026-12-01T20:00", "week", 0), [])
})

test("monthly = same weekday in the same week of the month, missing ones skipped", () => {
  assert.deepEqual(nextStarts("2026-11-13T23:00", "month", 3), ["2026-12-11T23:00", "2027-01-08T23:00", "2027-02-12T23:00"]) // 2nd Friday
  assert.deepEqual(nextStarts("2026-10-30T20:00", "month", 2), ["2027-01-29T20:00", "2027-04-30T20:00"]) // 5th Friday only in some months
})

test("count is capped, the time can be swapped", () => {
  assert.equal(nextStarts("2026-01-01T10:00", "week", 500).length, 52)
  assert.equal(atTime("2026-12-01T20:00", "21:30"), "2026-12-01T21:30")
})
