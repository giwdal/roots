"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { back } from "@/lib/url"
import type { ImportOutcome } from "@/components/csv-import"
import { importContactRows, uniqueError } from "@/contacts/server"
import { fromForm, parseTags, readContact } from "./fields"
import type { TablesUpdate } from "@/lib/supabase/types"

const PATH = "/contacts"

async function manager() {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  if (!ctx.modules.has("crm")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

// Record id comes in as a hidden field (works without JS and is callable by plain form posts).
const idOf = (fd: FormData) => String(fd.get("id") ?? "")
type Ctx = Awaited<ReturnType<typeof requirePerm>>
type T = Awaited<ReturnType<typeof getT>>
const fieldError = (t: T, e: { error: string; field?: string }) => (e.field ? `${e.field}: ` : "") + t.dynamic(e.error)
const readForm = async (ctx: Ctx, fd: FormData) => readContact(fromForm(fd), await loadFields(ctx.supabase, ctx.org.id, "contacts"))

export async function createContact(fd: FormData) {
  const { ctx, t } = await manager()
  const r = await readForm(ctx, fd)
  if ("error" in r) back(`${PATH}/new`, { error: fieldError(t, r) })
  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert({ ...r.row, org_id: ctx.org.id })
    .select("id")
    .single()
  if (error) back(`${PATH}/new`, { error: uniqueError(t, error) })
  deliverSoon()
  back(`${PATH}/${data.id}`, { ok: t("contacts.created") })
}

export async function updateContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}/${id}`
  const sheet = `${here}?edit=details` // errors come back to the open edit sheet (its SaveBar puts the typed values back)
  const r = await readForm(ctx, fd)
  if ("error" in r) back(sheet, { error: fieldError(t, r) })
  const { error, count } = await ctx.supabase.from("contacts").update(r.row, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(sheet, { error: error ? uniqueError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("contacts.saved") })
}

// One value edited in place (InlineField) or a small group (the address dialog): the stored contact in form format,
// the new values on top, checked by readContact like the full form, then only those columns are written.
const PATCHABLE = new Set(["first_name", "last_name", "company", "email", "phone", "birthday", "street", "postal_code", "city", "country"])
async function patch(fd: FormData, fields: string[]): Promise<{ error?: string }> {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  const id = idOf(fd)
  if (!ctx.modules.has("crm") || !/^[0-9a-f-]{36}$/.test(id) || !fields.length || fields.some((f) => !PATCHABLE.has(f) && !/^custom\.[a-z0-9_]+$/.test(f))) return { error: t("errors.invalid_input") }
  const [{ data: c }, defs] = await Promise.all([ctx.supabase.from("contacts").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(), loadFields(ctx.supabase, ctx.org.id, "contacts")])
  if (!c) return { error: t("errors.not_allowed") }
  const custom = (c.custom ?? {}) as Record<string, unknown>
  const current: Record<string, string> = {
    ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v == null || typeof v === "object" ? "" : String(v)])),
    tags: (c.tags ?? []).join(", "),
    ...Object.fromEntries(defs.map((d) => [`custom.${d.key}`, custom[d.key] == null ? "" : d.type === "money" && typeof custom[d.key] === "number" ? (custom[d.key] as number).toFixed(2).replace(".", ",") : String(custom[d.key])])),
  }
  for (const f of fields) current[f === "value" ? String(fd.get("field")) : f] = String(fd.get(f) ?? "")
  const r = readContact((k) => current[k] ?? "", defs)
  if ("error" in r) return { error: fieldError(t, r) }
  const names = fields.map((f) => (f === "value" ? String(fd.get("field")) : f))
  const update = Object.fromEntries(names.map((n) => (n.startsWith("custom.") ? ["custom", r.row.custom] : [n, r.row[n as keyof typeof r.row]])))
  const { error } = await ctx.supabase.from("contacts").update(update as TablesUpdate<"contacts">).eq("id", id).eq("org_id", ctx.org.id)
  if (error) return { error: uniqueError(t, error) }
  return {}
}

/** InlineField: one contact value (`field` + `value`). */
export async function patchContact(fd: FormData) {
  const field = String(fd.get("field") ?? "")
  if (!PATCHABLE.has(field) && !/^custom\.[a-z0-9_]+$/.test(field)) return { error: (await getT())("errors.invalid_input") }
  return patch(fd, ["value"])
}

/** The address dialog (street, postal code, city, country together). */
export async function saveContactAddress(fd: FormData) {
  const id = idOf(fd)
  const r = await patch(fd, ["street", "postal_code", "city", "country"])
  if (r.error) back(`${PATH}/${id}?edit=address`, { error: r.error })
  back(`${PATH}/${id}`, { ok: (await getT())("contacts.saved") })
}

export async function trashContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.contacts", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  back(PATH, { ok: t("contacts.trashed") })
}

export async function restoreContact(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.contacts", p_id: id })
  // A live contact took the email meanwhile → unique violation.
  if (error) back(`${PATH}/${id}`, { error: uniqueError(t, error) })
  back(`${PATH}/${id}`, { ok: t("contacts.restored") })
}

export async function addNote(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const here = `${PATH}/${id}`
  const body = String(fd.get("body") ?? "").trim()
  if (!body || body.length > 10000) back(here, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("contact_notes").insert({ org_id: ctx.org.id, contact_id: id, body })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("contacts.noteAdded") })
}

export async function deleteNote(fd: FormData) {
  const { ctx, t } = await manager()
  const here = `${PATH}/${idOf(fd)}`
  const { error, count } = await ctx.supabase
    .from("contact_notes")
    .delete({ count: "exact" })
    .eq("id", String(fd.get("note") ?? ""))
    .eq("org_id", ctx.org.id)
  if (error || !count) back(here, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("contacts.noteDeleted") })
}

// CSV import (see importContactRows): the App's entry point.
export async function importContacts(input: { rows: Record<string, string>[]; mode: "skip" | "update" }): Promise<ImportOutcome> {
  const ctx = await requirePerm("crm.manage")
  const t = await getT()
  if (!ctx.modules.has("crm")) return { error: t("errors.not_allowed") }
  const r = await importContactRows(ctx.supabase, ctx.org.id, input, t)
  if (!("error" in r)) deliverSoon()
  return r
}

/** Link this contact to a team member's App account (one person behind both), or unlink (user_id empty). */
export async function linkContactUser(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const user = String(fd.get("user_id") ?? "")
  const value = /^[0-9a-f-]{36}$/.test(user) ? user : null
  const { error } = await ctx.supabase.from("contacts").update({ user_id: value }).eq("id", id).eq("org_id", ctx.org.id)
  back(`${PATH}/${id}#team`, error ? { error: error.code === "23505" ? t("contacts.team.taken") : dbError(t, error) } : { ok: t(value ? "contacts.team.linked" : "contacts.team.unlinked") })
}

