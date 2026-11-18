"use server"

import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { pickedIds, trashMany } from "@/lib/bulk"
import { getContext, requirePerm } from "@/lib/context"
import { loadFields, readCustom, type FieldDef } from "@/lib/custom-fields"
import { formatMoney } from "@/lib/inputs"
import type { TablesUpdate } from "@/lib/supabase/types"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { FAMILY_DEFAULTS, familyOf, readObject, readRate, readRental } from "@/rentals/fields"
import * as rentals from "@/rentals/server"

const PATH = "/rentals"
const UUID = /^[0-9a-f-]{36}$/
const s = (fd: FormData, key: string) => String(fd.get(key) ?? "")
const idOf = (fd: FormData, key = "id") => (UUID.test(s(fd, key)) ? s(fd, key) : "")
const message = (t: T, f: rentals.RentalFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))
const fieldError = (t: T, e: { error: string; field?: string }) => (e.field ? `${e.field}: ` : "") + t.dynamic(e.error)
// Forms say where they came from (object page, rental page, list); App paths only.
const backTo = (fd: FormData, fallback: string) => {
  const b = s(fd, "back")
  return b.startsWith("/rentals") ? b : fallback
}
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
// datetime-local or a bare date (long-term contracts) → ISO; "" stays "".
const when = (v: string, endOfDay = false) => (!v ? "" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? (fromLocalInput(`${v}T${endOfDay ? "23:59" : "00:00"}`)?.toISOString() ?? "x") : (fromLocalInput(v)?.toISOString() ?? "x"))

async function manager() {
  revalidatePath(PATH, "layout")
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  if (!ctx.modules.has("rentals")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

// ---------- objects ----------

export async function saveObjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd) || null
  const here = id ? `${PATH}/${id}` : `${PATH}/new`
  const r = readObject((k) => s(fd, k))
  if ("error" in r) back(here, { error: fieldError(t, r) })
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "rental_objects"), (k) => s(fd, `custom.${k}`))
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  // New objects get the family's defaults unless the form says otherwise.
  if (!id && !fd.has("options")) Object.assign(r.row, FAMILY_DEFAULTS[r.row.family])
  const x = await rentals.saveObject(ctx.supabase, ctx.org.id, id, r.row, c.custom)
  if ("error" in x) back(here, { error: message(t, x) })
  back(`${PATH}/${x.id}`, { ok: id ? t("rentals.saved") : t("rentals.created") })
}

export async function trashObjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.rental_objects", p_id: idOf(fd) })
  back(error ? `${PATH}/${idOf(fd)}` : PATH, error ? { error: dbError(t, error) } : { ok: t("rentals.objectTrashed") })
}

/** "+ Schlüssel" (one) or "+ mehrere…" (count): children named <prefix>-<n>. */
export async function addChildrenAction(fd: FormData) {
  const { ctx, t } = await manager()
  const parent = idOf(fd, "parent_id")
  const kind = s(fd, "kind") || "key"
  const family = familyOf(kind)
  const count = Math.max(1, Math.min(100, Number(s(fd, "count")) || 1))
  const deposit = s(fd, "deposit").trim() ? Math.round(Number(s(fd, "deposit").replace(",", ".")) * 100) || null : null
  const r = await rentals.addChildren(ctx.supabase, ctx.org.id, parent, kind, family, s(fd, "prefix").trim().slice(0, 40) || t.dynamic(`rentals.kinds.${kind}`), count, { ...FAMILY_DEFAULTS[family], deposit_cents: deposit })
  back("error" in r ? `${PATH}/${parent}?new=children` : `${PATH}/${parent}`, "error" in r ? { error: message(t, r) } : { ok: t("rentals.childrenAdded", { count: r.ids.length }) })
}

// ---------- rates ----------

export async function saveRateAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const sheet = `${PATH}/${object}?${idOf(fd) ? `edit=${idOf(fd)}` : "new=rate"}`
  const r = readRate((k) => s(fd, k))
  if ("error" in r) back(sheet, { error: fieldError(t, r) })
  const x = await rentals.saveRate(ctx.supabase, ctx.org.id, object, idOf(fd) || null, r.row)
  back("error" in x ? sheet : `${PATH}/${object}`, "error" in x ? { error: message(t, x) } : { ok: t("rentals.rateSaved") })
}

