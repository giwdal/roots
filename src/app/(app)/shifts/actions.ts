"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { generateSeries } from "@/shifts/server"

const UUID = /^[0-9a-f-]{36}$/
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null
const id = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "")
  return UUID.test(v) ? v : null
}
const ret = (fd: FormData, fallback: string) => {
  const r = String(fd.get("return") ?? "")
  return r.startsWith("/shifts") || r === "/" ? r : fallback // "/" = Start's Jetzt card
}

async function manager() {
  const ctx = await requirePerm("shifts.manage")
  const t = await getT()
  if (!ctx.modules.has("shifts")) back("/shifts", { error: t("errors.not_allowed") })
  return { ctx, t }
}

// --- Shifts -------------------------------------------------------------------------------------
export async function saveShift(fd: FormData) {
  const { ctx, t } = await manager()
  const shiftId = id(fd, "id")
  const back_ = ret(fd, "/shifts")
  const starts = fromLocalInput(String(fd.get("starts_at") ?? ""))
  const ends = fromLocalInput(String(fd.get("ends_at") ?? ""))
  // On an error a new shift's drawer opens again with the times that were entered (e.g. dragged in the calendar).
  const assignTo = shiftId ? null : id(fd, "assign")
  const times =
    (!shiftId && starts && ends ? `&start=${encodeURIComponent(starts.toISOString())}&end=${encodeURIComponent(ends.toISOString())}` : "") +
    (assignTo ? `&resource=${assignTo}` : "")
  const retry = `${back_}${back_.includes("?") ? "&" : "?"}${shiftId ? `edit=${shiftId}` : `new=shift${times}`}`
  const needed = Number(fd.get("needed") ?? 1)
  if (!starts || !ends) back(retry, { error: t("errors.invalid_time") })
  if (ends <= starts) back(retry, { error: t("errors.end_before_start") })
  if (!(Number.isInteger(needed) && needed >= 1 && needed <= 100)) back(retry, { error: t("errors.invalid_input") })
  const row = {
    title: str(fd, "title", 100),
    position_id: id(fd, "position"),
    location_id: id(fd, "location"),
    event_id: id(fd, "event"),
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    needed,
    open: fd.get("open") === "1",
    notes: str(fd, "notes", 2000),
  }
  if (!row.title && !row.position_id) back(retry, { error: t("shifts.needTitle") })
  const { data: saved, error } = shiftId
    ? await ctx.supabase.from("shifts").update(row).eq("id", shiftId).eq("org_id", ctx.org.id).select("id").single()
    : await ctx.supabase.from("shifts").insert({ ...row, org_id: ctx.org.id }).select("id").single()
  if (error || !saved) back(retry, { error: dbError(t, error) })
  // New shift from a person's column: assign them (only someone of this org's team).
  if (assignTo) {
    const { data: person } = await ctx.supabase.from("staff").select("id").eq("id", assignTo).eq("org_id", ctx.org.id).maybeSingle()
    if (person) {
      const { error: aErr } = await ctx.supabase.from("shift_assignments").insert({ org_id: ctx.org.id, shift_id: saved.id, staff_id: person.id, status: "assigned" })
      if (aErr) back(back_, { error: dbError(t, aErr) })
      deliverSoon()
    }
  }
  back(back_, { ok: t("shifts.saved") })
}

export async function deleteShift(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.from("shifts").delete().eq("id", String(fd.get("id"))).eq("org_id", ctx.org.id)
  if (error) back(ret(fd, "/shifts"), { error: dbError(t, error) })
  back(ret(fd, "/shifts"), { ok: t("shifts.deleted") })
}

