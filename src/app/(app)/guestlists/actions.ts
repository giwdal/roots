"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { linkToken, syncTickets, voidTicket } from "@/guestlists/server"
import { parsePrice } from "@/tickets/price"

const PATH = "/guestlists"
const UUID = /^[0-9a-f-]{36}$/

async function manager() {
  const ctx = await requirePerm("guestlists.manage")
  const t = await getT()
  if (!ctx.modules.has("guestlists")) back(PATH, { error: t("errors.not_allowed") })
  return { ctx, t }
}

export async function saveList(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const eventRaw = String(fd.get("event") ?? "")
  const eventId = UUID.test(eventRaw) ? eventRaw : null
  const retry = id ? `${PATH}/${id}?edit=list` : `${PATH}/new${eventId ? `?event=${eventId}` : ""}`
  const name = String(fd.get("name") ?? "").trim().slice(0, 100)
  const price = parsePrice(String(fd.get("door_price") ?? "0") || "0")
  const quotaRaw = String(fd.get("quota") ?? "").trim()
  const quota = quotaRaw ? Number(quotaRaw) : null
  const per = Number(fd.get("per_submission") ?? 5)
  const closesRaw = String(fd.get("link_closes_at") ?? "").trim()
  const closes = closesRaw ? fromLocalInput(closesRaw)?.toISOString() : null
  const artist = String(fd.get("artist") ?? "")
  const problem = !name
    ? "guestlists.nameRequired"
    : price === null
      ? "guestlists.priceInvalid"
      : quota !== null && !(Number.isInteger(quota) && quota > 0)
        ? "guestlists.quotaInvalid"
        : !(Number.isInteger(per) && per >= 1 && per <= 50)
          ? "guestlists.perInvalid"
          : closes === undefined
            ? "errors.invalid_date"
            : null
  if (problem) back(retry, { error: t.dynamic(problem) })
  const row = {
    name,
    door_price: price!,
    quota,
    per_submission: per,
    link_closes_at: closes,
    artist_id: UUID.test(artist) ? artist : null,
    notes: String(fd.get("notes") ?? "").trim().slice(0, 2000) || null,
  }
  if (id) {
    const { error } = await ctx.supabase.from("guest_lists").update(row).eq("id", id).eq("org_id", ctx.org.id)
    if (error) back(retry, { error: dbError(t, error) })
    await syncTickets(id)
    back(`${PATH}/${id}`, { ok: t("guestlists.saved") })
  }
  const { data, error } = await ctx.supabase
    .from("guest_lists")
    .insert({ ...row, org_id: ctx.org.id, event_id: eventId, link_token: linkToken() })
    .select("id")
    .single()
  if (error) back(retry, { error: dbError(t, error) })
  redirect(`${PATH}/${data.id}`)
}