export async function deleteRateAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const { error } = await ctx.supabase.from("rental_rates").delete().eq("id", idOf(fd)).eq("org_id", ctx.org.id)
  back(`${PATH}/${object}`, error ? { error: dbError(t, error) } : { ok: t("rentals.rateDeleted") })
}

// ---------- rentals ----------

/** New contract / booking / loan. Empty price/terms are taken from the chosen rate. */
export async function createRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const here = `${PATH}/r/new?object=${object}`
  const rateId = idOf(fd, "rate_id")
  const { data: rate } = rateId ? await ctx.supabase.from("rental_rates").select("*").eq("id", rateId).eq("org_id", ctx.org.id).maybeSingle() : { data: null }
  const pick = (k: string, fromRate: unknown) => (s(fd, k).trim() ? s(fd, k) : fromRate == null ? "" : String(fromRate))
  const starts = when(s(fd, "starts_at"))
  // The term picker (long-term) posts the whole term itself; older/API-like forms fall back to the rate.
  const ownTerm = fd.has("term_mode")
  // A fixed first term from the rate: end = start + term (unless an end was entered).
  const termEnd = !ownTerm && !s(fd, "ends_at") && rate?.term_months && starts && starts !== "x" ? new Date(new Date(starts).setMonth(new Date(starts).getMonth() + rate.term_months) - 1000).toISOString() : ""
  const get = (k: string) =>
    k === "starts_at" ? starts
    : k === "ends_at" ? when(s(fd, "ends_at"), true) || termEnd
    : k === "price" ? (s(fd, "price").trim() || (rate ? (rate.price_cents / 100).toFixed(2) : ""))
    : k === "deposit" ? (s(fd, "deposit").trim() || (rate?.deposit_cents != null ? (rate.deposit_cents / 100).toFixed(2) : ""))
    : k === "unit" ? pick("unit", rate?.unit)
    : k === "renew_months" ? (ownTerm ? s(fd, k) : pick("renew_months", rate?.renew_months))
    : k === "notice_months" ? (ownTerm ? s(fd, k) : pick("notice_months", rate?.notice_months))
    : s(fd, k)
  const r = readRental(get)
  if ("error" in r) back(here, { error: fieldError(t, r) })
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "rentals"), (k) => s(fd, `custom.${k}`))
  if ("error" in c) back(here, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const people = fd.getAll("contact_id").map(String).filter((x) => UUID.test(x)).map((contact_id) => ({ contact_id, role: "main" as const }))
  const x = await rentals.createRental(ctx.supabase, ctx.org.id, { object_id: object, rate_id: rateId || null, parent_id: idOf(fd, "parent_id") || null, row: r.row, people, custom: c.custom })
  if ("error" in x) back(here, { error: message(t, x) })
  deliverSoon()
  // Long-term with a tenant: go straight on to the contract (own template first, else roots' default).
  const { data: tpl } =
    r.row.unit === "month" || r.row.unit === "year"
      ? await ctx.supabase.from("letter_templates").select("id, org_id").or(`org_id.is.null,org_id.eq.${ctx.org.id}`).is("deleted_at", null).ilike("body", "%{rental\\_%").order("org_id", { nullsFirst: false }).limit(1).maybeSingle()
      : { data: null }
  back(tpl && people.length && ctx.can("org.files.view") ? `${PATH}/r/${x.id}?new=contract&template=${tpl.id}` : `${PATH}/r/${x.id}`, { ok: t(tpl && people.length ? "rentals.createdContract" : "rentals.created") })
}

export async function addPersonAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const contact = idOf(fd, "contact_id")
  const role = s(fd, "role") === "member" ? "member" : "main"
  if (!contact) back(`${PATH}/r/${id}?new=person`, { error: t("courses.pickContact") })
  const { error } = await ctx.supabase.from("rental_contacts").upsert({ org_id: ctx.org.id, rental_id: id, contact_id: contact, role }, { onConflict: "rental_id,contact_id" })
  deliverSoon()
  back(error ? `${PATH}/r/${id}?new=person` : `${PATH}/r/${id}#people`, error ? { error: dbError(t, error) } : { ok: t("rentals.personAdded") })
}

