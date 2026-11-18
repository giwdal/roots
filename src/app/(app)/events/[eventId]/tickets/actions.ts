"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { back } from "@/lib/url"
import { checkCode, checkTicketType, checkTier, normalizeCode } from "@/tickets/fields"
import { parsePrice } from "@/tickets/price"
import { readDoor } from "@/tickets/door-fields"

async function manager(eventId: string) {
  const ctx = await requirePerm("tickets.manage")
  const t = await getT()
  const here = `/events/${eventId}/tickets`
  if (!ctx.modules.has("tickets") || !/^[0-9a-f-]{36}$/.test(eventId)) back("/events", { error: t("errors.not_allowed") })
  return { ctx, t, here }
}

function readType(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim().slice(0, 100)
  const description = String(fd.get("description") ?? "").trim().slice(0, 1000) || null
  const quotaRaw = String(fd.get("quota") ?? "").trim()
  const quota = quotaRaw ? Number(quotaRaw) : null
  const startRaw = String(fd.get("sales_start") ?? "").trim()
  const endRaw = String(fd.get("sales_end") ?? "").trim()
  const sales_start = startRaw ? fromLocalInput(startRaw)?.toISOString() : null
  const sales_end = endRaw ? fromLocalInput(endRaw)?.toISOString() : null
  const error =
    checkTicketType({ name, quota, sales_start: sales_start ?? null, sales_end: sales_end ?? null }) ??
    (sales_start === undefined || sales_end === undefined ? "errors.invalid_time" : null)
  if (error) return { error }
  return { row: { name, description, quota, sales_start: sales_start ?? null, sales_end: sales_end ?? null, hidden: fd.get("hidden") === "1" } }
}

// Price tiers posted by <TierRows> (one value per row and field, read by index).
function readTiers(fd: FormData) {
  const ids = fd.getAll("tier_id").map(String)
  const names = fd.getAll("tier_name").map((v) => String(v).trim().slice(0, 100))
  const prices = fd.getAll("tier_price").map(String)
  const quotas = fd.getAll("tier_quota").map((v) => String(v).trim())
  const ends = fd.getAll("tier_end").map((v) => String(v).trim())
  const rows: { id: string | null; name: string; price: number; quota: number | null; sales_end: string | null; position: number }[] = []
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i] && !names[i] && !prices[i]?.trim()) continue // a new row left empty
    const price = parsePrice(prices[i] ?? "")
    const quota = quotas[i] ? Number(quotas[i]) : null
    const sales_end = ends[i] ? fromLocalInput(ends[i])?.toISOString() : null
    if (price === null) return { error: "tickets.invalidPrice" }
    if (sales_end === undefined) return { error: "errors.invalid_time" }
    if (checkTier({ name: names[i], quota, position: rows.length })) return { error: "errors.invalid_input" }
    rows.push({ id: /^[0-9a-f-]{36}$/.test(ids[i]) ? ids[i] : null, name: names[i], price, quota, sales_end, position: rows.length })
  }
  return { rows }
}

// One form for the type, its sale state and its price tiers (Early Bird → Regular → …; the first not sold out/ended
// is current). Tiers missing from the form are deleted (blocked once tickets were sold in them).
export async function saveTicketType(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const r = readType(fd)
  const price = parsePrice(String(fd.get("price") ?? ""))
  const retry = `${here}?${id ? `edit=${id}` : "new=type"}`
  if ("error" in r) back(retry, { error: t.dynamic(r.error!) })
  if (price === null) back(retry, { error: t("tickets.invalidPrice") })
  const tiers = fd.has("tiers_present") ? readTiers(fd) : null
  if (tiers && "error" in tiers) back(retry, { error: t.dynamic(tiers.error!) })
  const row = { ...r.row!, price, ...(fd.has("active_field") && { active: fd.get("active") === "1" }) }
  const res = id
    ? await ctx.supabase.from("ticket_types").update(row).eq("id", id).eq("event_id", eventId).select("id").single()
    : await ctx.supabase.from("ticket_types").insert({ ...row, org_id: ctx.org.id, event_id: eventId }).select("id").single()
  if (res.error) back(retry, { error: dbError(t, res.error) })
  const typeId = res.data!.id
  if (tiers && "rows" in tiers) {
    const keep = new Set(tiers.rows.flatMap((x) => (x.id ? [x.id] : [])))
    const { data: old } = await ctx.supabase.from("ticket_tiers").select("id").eq("type_id", typeId)
    const gone = (old ?? []).map((x) => x.id).filter((x) => !keep.has(x))
    if (gone.length) {
      const { error } = await ctx.supabase.from("ticket_tiers").delete().in("id", gone).eq("type_id", typeId)
      if (error) back(`${here}?edit=${typeId}`, { error: error.code === "23503" ? t("tickets.tierHasTickets") : dbError(t, error) })
    }
    for (const { id: tierId, ...tier } of tiers.rows) {
      const { error } = tierId
        ? await ctx.supabase.from("ticket_tiers").update(tier).eq("id", tierId).eq("type_id", typeId)
        : await ctx.supabase.from("ticket_tiers").insert({ ...tier, org_id: ctx.org.id, type_id: typeId })
      if (error) back(`${here}?edit=${typeId}`, { error: dbError(t, error) })
    }
  }
  back(here, { ok: id ? t("tickets.saved") : t("tickets.typeCreated") })
}