/** Bulk bar on the list: add/remove a tag on the ticked contacts, or move them to the trash. */
export async function bulkContacts(fd: FormData) {
  const { ctx, t } = await manager()
  const ids = [...new Set(fd.getAll("ids").map(String))].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 500)
  const intent = String(fd.get("intent") ?? "")
  const back$ = String(fd.get("back") ?? PATH)
  const to = back$.startsWith(PATH) ? back$ : PATH
  if (!ids.length) back(to, {})
  if (intent === "trash") {
    const results = await Promise.all(ids.map((id) => ctx.supabase.rpc("soft_delete", { p_table: "public.contacts", p_id: id })))
    const failed = results.find((r) => r.error)?.error
    back(to, failed ? { error: dbError(t, failed) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
  }
  // The bulk bar's <TagSelect> posts the picked tags comma-separated.
  const picked = parseTags(String(fd.get("bulk_tag") ?? ""))
  if (!picked.length || (intent !== "tag-add" && intent !== "tag-remove")) back(to, { error: t("errors.invalid_input") })
  const lower = new Set(picked.map((x) => x.toLowerCase()))
  const { data } = await ctx.supabase.from("contacts").select("id, tags").eq("org_id", ctx.org.id).in("id", ids)
  const changes = (data ?? [])
    .map((c) => ({ id: c.id, before: c.tags, tags: intent === "tag-add" ? parseTags([...c.tags, ...picked].join(",")) : c.tags.filter((x) => !lower.has(x.toLowerCase())) }))
    .filter((c) => c.tags.join("\n") !== c.before.join("\n"))
  const results = await Promise.all(changes.map((c) => ctx.supabase.from("contacts").update({ tags: c.tags }).eq("id", c.id).eq("org_id", ctx.org.id)))
  const failed = results.find((r) => r.error)?.error
  back(to, failed ? { error: dbError(t, failed) } : { ok: t("common.bulkDone", { count: changes.length }) })
}