export async function removePersonAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const { error } = await ctx.supabase.from("rental_contacts").delete().eq("rental_id", id).eq("contact_id", idOf(fd, "contact_id")).eq("org_id", ctx.org.id)
  back(`${PATH}/r/${id}#people`, error ? { error: dbError(t, error) } : { ok: t("rentals.personRemoved") })
}

export async function giveNoticeAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const x = await rentals.giveNotice(ctx.supabase, ctx.org.id, id, s(fd, "ends_on") || null, today())
  deliverSoon()
  back("error" in x ? `${PATH}/r/${id}?edit=notice` : `${PATH}/r/${id}`, "error" in x ? { error: message(t, x) } : { ok: t("rentals.noticeGiven", { date: t.date(`${x.ends}T12:00:00`, { dateStyle: "medium" }) }) })
}

/** Key / device handed out to one person (optionally on the rental of the parent object). */
export async function handOutAction(fd: FormData) {
  const { ctx, t } = await manager()
  const object = idOf(fd, "object_id")
  const to = backTo(fd, `${PATH}/${object}`)
  // Errors reopen the sheet (?new=handout, &item= when it was a part of the page's object).
  const sheet = `${to}?new=handout${s(fd, "item") ? `&item=${object}` : ""}`
  const contact = idOf(fd, "contact_id")
  if (!contact) back(sheet, { error: t("courses.pickContact") })
  const r = readRental((k) => (k === "starts_at" ? when(s(fd, k) || today()) : k === "ends_at" ? "" : s(fd, k)))
  if ("error" in r) back(sheet, { error: fieldError(t, r) })
  const x = await rentals.createRental(ctx.supabase, ctx.org.id, { object_id: object, parent_id: idOf(fd, "parent_id") || null, row: r.row, people: [{ contact_id: contact, role: "main" }] })
  deliverSoon()
  back("error" in x ? sheet : to, "error" in x ? { error: message(t, x) } : { ok: t("rentals.handedOut") })
}

export async function returnAction(fd: FormData) {
  const { ctx, t } = await manager()
  const x = await rentals.endNow(ctx.supabase, ctx.org.id, idOf(fd), fd.get("deposit_back") === "on")
  back(backTo(fd, PATH), "error" in x ? { error: message(t, x) } : { ok: t("rentals.returned") })
}

export async function trashRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.rentals", p_id: idOf(fd) })
  back(backTo(fd, `${PATH}/list`), error ? { error: dbError(t, error) } : { ok: t("rentals.trashed") })
}

export async function bulkTrashRentals(fd: FormData) {
  const { ctx, t } = await manager()
  const ids = pickedIds(fd)
  const error = ids.length ? await trashMany(ctx, "public.rentals", ids) : null
  back(backTo(fd, `${PATH}/list`), error ? { error: dbError(t, error) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
}

export async function restoreObjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.rental_objects", p_id: idOf(fd) })
  back(error ? `${PATH}?trash=1` : `${PATH}/${idOf(fd)}`, error ? { error: dbError(t, error) } : { ok: t("rentals.restored") })
}

export async function restoreRentalAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.rentals", p_id: idOf(fd) })
  back(error ? `${PATH}/list?trash=1` : `${PATH}/r/${idOf(fd)}`, error ? { error: dbError(t, error) } : { ok: t("rentals.restored") })
}

// ---------- in place (record pages, patterns.md §8) ----------

/** Objects for a search picker ("Gehört zu", "Welches Objekt?"): name match, ≤ 20. */
export async function searchObjects(q: string) {
  const ctx = await getContext()
  if (!ctx.modules.has("rentals") || !ctx.can("rentals.view")) return []
  const t = await getT()
  const clean = q.replace(/[%,()*]/g, "").trim()
  let query = ctx.supabase.from("rental_objects").select("id, name, kind").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(20)
  if (clean) query = query.ilike("name", `%${clean}%`)
  const { data } = await query
  return (data ?? []).map((o) => ({ id: o.id, label: o.name, detail: t.has(`rentals.kinds.${o.kind}`) ? t.dynamic(`rentals.kinds.${o.kind}`) : o.kind }))
}

