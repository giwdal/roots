"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { readAbsence, readEmployee, readPrivate } from "@/hr/fields"
import type { TablesUpdate } from "@/lib/supabase/types"

const UUID = /^[0-9a-f-]{36}$/
const getter = (fd: FormData) => (k: string) => String(fd.get(k) ?? "")
const ret = (fd: FormData, fallback: string) => {
  const r = String(fd.get("return") ?? "")
  return r.startsWith("/hr") ? r : fallback
}

async function manager() {
  const ctx = await requirePerm("hr.manage")
  const t = await getT()
  if (!ctx.modules.has("hr")) back("/hr", { error: t("errors.not_allowed") })
  return { ctx, t }
}
const fail = (t: Awaited<ReturnType<typeof getT>>, r: { error: string; field?: string }) => (t.has(r.error) ? t.dynamic(r.error) : t("errors.invalid_input"))

/** Create (→ the new page) or update an employee. */
export async function saveEmployee(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const here = UUID.test(id) ? `/hr/${id}?edit=details` : "/hr/new"
  // Employees are org members: the person comes from the member's profile (name, email), their shift team row
  // (if any) is linked automatically. Only the contract data is entered here.
  const userArg = String(fd.get("user_id") ?? "")
  const userId = UUID.test(id) ? null : UUID.test(userArg) ? userArg : null
  if (!UUID.test(id) && !userId) back(here, { error: t("hr.pickMember") })
  let profileName = ""
  if (userId) {
    const [{ data: member }, { data: profile }] = await Promise.all([
      ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id).eq("user_id", userId).maybeSingle(),
      ctx.supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    ])
    if (!member) back(here, { error: t("hr.pickMember") })
    profileName = profile?.full_name || profile?.email || "–"
    fd.set("name", profileName)
    fd.set("email", profile?.email ?? "")
  }
  const r = readEmployee(getter(fd))
  if ("error" in r) back(here, { error: fail(t, r) })
  if (userId) {
    r.row.user_id = userId
    r.row.staff_id = (await ctx.supabase.from("staff").select("id").eq("org_id", ctx.org.id).eq("user_id", userId).maybeSingle()).data?.id ?? null
  }
  // Updates keep the linked account (name/email from the profile at creation). The shift-team link changes only when
  // the form has the picker (people who see the team), and only to a team member of this org.
  const contract = Object.fromEntries(Object.entries(r.row).filter(([k]) => !["name", "email", "user_id", "staff_id"].includes(k))) as TablesUpdate<"employees">
  if (UUID.test(id)) {
    if (fd.has("staff_id")) {
      const staffId = r.row.staff_id ?? null
      if (staffId && !(await ctx.supabase.from("staff").select("id").eq("id", staffId).eq("org_id", ctx.org.id).maybeSingle()).data) back(here, { error: t("errors.invalid_input") })
      contract.staff_id = staffId
    }
    const { error } = await ctx.supabase.from("employees").update(contract).eq("id", id).eq("org_id", ctx.org.id)
    if (error) back(here, { error: error.code === "23505" ? t("hr.staffTaken") : dbError(t, error) })
    back(`/hr/${id}`, { ok: t("hr.saved") })
  }
  const { data, error } = await ctx.supabase
    .from("employees")
    .insert({ ...r.row, org_id: ctx.org.id })
    .select("id")
    .single()
  if (error) back(here, { error: error.code === "23505" ? t("hr.memberTaken") : dbError(t, error) })
  redirect(`/hr/${data.id}?ok=${encodeURIComponent(t("hr.created"))}`)
}

export async function savePrivate(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("employee_id") ?? "")
  const here = `/hr/${id}?edit=private`
  if (!UUID.test(id)) back("/hr", { error: t("errors.invalid_input") })
  const r = readPrivate(getter(fd))
  if ("error" in r) back(here, { error: fail(t, r) })
  const { error } = await ctx.supabase.from("employee_private").upsert({ ...r.row, org_id: ctx.org.id, employee_id: id }, { onConflict: "employee_id" })
  if (error) back(here, { error: dbError(t, error) })
  back(`/hr/${id}#private`, { ok: t("hr.saved") })
}

export async function trashEmployee(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.employees", p_id: id })
  if (error) back(`/hr/${id}`, { error: dbError(t, error) })
  back("/hr", { ok: t("hr.trashed") })
}

