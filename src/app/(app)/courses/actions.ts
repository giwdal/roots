"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { TablesUpdate } from "@/lib/supabase/types"
import { back } from "@/lib/url"
import { readCourse, readSeries, readSession } from "@/courses/fields"

const UUID = /^[0-9a-f-]{36}$/
const getter = (fd: FormData) => (k: string) => String(fd.get(k) ?? "")
const id = (fd: FormData, k = "id") => {
  const v = String(fd.get(k) ?? "")
  return UUID.test(v) ? v : null
}

async function manager() {
  const ctx = await requirePerm("courses.manage")
  const t = await getT()
  if (!ctx.modules.has("courses")) back("/courses", { error: t("errors.not_allowed") })
  return { ctx, t }
}
const msg = (t: Awaited<ReturnType<typeof getT>>, key: string) => (t.has(key) ? t.dynamic(key) : t("errors.invalid_input"))

/** Create (→ its page) or update a course. */
export async function saveCourse(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd)
  const here = courseId ? `/courses/${courseId}` : "/courses/new"
  const r = readCourse(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  if (courseId) {
    const { error } = await ctx.supabase.from("courses").update(r.row).eq("id", courseId).eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
    deliverSoon() // a bigger course moves people up from the waiting list
    back(here, { ok: t("courses.saved") })
  }
  // Optional first date (the calendar's "Neu am …" pre-fills it): checked before the course is created.
  const first = fd.get("starts_at") ? readSession(getter(fd)) : null
  if (first && "error" in first) back(here, { error: msg(t, first.error) })
  const { data, error } = await ctx.supabase.from("courses").insert({ ...r.row, org_id: ctx.org.id }).select("id").single()
  if (error) back(here, { error: dbError(t, error) })
  if (first && "row" in first) {
    const { error: e } = await ctx.supabase.from("course_sessions").insert({ ...first.row, org_id: ctx.org.id, course_id: data.id })
    if (e) back(`/courses/${data.id}`, { error: dbError(t, e) })
  }
  redirect(`/courses/${data.id}?ok=${encodeURIComponent(t(first ? "courses.createdWithDate" : "courses.created"))}#dates`)
}

export async function trashCourse(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.courses", p_id: String(fd.get("id") ?? "") })
  if (error) back(`/courses/${fd.get("id")}`, { error: dbError(t, error) })
  back("/courses", { ok: t("courses.trashed") })
}

export async function restoreCourse(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.courses", p_id: courseId })
  if (error) back(`/courses/${courseId}`, { error: dbError(t, error) })
  back(`/courses/${courseId}`, { ok: t("courses.restored") })
}

/** One date, or a weekly series of dates (existing dates at the same start are kept). */
export async function addSessions(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const here = `/courses/${courseId}#dates`
  const sheet = `/courses/${courseId}?new=${fd.get("mode") === "series" ? "series" : "date"}`
  if (!courseId) back("/courses", { error: t("errors.invalid_input") })
  const rows =
    fd.get("mode") === "series"
      ? (() => {
          const r = readSeries(getter(fd), fd.getAll("weekdays").map(String))
          return "error" in r ? r : { row: r.row.dates }
        })()
      : (() => {
          const r = readSession(getter(fd))
          return "error" in r ? r : { row: [r.row] }
        })()
  if ("error" in rows) back(sheet, { error: msg(t, rows.error) })
  const { data, error } = await ctx.supabase
    .from("course_sessions")
    .upsert(rows.row.map((s) => ({ ...s, org_id: ctx.org.id, course_id: courseId })), { onConflict: "course_id,starts_at", ignoreDuplicates: true })
    .select("id")
  if (error) back(sheet, { error: dbError(t, error) })
  back(here, { ok: t("courses.datesAdded", { count: data.length }) })
}

export async function updateSession(fd: FormData) {
  const { ctx, t } = await manager()
  const sessionId = id(fd)
  const courseId = id(fd, "course_id")
  // The sheet it came from: the date's page (?edit=date) or the course page (?edit=<id>).
  const onPage = fd.get("from") === "session"
  const here = onPage ? `/courses/${courseId}/sessions/${sessionId}` : `/courses/${courseId}`
  const sheet = `${here}?edit=${onPage ? "date" : sessionId}`
  // The sheet edits time + note; whether the date takes place is its own action (setSessionCancelled).
  const { data: s } = await ctx.supabase.from("course_sessions").select("cancelled").eq("id", sessionId ?? "").eq("org_id", ctx.org.id).maybeSingle()
  const r = readSession((k) => (k === "cancelled" ? (s?.cancelled ? "1" : "") : getter(fd)(k)))
  if ("error" in r) back(sheet, { error: msg(t, r.error) })
  const { error } = await ctx.supabase.from("course_sessions").update(r.row).eq("id", sessionId!).eq("org_id", ctx.org.id)
  if (error) back(sheet, { error: error.code === "23505" ? t("courses.dateTaken") : dbError(t, error) })
  back(here, { ok: t("courses.saved") })
}