// Stored custom values in form format ("12,50", "true"), so readCustom checks the record with one changed value.
const customAsForm = (defs: FieldDef[], stored: unknown) => {
  const v = (stored ?? {}) as Record<string, unknown>
  return Object.fromEntries(defs.map((d) => [d.key, v[d.key] == null ? "" : d.type === "money" && typeof v[d.key] === "number" ? (v[d.key] as number).toFixed(2).replace(".", ",") : String(v[d.key])]))
}
const OBJECT_FIELDS: Record<string, keyof TablesUpdate<"rental_objects">> = { name: "name", kind: "kind", location_id: "location_id", status: "status", description: "description", rentable: "rentable", lendable: "lendable", included: "included", capacity: "capacity", deposit: "deposit_cents" }

/** One property of an object (InlineField): the stored object in form format with the new value, checked by readObject. */
export async function patchRentalObject(fd: FormData): Promise<{ error?: string }> {
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  const id = idOf(fd)
  const field = s(fd, "field")
  const value = s(fd, "value")
  if (!id || !ctx.modules.has("rentals") || (!OBJECT_FIELDS[field] && !/^custom\.[a-z0-9_]+$/.test(field))) return { error: t("errors.invalid_input") }
  const { data: o } = await ctx.supabase.from("rental_objects").select(rentals.OBJECT_COLS).eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!o) return { error: t("errors.not_allowed") }
  let update: TablesUpdate<"rental_objects">
  if (field.startsWith("custom.")) {
    const defs = await loadFields(ctx.supabase, ctx.org.id, "rental_objects")
    const current = { ...customAsForm(defs, o.custom), [field.slice(7)]: value }
    const c = readCustom(defs, (k) => current[k] ?? "")
    if ("error" in c) return { error: `${c.field}: ${t.dynamic(c.error)}` }
    update = { custom: c.custom as TablesUpdate<"rental_objects">["custom"] }
  } else {
    const current: Record<string, string> = {
      ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])),
      deposit: o.deposit_cents != null ? formatMoney(o.deposit_cents) : "",
      [field]: value,
    }
    const r = readObject((k) => current[k] ?? "")
    if ("error" in r) return { error: fieldError(t, r) }
    const column = OBJECT_FIELDS[field]
    update = { [column]: r.row[column as keyof typeof r.row] }
    if (field === "kind") update.family = r.row.family
  }
  const { error } = await ctx.supabase.from("rental_objects").update(update).eq("id", id).eq("org_id", ctx.org.id)
  if (error) return { error: dbError(t, error) }
  revalidatePath(PATH, "layout")
  return {}
}

/** "Gehört zu" (?edit=parent): the object above this one, or the top level. */
export async function saveParentAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const parent = idOf(fd, "parent_id") || null
  if (parent === id) back(`${PATH}/${id}?edit=parent`, { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("rental_objects").update({ parent_id: parent }).eq("id", id).eq("org_id", ctx.org.id)
  back(error ? `${PATH}/${id}?edit=parent` : `${PATH}/${id}`, error ? { error: dbError(t, error) } : { ok: t("rentals.saved") })
}

/** The stored rental as readRental input (times as ISO), with `changes` on top: one check for every partial change. */
async function rentalWith(ctx: Awaited<ReturnType<typeof requirePerm>>, id: string, changes: Record<string, string>) {
  const { data: r } = await ctx.supabase.from("rentals").select("starts_at, ends_at, status, price_cents, unit, renew_months, notice_months, deposit_cents, note, custom").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!r) return null
  const current: Record<string, string> = {
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? "",
    status: r.status,
    price: r.price_cents != null ? formatMoney(r.price_cents) : "",
    unit: r.unit ?? "",
    renew_months: r.renew_months != null ? String(r.renew_months) : "",
    notice_months: r.notice_months != null ? String(r.notice_months) : "",
    deposit: r.deposit_cents != null ? formatMoney(r.deposit_cents) : "",
    note: r.note ?? "",
    ...changes,
  }
  return { stored: r, checked: readRental((k) => current[k] ?? "") }
}
const RENTAL_FIELDS: Record<string, keyof TablesUpdate<"rentals">> = { price: "price_cents", unit: "unit", deposit: "deposit_cents", note: "note" }