/** One property of a list (InlineField / InlineTitle on the list page): checked like the form, only that column saved. */
export async function patchGuestList(fd: FormData): Promise<{ error?: string }> {
  const ctx = await requirePerm("guestlists.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const field = String(fd.get("field") ?? "")
  const value = String(fd.get("value") ?? "").trim()
  if (!UUID.test(id) || !ctx.modules.has("guestlists")) return { error: t("errors.invalid_input") }
  let update: { name?: string; door_price?: number; quota?: number | null; per_submission?: number; link_closes_at?: string | null; notes?: string | null }
  if (field === "name") {
    if (!value) return { error: t("guestlists.nameRequired") }
    update = { name: value.slice(0, 100) }
  } else if (field === "door_price") {
    const price = parsePrice(value || "0")
    if (price === null) return { error: t("guestlists.priceInvalid") }
    update = { door_price: price }
  } else if (field === "quota") {
    const quota = value ? Number(value.replace(/\./g, "")) : null
    if (quota !== null && !(Number.isInteger(quota) && quota > 0)) return { error: t("guestlists.quotaInvalid") }
    update = { quota }
  } else if (field === "per_submission") {
    const per = Number(value)
    if (!(Number.isInteger(per) && per >= 1 && per <= 50)) return { error: t("guestlists.perInvalid") }
    update = { per_submission: per }
  } else if (field === "link_closes_at") {
    const at = value ? fromLocalInput(value) : null
    if (value && !at) return { error: t("errors.invalid_date") }
    update = { link_closes_at: at?.toISOString() ?? null }
  } else if (field === "notes") update = { notes: value.slice(0, 2000) || null }
  else return { error: t("errors.invalid_input") }
  const { error, count } = await ctx.supabase.from("guest_lists").update(update, { count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) return { error: error ? dbError(t, error) : t("errors.not_allowed") }
  // The entries' free tickets follow the list (price, quota), like saving the whole form.
  if (field === "door_price" || field === "quota") await syncTickets(id)
  revalidatePath(`${PATH}/${id}`)
  return {}
}

export async function setLink(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const what = String(fd.get("link"))
  const patch = what === "renew" ? { link_token: linkToken(), link_enabled: true } : { link_enabled: what === "on" }
  const { error } = await ctx.supabase.from("guest_lists").update(patch).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  back(`${PATH}/${id}`, { ok: t.dynamic(`guestlists.link_${what}`) })
}

export async function trashList(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const [{ data: entries }, { data: list }] = await Promise.all([
    ctx.supabase.from("guest_entries").select("ticket_id").eq("list_id", id),
    ctx.supabase.from("guest_lists").select("event_id").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
  ])
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.guest_lists", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  for (const e of entries ?? []) await voidTicket(e.ticket_id)
  // An event's list: back where it was reached from (the event's Gästelisten).
  back(list?.event_id ? `/events/${list.event_id}/guestlists` : PATH, { ok: t("guestlists.trashed") })
}

// Restored lists get new tickets for their entries (the old ones were voided on trashing).
export async function restoreList(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.guest_lists", p_id: id })
  if (error) back(`${PATH}?trash=1`, { error: dbError(t, error) })
  await syncTickets(id)
  back(`${PATH}?trash=1`, { ok: t("guestlists.restored") })
}

/** Event picker of a new list: the org's events by title, upcoming first then the latest past ones (≤ 20). */
export async function searchListEvents(q: string) {
  const { ctx, t } = await manager()
  const clean = q.replace(/[%,()*]/g, "").trim()
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString()
  let query = ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("starts_at").limit(20)
  query = clean ? query.ilike("title", `%${clean}%`) : query.gte("starts_at", since)
  const { data } = await query
  return (data ?? []).map((e) => ({ id: e.id, label: e.title, detail: t.date(e.starts_at, { dateStyle: "medium" }) }))
}

/** Artist picker of a list (≤ 20 by name). */
export async function searchListArtists(q: string) {
  const { ctx } = await manager()
  const clean = q.replace(/[%,()*]/g, "").trim()
  let query = ctx.supabase.from("artists").select("id, name").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(20)
  if (clean) query = query.ilike("name", `%${clean}%`)
  const { data } = await query
  return (data ?? []).map((a) => ({ id: a.id, label: a.name }))
}

// Names: one per line ("Anna Muster", or "Anna Muster, anna@x.de").
export async function addEntries(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const here = `${PATH}/${id}`
  const retry = `${here}?new=guests`
  const lines = String(fd.get("names") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 500)
  if (!lines.length) back(retry, { error: t("guestlists.noNames") })
  const { data: list } = await ctx.supabase.from("guest_lists").select("quota").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!list) back(PATH, { error: t("errors.not_allowed") })
  if (list.quota) {
    const { count } = await ctx.supabase.from("guest_entries").select("id", { count: "exact", head: true }).eq("list_id", id)
    if ((count ?? 0) + lines.length > list.quota) back(retry, { error: t("guestlists.full") })
  }
  const rows = lines.map((l) => {
    const [name, email] = l.split(/[,;\t]/).map((s) => s.trim())
    return { org_id: ctx.org.id, list_id: id, name: name.slice(0, 200), email: email && /@/.test(email) ? email.toLowerCase().slice(0, 320) : null }
  })
  const { error } = await ctx.supabase.from("guest_entries").insert(rows)
  if (error) back(retry, { error: dbError(t, error) })
  await syncTickets(id)
  back(here, { ok: t("guestlists.added", { count: rows.length }) })
}

// Replace a person (e.g. a friend can't come): same entry and, if linked, same ticket with the new name.
export async function renameEntry(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const name = String(fd.get("name") ?? "").trim().slice(0, 200)
  const entryId = String(fd.get("entry") ?? "")
  const retry = `${PATH}/${id}?edit=${entryId}`
  const { data: entry } = await ctx.supabase.from("guest_entries").select("list_id").eq("id", entryId).eq("org_id", ctx.org.id).maybeSingle()
  if (!entry || !name) back(retry, { error: t("guestlists.nameRequired") })
  const { error } = await ctx.supabase.from("guest_entries").update({ name }).eq("id", entryId).eq("org_id", ctx.org.id)
  if (error) back(retry, { error: dbError(t, error) })
  await syncTickets(entry.list_id)
  back(`${PATH}/${id}`, { ok: t("guestlists.saved") })
}

export async function removeEntry(fd: FormData) {
  const { ctx, t } = await manager()
  const id = String(fd.get("id") ?? "")
  const { data: entry } = await ctx.supabase.from("guest_entries").select("ticket_id").eq("id", String(fd.get("entry") ?? "")).eq("org_id", ctx.org.id).maybeSingle()
  const { error } = await ctx.supabase.from("guest_entries").delete().eq("id", String(fd.get("entry") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  await voidTicket(entry?.ticket_id ?? null)
  deliverSoon()
  back(`${PATH}/${id}`, { ok: t("guestlists.removed") })
}