/** A date doesn't take place (or does again); attendance marks stay. Asks first in the App. */
export async function setSessionCancelled(fd: FormData) {
  const { ctx, t } = await manager()
  const sessionId = id(fd)
  const courseId = id(fd, "course_id")
  const cancelled = fd.get("cancelled") === "1"
  const here = fd.get("from") === "session" ? `/courses/${courseId}/sessions/${sessionId}` : `/courses/${courseId}#dates`
  const { error } = await ctx.supabase.from("course_sessions").update({ cancelled }).eq("id", sessionId ?? "").eq("course_id", courseId ?? "").eq("org_id", ctx.org.id)
  back(here, error ? { error: dbError(t, error) } : { ok: t(cancelled ? "courses.dateCancelledOk" : "courses.dateResumedOk") })
}

export async function deleteSession(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const { error } = await ctx.supabase.from("course_sessions").delete().eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(`/courses/${courseId}#dates`, { error: dbError(t, error) })
  back(`/courses/${courseId}#dates`, { ok: t("courses.dateDeleted") })
}

/** Add a contact; the DB puts them on the waiting list when the course is full. */
export async function addParticipant(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const contactId = id(fd, "contact_id")
  const here = `/courses/${courseId}#participants`
  const sheet = `/courses/${courseId}?new=person`
  if (!courseId || !contactId) back(sheet, { error: t("courses.pickContact") })
  // Re-adding someone who cancelled = enrol again (a new place in the waiting order).
  await ctx.supabase.from("course_participants").delete().eq("course_id", courseId).eq("contact_id", contactId).eq("status", "cancelled").eq("org_id", ctx.org.id)
  const { data, error } = await ctx.supabase
    .from("course_participants")
    .insert({ org_id: ctx.org.id, course_id: courseId, contact_id: contactId, note: String(fd.get("note") ?? "").trim().slice(0, 500) || null })
    .select("status")
    .single()
  if (error) back(sheet, { error: error.code === "23505" ? t("courses.alreadyIn") : dbError(t, error) })
  deliverSoon()
  back(here, { ok: t(data.status === "waiting" ? "courses.addedWaiting" : "courses.added") })
}

/** enrolled/waiting → cancelled (frees the place for the waiting list), or back in. */
export async function setParticipantStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const courseId = id(fd, "course_id")
  const here = `/courses/${courseId}#participants`
  const status = String(fd.get("status") ?? "")
  if (!["enrolled", "cancelled"].includes(status)) back(here, { error: t("errors.invalid_input") })
  const { data, error } = await ctx.supabase.from("course_participants").update({ status }).eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id).select("status").single()
  if (error) back(here, { error: dbError(t, error) })
  deliverSoon()
  back(here, { ok: t(status === "cancelled" ? "courses.cancelledParticipant" : data.status === "waiting" ? "courses.addedWaiting" : "courses.added") })
}

/** One property of a course (InlineField): the stored course in form format with the new value, checked by readCourse. */
const COURSE_FIELDS = ["title", "instructor", "capacity", "location_id", "track_attendance", "description"] as const
export async function patchCourse(fd: FormData): Promise<{ error?: string }> {
  const ctx = await requirePerm("courses.manage")
  const t = await getT()
  const courseId = id(fd)
  const field = COURSE_FIELDS.find((f) => f === fd.get("field"))
  if (!courseId || !field || !ctx.modules.has("courses")) return { error: t("errors.invalid_input") }
  const { data: c } = await ctx.supabase.from("courses").select("title, instructor, capacity, location_id, track_attendance, description").eq("id", courseId).eq("org_id", ctx.org.id).maybeSingle()
  if (!c) return { error: t("errors.not_allowed") }
  const current: Record<string, string> = { ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v == null ? "" : String(v)])), [field]: String(fd.get("value") ?? "") }
  const r = readCourse((k) => current[k] ?? "")
  if ("error" in r) return { error: msg(t, r.error) }
  const { error } = await ctx.supabase.from("courses").update({ [field]: r.row[field] } as TablesUpdate<"courses">).eq("id", courseId).eq("org_id", ctx.org.id)
  if (error) return { error: dbError(t, error) }
  if (field === "capacity") deliverSoon() // more places move people up from the waiting list
  revalidatePath(`/courses/${courseId}`)
  return {}
}

/** Attendance, one tap at a time (the session page on a phone): `present` for these participants of the date. */
export async function markAttendance(input: { sessionId: string; participantIds: string[]; present: boolean }): Promise<{ error?: string }> {
  const ctx = await requirePerm("courses.manage")
  const t = await getT()
  const ids = input.participantIds.filter((p) => UUID.test(p))
  if (!UUID.test(input.sessionId) || !ids.length || !ctx.modules.has("courses")) return { error: t("errors.invalid_input") }
  const { error } = await ctx.supabase
    .from("course_attendance")
    .upsert(ids.map((p) => ({ org_id: ctx.org.id, session_id: input.sessionId, participant_id: p, present: input.present })), { onConflict: "session_id,participant_id" })
  return error ? { error: dbError(t, error) } : {}
}