/** One property of a rental (InlineField): price, unit, deposit, note, rate, custom fields. */
export async function patchRental(fd: FormData): Promise<{ error?: string }> {
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  const id = idOf(fd)
  const field = s(fd, "field")
  const value = s(fd, "value")
  if (!id || !ctx.modules.has("rentals")) return { error: t("errors.invalid_input") }
  let update: TablesUpdate<"rentals">
  if (field === "rate_id") {
    // A rate of the rental's own object, or none.
    if (value) {
      const { data: r } = await ctx.supabase.from("rentals").select("object_id").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
      const { data: rate } = r && UUID.test(value) ? await ctx.supabase.from("rental_rates").select("id").eq("id", value).eq("object_id", r.object_id).eq("org_id", ctx.org.id).maybeSingle() : { data: null }
      if (!rate) return { error: t("errors.invalid_input") }
    }
    update = { rate_id: value || null }
  } else if (/^custom\.[a-z0-9_]+$/.test(field)) {
    const [{ data: r }, defs] = await Promise.all([ctx.supabase.from("rentals").select("custom").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(), loadFields(ctx.supabase, ctx.org.id, "rentals")])
    if (!r) return { error: t("errors.not_allowed") }
    const current = { ...customAsForm(defs, r.custom), [field.slice(7)]: value }
    const c = readCustom(defs, (k) => current[k] ?? "")
    if ("error" in c) return { error: `${c.field}: ${t.dynamic(c.error)}` }
    update = { custom: c.custom as TablesUpdate<"rentals">["custom"] }
  } else if (RENTAL_FIELDS[field]) {
    const x = await rentalWith(ctx, id, { [field]: value })
    if (!x) return { error: t("errors.not_allowed") }
    if ("error" in x.checked) return { error: fieldError(t, x.checked) }
    const column = RENTAL_FIELDS[field] as "price_cents" | "unit" | "deposit_cents" | "note"
    update = { [column]: x.checked.row[column] }
  } else return { error: t("errors.invalid_input") }
  const { error } = await ctx.supabase.from("rentals").update(update).eq("id", id).eq("org_id", ctx.org.id)
  if (error) return { error: dbError(t, error) }
  revalidatePath(PATH, "layout")
  return {}
}

/** The term (?edit=term): start, end, renewal, notice period — the rest of the rental stays. */
export async function saveTermAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const sheet = `${PATH}/r/${id}?edit=term`
  const changes: Record<string, string> = { starts_at: when(s(fd, "starts_at")), ends_at: when(s(fd, "ends_at"), true) }
  if (fd.has("term_mode")) {
    changes.renew_months = s(fd, "renew_months")
    changes.notice_months = s(fd, "notice_months")
  }
  const x = await rentalWith(ctx, id, changes)
  if (!x) back(`${PATH}/list`, { error: t("errors.not_allowed") })
  if ("error" in x.checked) back(sheet, { error: fieldError(t, x.checked) })
  const { starts_at, ends_at, renew_months, notice_months } = x.checked.row
  const r = await rentals.updateRental(ctx.supabase, ctx.org.id, id, { starts_at, ends_at, renew_months, notice_months })
  back("error" in r ? sheet : `${PATH}/r/${id}`, "error" in r ? { error: message(t, r) } : { ok: t("rentals.saved") })
}

/** Confirm a request, cancel, or confirm again (header actions; cancelling asks first). */
export async function setRentalStatusAction(fd: FormData) {
  const { ctx, t } = await manager()
  const id = idOf(fd)
  const status = (["confirmed", "cancelled", "request"] as const).find((x) => x === s(fd, "status"))
  if (!id || !status) back(`${PATH}/list`, { error: t("errors.invalid_input") })
  const r = await rentals.updateRental(ctx.supabase, ctx.org.id, id, { status })
  deliverSoon()
  back(`${PATH}/r/${id}`, "error" in r ? { error: message(t, r) } : { ok: t(status === "cancelled" ? "rentals.cancelledOk" : "rentals.confirmedOk") })
}