export async function deleteTicketType(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.from("ticket_types").delete().eq("id", id).eq("event_id", eventId)
  // Has tickets → foreign key: deactivate instead.
  if (error) back(`${here}?edit=${id}`, { error: error.code === "23503" ? t("tickets.typeHasTickets") : dbError(t, error) })
  back(here, { ok: t("tickets.typeDeleted") })
}

// The event's ticket settings in one form: the shop (names, max per order, code field) and the door (Abendkasse:
// methods, card reader, cash book account – which must be the org's).
export async function saveTicketSettings(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const retry = `${here}?edit=settings`
  const names = String(fd.get("ticket_names"))
  const max = Number(fd.get("max_tickets_per_order"))
  if (!["off", "optional", "required"].includes(names) || !Number.isInteger(max) || max < 1 || max > 100)
    back(retry, { error: t("errors.invalid_input") })
  const door = fd.has("door_present")
    ? readDoor({ methods: fd.getAll("methods").map(String), reader_id: String(fd.get("reader_id") ?? ""), cash_account_id: String(fd.get("cash_account_id") ?? "") })
    : null
  if (door?.cash_account_id) {
    const { data: acc } = await ctx.supabase.from("cash_accounts").select("id").eq("id", door.cash_account_id).eq("org_id", ctx.org.id).maybeSingle()
    if (!acc) back(retry, { error: t("errors.not_allowed") })
  }
  // Event fields need events.manage (RLS); ticket managers without it get an error from the DB.
  const { error, count } = await ctx.supabase
    .from("events")
    .update({ ticket_names: names, max_tickets_per_order: max, show_code_field: fd.get("show_code_field") === "on", ...(door && { door }) }, { count: "exact" })
    .eq("id", eventId)
    .eq("org_id", ctx.org.id)
  if (error || !count) back(retry, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(here, { ok: t("tickets.settingsSaved") })
}

// Promo codes / discount links. kind: percent | amount (cents) | none (only unlocks hidden types).
export async function saveCode(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const retry = `${here}?${id ? `edit=${id}` : "new=code"}`
  const code = normalizeCode(String(fd.get("code") ?? ""))
  const kind = String(fd.get("kind") ?? "")
  const raw = String(fd.get("value") ?? "").trim()
  const value = kind === "percent" ? Number(raw) : kind === "amount" ? parsePrice(raw) : 0
  const maxRaw = String(fd.get("max_uses") ?? "").trim()
  const max_uses = maxRaw && kind !== "none" ? Number(maxRaw) : null // unlock-only: the ticket type's quota is the limit
  const fromRaw = String(fd.get("valid_from") ?? "").trim()
  const untilRaw = String(fd.get("valid_until") ?? "").trim()
  const valid_from = fromRaw ? fromLocalInput(fromRaw)?.toISOString() : null
  const valid_until = untilRaw ? fromLocalInput(untilRaw)?.toISOString() : null
  const type_ids = fd.getAll("type_ids").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v))
  const invalid =
    checkCode({ code, kind, value, max_uses, valid_from: valid_from ?? null, valid_until: valid_until ?? null }) ??
    (valid_from === undefined || valid_until === undefined ? "errors.invalid_input" : null)
  if (invalid) back(retry, { error: t.dynamic(invalid) })
  const row = { code, kind, value: value!, max_uses, valid_from: valid_from ?? null, valid_until: valid_until ?? null, type_ids, active: fd.getAll("active").includes("1") }
  const { error } = id
    ? await ctx.supabase.from("ticket_codes").update(row).eq("id", id).eq("event_id", eventId)
    : await ctx.supabase.from("ticket_codes").insert({ ...row, org_id: ctx.org.id, event_id: eventId })
  if (error) back(retry, { error: error.code === "23505" ? t("tickets.codeTaken") : dbError(t, error) })
  back(here, { ok: id ? t("tickets.saved") : t("tickets.codeCreated") })
}

export async function deleteCode(fd: FormData) {
  const eventId = String(fd.get("event") ?? "")
  const { ctx, t, here } = await manager(eventId)
  const id = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.from("ticket_codes").delete().eq("id", id).eq("event_id", eventId)
  if (error) back(`${here}?edit=${id}`, { error: error.code === "23503" ? t("tickets.codeUsed") : dbError(t, error) })
  back(here, { ok: t("tickets.codeDeleted") })
}

/** Take someone off the waiting list (a held offer is released for the next in line). */
export async function removeFromWaitlist(fd: FormData) {
  const { ctx, t, here } = await manager(String(fd.get("event") ?? ""))
  const { error, count } = await ctx.supabase
    .from("event_waitlist")
    .update({ status: "cancelled" }, { count: "exact" })
    .eq("id", String(fd.get("id") ?? ""))
    .eq("org_id", ctx.org.id)
    .in("status", ["waiting", "offered"])
  back(`${here}#waitlist`, error || !count ? { error: error ? dbError(t, error) : t("errors.not_allowed") } : { ok: t("waitlist.removed") })
}
