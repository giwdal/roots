import assert from "node:assert/strict"
import { test } from "node:test"
import { dateMatches, dateMatchesSince, nextRun, resolveDate } from "./schedule.ts"

test("next run of daily, weekly and monthly schedules (Berlin time)", () => {
  const at = new Date("2026-10-13T10:00:00Z") // Tue 12:00 Berlin
  assert.equal(nextRun({ every: "day", time: "09:00" }, at).toISOString(), "2026-10-14T07:00:00.000Z")
  assert.equal(nextRun({ every: "day", time: "18:30" }, at).toISOString(), "2026-10-13T16:30:00.000Z")
  assert.equal(nextRun({ every: "week", time: "09:00", weekday: 1 }, at).toISOString(), "2026-10-19T07:00:00.000Z")
  assert.equal(nextRun({ every: "month", time: "09:00", monthday: 1 }, at).toISOString(), "2026-11-01T08:00:00.000Z") // winter time
})

test("date filters and relative dates", () => {
  assert.equal(dateMatches("1990-10-13", 0, true, "2026-10-13"), true) // birthday today
  assert.equal(dateMatches("1990-10-13", 0, false, "2026-10-13"), false)
  assert.equal(dateMatches("2026-10-20", -7, false, "2026-10-13"), true) // 7 days before
  assert.equal(dateMatches("2026-10-10", 3, false, "2026-10-13"), true) // 3 days after
  assert.equal(dateMatches("2026-10-19T22:30:00Z", -7, false, "2026-10-13"), true) // timestamp, Berlin day
  assert.equal(resolveDate("today+10", "2026-10-13"), "2026-10-23")
  assert.equal(resolveDate("heute - 3", "2026-10-13"), "2026-10-10")
  assert.equal(resolveDate("2026-12-31", "2026-10-13"), "2026-12-31")
  assert.equal(resolveDate("today-1y", "2026-10-13"), "2025-10-13")
  assert.equal(resolveDate("2026-01-31+1m", "2026-10-13"), "2026-02-28")
  assert.equal(resolveDate("2026-12-31 + 6m", "2026-10-13"), "2027-06-30")
  assert.equal(resolveDate("2026-10-20T18:00:00+00:00-2w", "2026-10-13"), "2026-10-06")
  assert.equal(resolveDate("{membership.ends_on}+6m", "2026-10-13"), "{membership.ends_on}+6m") // unfilled stays
})

test("date maths: quarters, latest/earliest, quarter/month end", () => {
  const t = "2026-11-15"
  assert.equal(resolveDate("today+2q", t), "2027-05-15")
  assert.equal(resolveDate("quarterend(today)", t), "2026-12-31")
  assert.equal(resolveDate("quartalsende(2026-02-10)+2q", t), "2026-09-30")
  assert.equal(resolveDate("monthend(2026-02-03)", t), "2026-02-28")
  assert.equal(resolveDate("max(2027-01-31, today)+6m", t), "2027-07-31")
  assert.equal(resolveDate("max({membership.fee_free_until}, today)+6m", t), "2027-05-15") // empty placeholder skipped
  assert.equal(resolveDate("min(today, 2026-12-01)", t), "2026-11-15")
  assert.equal(resolveDate("max(quarterend(today), 2026-12-01)", t), "2026-12-31")
  assert.equal(resolveDate("nonsense(today)", t), "nonsense(today)")
})

test("date reached catches up missed days", () => {
  // 14 days before the shift on 2026-11-30 = 2026-11-16; the worker was down that day, runs on the 17th
  assert.equal(dateMatches("2026-11-30", -14, false, "2026-11-17"), false)
  assert.equal(dateMatchesSince("2026-11-30", -14, false, "2026-11-16", "2026-11-17"), true)
  assert.equal(dateMatchesSince("2026-11-30", -14, false, "2026-11-17", "2026-11-17"), false) // normal day: only today
  assert.equal(dateMatchesSince("1990-11-16", 0, true, "2026-11-15", "2026-11-17"), true) // birthday in the gap
})
