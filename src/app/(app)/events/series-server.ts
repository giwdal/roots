// Duplicate / repeat an event and change a series from one date on: shared by the App's actions and the key API.
import type { SupabaseClient } from "@supabase/supabase-js"
import { fromLocalInput, toLocalInput } from "@/lib/time"
import type { Database } from "@/lib/supabase/types"
import { atTime, EVERY, MAX_DATES, nextStarts, type Every } from "./series"

type Db = SupabaseClient<Database>
type Fail = { error: string; db?: { code?: string; message: string } }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Copies: `first` (local "YYYY-MM-DDTHH:MM") and, with `every`, `count - 1` more dates as one series. */
export async function repeatEvent(db: Db, orgId: string, id: string, input: { first: string; every?: string | null; count?: number; publish?: boolean }): Promise<Fail | { ids: string[] }> {
  const every = EVERY.find((e) => e === input.every) as Every | undefined
  if (!fromLocalInput(input.first)) return { error: "errors.invalid_time" }
  const locals = [input.first, ...(every ? nextStarts(input.first, every, Math.min(MAX_DATES, Math.max(1, input.count ?? 1)) - 1) : [])]
  const { data: ev } = await db.from("events").select("series_id").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!ev) return { error: "errors.not_allowed" }
  const { data, error } = await db.rpc("copy_event", {
    p_event: id,
    p_starts: locals.map((l) => fromLocalInput(l)!.toISOString()),
    p_series: every ? (ev.series_id ?? crypto.randomUUID()) : undefined,
    p_status: input.publish ? "published" : "draft",
  })
  return error ? { error: "db", db: error } : { ids: data ?? [] }
}

// This date, or this one and every later date of its series.
async function scoped(db: Db, orgId: string, id: string, following: boolean) {
  const { data: ev } = await db.from("events").select("id, series_id, starts_at, ends_at").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!ev) return null
  if (!following || !ev.series_id) return [ev]
  const { data } = await db.from("events").select("id, series_id, starts_at, ends_at").eq("org_id", orgId).eq("series_id", ev.series_id).gte("starts_at", ev.starts_at).is("deleted_at", null)
  return data ?? [ev]
}

/** New start (and optional end) time of day, keeping each date; without an end the length stays. */
export async function retimeEvents(db: Db, orgId: string, id: string, input: { following: boolean; start: string; end?: string | null }): Promise<Fail | { count: number }> {
  if (!TIME.test(input.start) || (input.end && !TIME.test(input.end))) return { error: "errors.invalid_time" }
  const rows = await scoped(db, orgId, id, input.following)
  if (!rows) return { error: "errors.not_allowed" }
  const results = await Promise.all(
    rows.map((r) => {
      const local = toLocalInput(r.starts_at)
      const starts = fromLocalInput(atTime(local, input.start))!
      let ends: Date | null = r.ends_at ? new Date(starts.getTime() + (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime())) : null
      if (input.end) {
        ends = fromLocalInput(atTime(local, input.end))!
        if (ends <= starts) ends = new Date(ends.getTime() + 86_400_000) // ends after midnight
      }
      return db.from("events").update({ starts_at: starts.toISOString(), ends_at: ends?.toISOString() ?? null }).eq("id", r.id).eq("org_id", orgId)
    }),
  )
  const failed = results.find((x) => x.error)?.error
  return failed ? { error: "db", db: failed } : { count: rows.length }
}

/** Cancels this date, or this and every later date of the series (status cancelled: public, marked cancelled). */
export async function cancelEvents(db: Db, orgId: string, id: string, following: boolean): Promise<Fail | { count: number }> {
  const rows = await scoped(db, orgId, id, following)
  if (!rows) return { error: "errors.not_allowed" }
  const { error, count } = await db.from("events").update({ status: "cancelled" }, { count: "exact" }).in("id", rows.map((r) => r.id)).eq("org_id", orgId)
  return error ? { error: "db", db: error } : { count: count ?? 0 }
}