// Assign a person, approve an application, remove, or set check-in/out by hand.
export async function assign(fd: FormData) {
  const { ctx, t } = await manager()
  const shift = id(fd, "id")
  const staff = id(fd, "staff")
  const back_ = `${ret(fd, "/shifts")}${ret(fd, "/shifts").includes("?") ? "&" : "?"}edit=${shift}`
  if (!shift || !staff) back(back_, { error: t("errors.invalid_input") })
  const what = String(fd.get("what") ?? "assign")
  const q = ctx.supabase.from("shift_assignments")
  const entries = ctx.supabase.from("time_entries")
  const now = new Date().toISOString()
  // Check-in/out on someone's behalf = their time entry for this shift.
  const { error } =
    what === "remove"
      ? await q.delete().eq("shift_id", shift).eq("staff_id", staff).eq("org_id", ctx.org.id)
      : what === "check_in"
        ? await entries.insert({ org_id: ctx.org.id, staff_id: staff, shift_id: shift, started_at: now })
        : what === "check_out"
          ? await entries.update({ ended_at: now }).eq("shift_id", shift).eq("staff_id", staff).eq("org_id", ctx.org.id).is("ended_at", null)
          : await q.upsert({ org_id: ctx.org.id, shift_id: shift, staff_id: staff, status: "assigned" }, { onConflict: "shift_id,staff_id" })
  if (error) back(back_, { error: dbError(t, error) })
  deliverSoon()
  back(back_, { ok: t.dynamic(`shifts.done.${what}`) })
}

// --- Team ---------------------------------------------------------------------------------------
export async function saveStaff(fd: FormData) {
  const { ctx, t } = await manager()
  const staffId = id(fd, "id")
  const user = id(fd, "user")
  const retry = `/shifts/team?${staffId ? `edit=${staffId}` : `new=staff${user ? `&user=${user}` : ""}`}`
  const targetRaw = String(fd.get("target_hours") ?? "").trim().replace(",", ".")
  const target = targetRaw ? Number(targetRaw) : null
  if ((!staffId && !user) || (target !== null && !(target >= 0 && target < 1000))) back(retry, { error: t("errors.invalid_input") })
  // Team = organisation members: name and email come from the member's profile.
  const row = {
    role_label: str(fd, "role_label", 100),
    target_hours: target,
    position_ids: fd.getAll("positions").map(String).filter((v) => UUID.test(v)),
    active: fd.getAll("active").includes("1"),
  }
  if (staffId) {
    const { error } = await ctx.supabase.from("staff").update(row).eq("id", staffId).eq("org_id", ctx.org.id)
    if (error) back(retry, { error: dbError(t, error) })
  } else {
    const { data: member } = await ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id).eq("user_id", user!).maybeSingle()
    const { data: profile } = await ctx.supabase.from("profiles").select("full_name, email").eq("id", user!).maybeSingle()
    if (!member) back(retry, { error: t("errors.not_allowed") })
    const { data: added, error } = await ctx.supabase.from("staff").insert({ ...row, org_id: ctx.org.id, user_id: user!, name: profile?.full_name || profile?.email || "–", email: profile?.email ?? null }).select("id").single()
    if (error) back(retry, { error: error.code === "23505" ? t("shifts.memberTaken") : dbError(t, error) })
    // The HR record of the same account gets its hours from this team member (RLS: only with hr.manage, else nothing).
    await ctx.supabase.from("employees").update({ staff_id: added.id }).eq("org_id", ctx.org.id).eq("user_id", user!).is("staff_id", null)
  }
  back("/shifts/team", { ok: t("shifts.saved") })
}

