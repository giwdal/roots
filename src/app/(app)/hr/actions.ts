"use server"

import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { readAbsence, readEmployee, readPrivate } from "@/hr/fields"
import type { TablesUpdate } from "@/lib/supabase/types"
import { priceInput } from "@/tickets/price"

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
  const here = UUID.test(id) ? `/hr/${id}` : "/hr/new"
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
  // Updates keep the linked account (name/email from the profile at creation).
  const contract = Object.fromEntries(Object.entries(r.row).filter(([k]) => !["name", "email", "user_id", "staff_id"].includes(k))) as TablesUpdate<"employees">
  if (UUID.test(id)) {
    const { error } = await ctx.supabase.from("employees").update(contract).eq("id", id).eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
    back(here, { ok: t("hr.saved") })
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

// Fields a person page edits in place, form key → column (money fields are posted as "13,50").
const PATCHABLE: Record<string, string> = {
  job_title: "job_title",
  department: "department",
  phone: "phone",
  notes: "notes",
  employment_type: "employment_type",
  pay_type: "pay_type",
  hourly_rate: "hourly_rate_cents",
  monthly_salary: "monthly_salary_cents",
  weekly_hours: "weekly_hours",
  vacation_days: "vacation_days",
  starts_on: "starts_on",
  ends_on: "ends_on",
}

/** One property of a person, edited in place (<InlineField>): checked with the whole record's rules, saves that column. */
export async function patchEmployee(fd: FormData): Promise<{ error?: string }> {
  const ctx = await requirePerm("hr.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const field = String(fd.get("field") ?? "")
  const column = PATCHABLE[field]
  if (!UUID.test(id) || !column || !ctx.modules.has("hr")) return { error: t("errors.invalid_input") }
  const { data: e } = await ctx.supabase.from("employees").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!e) return { error: t("errors.not_allowed") }
  // The stored record in form format, with the one new value: readEmployee checks it in context (end after start …).
  const current: Record<string, string> = {
    ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v == null ? "" : String(v)])),
    hourly_rate: e.hourly_rate_cents != null ? priceInput(e.hourly_rate_cents) : "",
    monthly_salary: e.monthly_salary_cents != null ? priceInput(e.monthly_salary_cents) : "",
    [field]: String(fd.get("value") ?? ""),
  }
  const r = readEmployee((k) => current[k] ?? "")
  if ("error" in r) return { error: fail(t, r) }
  const { error } = await ctx.supabase
    .from("employees")
    .update({ [column]: r.row[column as keyof typeof r.row] } as TablesUpdate<"employees">)
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error) return { error: dbError(t, error) }
  return {}
}

/** Who a person reports to and their shift-team member (the person page's small sheet). */
export async function saveEmployeeLinks(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const here = `/hr/${id}?edit=links`
  const ref = (k: string) => (UUID.test(String(fd.get(k) ?? "")) ? String(fd.get(k)) : null)
  const row: TablesUpdate<"employees"> = { manager_id: ref("manager_id") }
  if (row.manager_id === id) back(here, { error: t("errors.invalid_input") })
  if (fd.has("staff_id")) row.staff_id = ref("staff_id")
  const { error } = await ctx.supabase.from("employees").update(row).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(here, { error: error.code === "23505" ? t("hr.staffTaken") : dbError(t, error) })
  back(`/hr/${id}`, { ok: t("hr.saved") })
}