export async function restoreEmployee(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const here = ret(fd, `/hr/${id}`)
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.employees", p_id: id })
  if (error) back(here, { error: error.code === "23505" ? t("hr.memberTaken") : dbError(t, error) })
  back(here, { ok: t("hr.restored") })
}

export async function saveAbsence(fd: FormData) {
  const { ctx, t } = await manager()
  const here = ret(fd, "/hr/absences")
  // Errors reopen the sheet (the SaveBar puts back what was typed).
  const id = String(fd.get("id") ?? "")
  const retry = `${here}${here.includes("?") ? "&" : "?"}${UUID.test(id) ? `edit=${id}` : "new=absence"}`
  const employee = String(fd.get("employee_id") ?? "")
  if (!UUID.test(employee)) back(retry, { error: t("hr.pickEmployee") })
  const r = readAbsence(getter(fd))
  if ("error" in r) back(retry, { error: fail(t, r) })
  const { error } = UUID.test(id)
    ? await ctx.supabase.from("absences").update({ ...r.row, employee_id: employee }).eq("id", id).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("absences").insert({ ...r.row, employee_id: employee, org_id: ctx.org.id })
  if (error) back(retry, { error: dbError(t, error) })
  const clean = new URL(here, "http://x")
  ;["new", "edit"].forEach((k) => clean.searchParams.delete(k))
  back(clean.pathname + clean.search, { ok: t("hr.absenceSaved") })
}

export async function deleteAbsence(fd: FormData) {
  const { ctx, t } = await manager()
  const here = ret(fd, "/hr/absences")
  const { error } = await ctx.supabase.from("absences").delete().eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  const clean = new URL(here, "http://x")
  clean.searchParams.delete("edit")
  back(clean.pathname + clean.search, { ok: t("hr.absenceDeleted") })
}

/** Link the HR record to the shift-team member of the same account (their approved hours count for pay). */
export async function linkStaff(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { data: e } = await ctx.supabase.from("employees").select("user_id").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  const { data: staff } = e?.user_id ? await ctx.supabase.from("staff").select("id").eq("org_id", ctx.org.id).eq("user_id", e.user_id).maybeSingle() : { data: null }
  if (!staff) back(`/hr/${id}#pay`, { error: t("hr.noStaffRow") })
  const { error } = await ctx.supabase.from("employees").update({ staff_id: staff.id }).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(`/hr/${id}#pay`, { error: error.code === "23505" ? t("hr.staffTaken") : dbError(t, error) })
  back(`/hr/${id}#pay`, { ok: t("hr.staffLinked") })
}

// --- Pickers (server search, ≤ 20 hits) ---------------------------------------------------------
const clean = (q: string) => q.replace(/[%,()*]/g, "").trim().slice(0, 60)

/** People with an HR record (manager, absence person). */
export async function searchEmployees(q: string) {
  const ctx = await getContext()
  if (!ctx.modules.has("hr") || !ctx.can("hr.view")) return []
  let query = ctx.supabase.from("employees").select("id, name, job_title").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(20)
  if (clean(q)) query = query.ilike("name", `%${clean(q)}%`)
  const { data } = await query
  return (data ?? []).map((e) => ({ id: e.id, label: e.name, detail: e.job_title ?? undefined }))
}

/** Organisation members without an HR record yet (name or email). */
export async function searchMembers(q: string) {
  const { ctx } = await manager()
  const [{ data: members }, { data: people }] = await Promise.all([
    ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id),
    ctx.supabase.from("employees").select("user_id").eq("org_id", ctx.org.id).is("deleted_at", null),
  ])
  const taken = new Set((people ?? []).map((p) => p.user_id))
  const free = (members ?? []).map((m) => m.user_id).filter((u) => !taken.has(u))
  if (!free.length) return []
  let query = ctx.supabase.from("profiles").select("id, full_name, email").in("id", free).order("full_name").limit(20)
  if (clean(q)) query = query.or(`full_name.ilike.%${clean(q)}%,email.ilike.%${clean(q)}%`)
  const { data } = await query
  return (data ?? []).map((p) => ({ id: p.id, label: p.full_name || p.email || "–", detail: p.full_name ? (p.email ?? undefined) : undefined }))
}