// --- Setup: positions + recurring series --------------------------------------------------------
/** All positions in one go (the settings page's rows): rows by index, saved rows keep their id, missing ones are deleted. */
export async function savePositions(fd: FormData) {
  const { ctx, t } = await manager()
  const here = "/shifts/settings"
  const ids = fd.getAll("pos_id").map(String)
  const names = fd.getAll("pos_name").map((v) => String(v).trim().slice(0, 100))
  const needed = fd.getAll("pos_needed").map((v) => Number(String(v).trim() || 1))
  const locs = fd.getAll("pos_location").map(String)
  const rows = names.map((name, i) => ({ id: UUID.test(ids[i] ?? "") ? ids[i] : null, name, needed: needed[i], location_id: UUID.test(locs[i] ?? "") ? locs[i] : null, position: i }))
  const filled = rows.filter((r) => r.name)
  if (filled.some((r) => !(Number.isInteger(r.needed) && r.needed >= 1 && r.needed <= 100))) back(here, { error: t("errors.invalid_input") })
  const { data: existing } = await ctx.supabase.from("positions").select("id").eq("org_id", ctx.org.id)
  const keep = new Set(filled.map((r) => r.id).filter(Boolean))
  const gone = (existing ?? []).map((p) => p.id).filter((id) => !keep.has(id))
  if (gone.length) {
    const { error } = await ctx.supabase.from("positions").delete().eq("org_id", ctx.org.id).in("id", gone)
    if (error) back(here, { error: dbError(t, error) })
  }
  for (const r of filled) {
    const row = { name: r.name, needed: r.needed, location_id: r.location_id, position: r.position }
    const { error } = r.id
      ? await ctx.supabase.from("positions").update(row).eq("id", r.id).eq("org_id", ctx.org.id)
      : await ctx.supabase.from("positions").insert({ ...row, org_id: ctx.org.id })
    if (error) back(here, { error: dbError(t, error) })
  }
  back(here, { ok: t("shifts.saved") })
}

export async function saveSeries(fd: FormData) {
  const { ctx, t } = await manager()
  const seriesId = id(fd, "id")
  const retry = `/shifts/settings?${seriesId ? `edit=${seriesId}` : "new=series"}`
  const weekdays = fd.getAll("weekdays").map(Number).filter((d) => d >= 1 && d <= 7)
  const every = Number(fd.get("every_weeks") ?? 1)
  const start = String(fd.get("start_date") ?? "")
  const end = String(fd.get("end_date") ?? "") || null
  const time = (k: string) => {
    const v = String(fd.get(k) ?? "")
    return /^\d{2}:\d{2}$/.test(v) ? v : null
  }
  const needed = Number(fd.get("needed") ?? 1)
  const [st, et] = [time("start_time"), time("end_time")]
  if (!weekdays.length || !(every >= 1 && every <= 8) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || (end && end < start) || !st || !et || st === et || !(needed >= 1 && needed <= 100))
    back(retry, { error: t("errors.invalid_input") })
  const row = {
    name: str(fd, "name", 100),
    position_id: id(fd, "position"),
    location_id: id(fd, "location"),
    weekdays,
    every_weeks: every,
    start_date: start,
    end_date: end,
    start_time: st!,
    end_time: et!,
    needed,
    default_staff: fd.getAll("default_staff").map(String).filter((v) => UUID.test(v)),
  }
  if (!row.name && !row.position_id) back(retry, { error: t("shifts.needTitle") })
  let sid = seriesId
  if (seriesId) {
    // Changing the rhythm: future generated shifts without anyone checked in are rebuilt.
    const { error } = await ctx.supabase.from("shift_series").update({ ...row, generated_until: null }).eq("id", seriesId).eq("org_id", ctx.org.id)
    if (error) back(retry, { error: dbError(t, error) })
    await ctx.supabase.from("shifts").delete().eq("series_id", seriesId).gt("starts_at", new Date().toISOString())
  } else {
    const { data, error } = await ctx.supabase.from("shift_series").insert({ ...row, org_id: ctx.org.id }).select("id").single()
    if (error) back(retry, { error: dbError(t, error) })
    sid = data.id
  }
  const n = await generateSeries(sid!)
  back("/shifts/settings", { ok: t("shifts.generated", { count: n }) })
}

export async function deleteSeries(fd: FormData) {
  const { ctx, t } = await manager()
  const seriesId = String(fd.get("id"))
  await ctx.supabase.from("shifts").delete().eq("series_id", seriesId).gt("starts_at", new Date().toISOString())
  const { error } = await ctx.supabase.from("shift_series").delete().eq("id", seriesId).eq("org_id", ctx.org.id)
  if (error) back("/shifts/settings", { error: dbError(t, error) })
  back("/shifts/settings", { ok: t("shifts.deleted") })
}

// --- Self-service (logged-in staff) -------------------------------------------------------------
export async function selfAction(fd: FormData) {
  const ctx = await requirePerm("shifts.self")
  const t = await getT()
  const action = String(fd.get("action"))
  const here = ret(fd, "/shifts/me")
  const { error } = await ctx.supabase.rpc("shift_self", { p_action: action, p_shift: String(fd.get("shift")) })
  if (error) back(here, { error: dbError(t, error) })
  deliverSoon()
  back(here, { ok: t.dynamic(`shifts.self.${action}`) })
}

// Calendar drag & drop: move a shift (same duration or resized). Returns an error text instead of redirecting.
export async function moveShift(shiftId: string, start: string, end: string): Promise<{ error?: string }> {
  const ctx = await requirePerm("shifts.manage")
  const t = await getT()
  const s = new Date(start), e = new Date(end)
  if (!UUID.test(shiftId) || isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return { error: t("errors.invalid_time") }
  const { error } = await ctx.supabase.from("shifts").update({ starts_at: s.toISOString(), ends_at: e.toISOString() }).eq("id", shiftId).eq("org_id", ctx.org.id)
  return error ? { error: dbError(t, error) } : {}
}

// --- Pickers (server search, ≤ 20 hits) ---------------------------------------------------------
const clean = (q: string) => q.replace(/[%,()*]/g, "").trim().slice(0, 60)

/** Active team members by name. `position` (bound): people not set up for it say so in the detail. */
export async function searchStaff(position: string, q: string) {
  const ctx = await getContext()
  if (!["shifts.view", "shifts.manage", "shifts.approve"].some((p) => ctx.can(p))) return []
  const t = await getT()
  let query = ctx.supabase.from("staff").select("id, name, role_label, position_ids").eq("org_id", ctx.org.id).eq("active", true).order("name").limit(20)
  if (clean(q)) query = query.ilike("name", `%${clean(q)}%`)
  const { data } = await query
  return (data ?? []).map((s) => ({ id: s.id, label: s.name, detail: position && s.position_ids.length && !s.position_ids.includes(position) ? t("shifts.notQualified") : (s.role_label ?? undefined) }))
}

/** Events for a shift: upcoming first (from yesterday on), by title when typing. */
export async function searchShiftEvents(q: string) {
  const { ctx, t } = await manager()
  let query = ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("starts_at").limit(20)
  query = clean(q) ? query.ilike("title", `%${clean(q)}%`) : query.gte("starts_at", new Date(Date.now() - 86_400_000).toISOString())
  const { data } = await query
  return (data ?? []).map((e) => ({ id: e.id, label: e.title, detail: t.date(e.starts_at, { dateStyle: "medium" }) }))
}

/** Organisation members who aren't on the team yet (name or email). */
export async function searchTeamCandidates(q: string) {
  const { ctx } = await manager()
  const [{ data: members }, { data: team }] = await Promise.all([
    ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id),
    ctx.supabase.from("staff").select("user_id").eq("org_id", ctx.org.id),
  ])
  const taken = new Set((team ?? []).map((s) => s.user_id))
  const free = (members ?? []).map((m) => m.user_id).filter((u) => !taken.has(u))
  if (!free.length) return []
  let query = ctx.supabase.from("profiles").select("id, full_name, email").in("id", free).order("full_name").limit(20)
  if (clean(q)) query = query.or(`full_name.ilike.%${clean(q)}%,email.ilike.%${clean(q)}%`)
  const { data } = await query
  return (data ?? []).map((p) => ({ id: p.id, label: p.full_name || p.email || "–", detail: p.full_name ? (p.email ?? undefined) : undefined }))
}
