"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { isMemberCode, memberDoor, memberDoorList, type MemberAtDoor } from "@/members/door"
import { cancelDoorSale, doorSaleStatus, doorStats, payAtDoor, sellAtDoor } from "@/tickets/door"
import { DOOR_METHODS, readLines, type DoorMethod } from "@/tickets/door-fields"
import { cancelTicket, qrSvg, undoCheckIn } from "@/tickets/server"
import { getContext } from "@/lib/context"

export type ScanResult = { result: "ok" | "valid" | "used" | "invalid" | "error"; holder?: string | null; type?: string | null; at?: string | null; message?: string; member?: MemberAtDoor }

const scanError = (t: Awaited<ReturnType<typeof getT>>, e: { message?: string } | null) =>
  e?.message === "not_allowed" || e?.message === "event_cancelled" ? t.dynamic(`errors.${e.message}`) : t("tickets.scanFailed")

// Called by the scanner page for every code (camera or typed).
export async function checkIn(eventId: string, code: string): Promise<ScanResult> {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const clean = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !clean) return { result: "invalid" }
  const members = ctx.modules.has("members")
  const member = async (): Promise<ScanResult> => {
    // A member card or number: show who it is; letting in is a second step (admitMember).
    try {
      const m = await memberDoor(ctx.supabase, eventId, { code: clean }, false)
      return m.result === "invalid" ? { result: "invalid" } : { result: "ok", member: m }
    } catch (e) {
      return { result: "error", message: scanError(t, e as { message?: string }) }
    }
  }
  if (members && isMemberCode(clean)) return member()
  const { data, error } = await ctx.supabase.rpc("check_in_ticket", { p_event: eventId, p_code: clean }).maybeSingle()
  // A cancelled event is "invalid", not "error": offline check-ins then sync as conflicts instead of retrying forever.
  if (error?.message === "event_cancelled") return { result: "invalid", message: t("errors.event_cancelled") }
  if (error || !data) return { result: "error", message: scanError(t, error) }
  if (data.result === "invalid" && members) return member()
  return { result: data.result as ScanResult["result"], holder: data.holder_name, type: data.type_name, at: data.checked_in_at }
}

// Scanner, step 1: who is this? Looks the code up without checking in ("valid" → the card's Einchecken button calls
// checkIn). Members as in checkIn: their card shows, letting in is admitMember.
export async function lookupCode(eventId: string, code: string): Promise<ScanResult> {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const clean = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !clean) return { result: "invalid" }
  const members = ctx.modules.has("members")
  if (members && isMemberCode(clean)) return checkIn(eventId, clean) // member codes only look up there
  const [{ data: ev }, { data: k, error }] = await Promise.all([
    ctx.supabase.from("events").select("status").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("tickets").select("status, holder_name, checked_in_at, ticket_types(name), pay_orders(customer_name)").eq("event_id", eventId).eq("org_id", ctx.org.id).eq("code", clean).maybeSingle(),
  ])
  if (error) return { result: "error", message: scanError(t, error) }
  if (ev?.status === "cancelled") return { result: "invalid", message: t("errors.event_cancelled") }
  if (!k) return members ? checkIn(eventId, clean) : { result: "invalid" }
  const who = { holder: k.holder_name ?? k.pay_orders?.customer_name ?? null, type: k.ticket_types?.name ?? null }
  if (k.status === "valid") return { result: "valid", ...who }
  if (k.status === "used") return { result: "used", ...who, at: k.checked_in_at }
  return { result: "invalid", ...who, message: t("tickets.statuses.void") }
}

/** Let a looked-up member in (scanner card button). */
export async function admitMember(eventId: string, contactId: string): Promise<MemberAtDoor | { result: "error"; message: string; cancelled?: boolean }> {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !/^[0-9a-f-]{36}$/.test(contactId)) return { result: "invalid" }
  try {
    return await memberDoor(ctx.supabase, eventId, { contactId }, true)
  } catch (e) {
    return { result: "error", message: scanError(t, e as { message?: string }), cancelled: (e as { message?: string }).message === "event_cancelled" }
  }
}

// Offline: the members for the device (when the members module is on).
export async function scanMembers(eventId: string): Promise<MemberAtDoor[]> {
  const ctx = await requirePerm("tickets.scan")
  if (!ctx.modules.has("members") || !/^[0-9a-f-]{36}$/.test(eventId)) return []
  return memberDoorList(ctx.supabase, eventId)
}

export type ScanEntry = { code: string; status: "valid" | "used"; holder: string | null; type: string | null }

// Offline: the event's valid/used tickets for the device (staff with tickets.scan only).
export async function scanList(eventId: string): Promise<ScanEntry[]> {
  const ctx = await requirePerm("tickets.scan")
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return []
  const out: ScanEntry[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await ctx.supabase
      .from("tickets")
      .select("code, status, holder_name, ticket_types(name)")
      .eq("event_id", eventId)
      .in("status", ["valid", "used"])
      .order("id")
      .range(from, from + 999)
    data?.forEach((k) => out.push({ code: k.code, status: k.status as ScanEntry["status"], holder: k.holder_name, type: k.ticket_types?.name ?? null }))
    if (!data || data.length < 1000) return out
  }
}

// Offline check-ins, sent when the device is back online ("member:<contact id>" = a member let in).
// "conflict" = someone else let this ticket/member in already.
export async function syncCheckIns(eventId: string, codes: string[]): Promise<{ synced: number; conflicts: string[] }> {
  let synced = 0
  const conflicts: string[] = []
  for (const code of codes.slice(0, 2000)) {
    if (code.startsWith("member:")) {
      const m = await admitMember(eventId, code.slice(7))
      if (m.result === "ok") synced++
      else if (m.result === "error" && !m.cancelled) throw new Error(m.message)
      else conflicts.push(("name" in m && m.name) || code)
      continue
    }
    const r = await checkIn(eventId, code)
    if (r.result === "ok") synced++
    else if (r.result === "error") throw new Error(r.message)
    else conflicts.push(code)
  }
  return { synced, conflicts }
}

// Door lists (forms on the Gäste/Tickets tabs): check in a guest-list entry, or a ticket by code.
export async function guestCheckIn(fd: FormData) {
  const ctx = await requirePerm("guestlists.checkin")
  const t = await getT()
  const event = String(fd.get("event") ?? "")
  const entry = String(fd.get("entry") ?? "")
  const here = `/scan?${new URLSearchParams({ event, tab: String(fd.get("tab") || "guests"), q: String(fd.get("q") ?? ""), list: String(fd.get("list") ?? "") })}`
  if (fd.get("undo") === "1") {
    const { error } = await ctx.supabase.from("guest_checkins").delete().eq("entry_id", entry).eq("event_id", event).eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
    back(here, { ok: t("door.undone") })
  }
  const { error } = await ctx.supabase.from("guest_checkins").insert({ org_id: ctx.org.id, entry_id: entry, event_id: event })
  if (error) back(here, { error: error.code === "23505" ? t("door.already") : dbError(t, error) })
  back(here, { ok: t("door.checkedIn", { name: String(fd.get("name") ?? "") }) })
}

export async function ticketDoorCheckIn(fd: FormData) {
  const event = String(fd.get("event") ?? "")
  const here = `/scan?${new URLSearchParams({ event, tab: String(fd.get("tab") || "tickets"), q: String(fd.get("q") ?? "") })}`
  const t = await getT()
  const r = await checkIn(event, String(fd.get("code") ?? ""))
  if (r.result === "ok") back(here, { ok: t("door.checkedIn", { name: r.holder ?? String(fd.get("code")) }) })
  back(here, { error: r.message ?? t.dynamic(`tickets.scanResult.${r.result}`) })
}

const listHere = (fd: FormData, extra: Record<string, string> = {}) =>
  `/scan?${new URLSearchParams({ event: String(fd.get("event") ?? ""), tab: String(fd.get("tab") || "tickets"), q: String(fd.get("q") ?? ""), ...extra })}`

// Door lists: check a ticket out again (let in by mistake).
export async function ticketDoorUndo(fd: FormData) {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const here = listHere(fd)
  try {
    await undoCheckIn(ctx.org.id, String(fd.get("event") ?? ""), String(fd.get("id") ?? ""))
  } catch (e) {
    back(here, { error: e instanceof Error && e.message.includes(".") ? t.dynamic(e.message) : dbError(t, e as { message: string }) })
  }
  back(here, { ok: t("door.undone") })
}

// Door lists → "Stornieren" sheet: void the ticket, with or without giving the money back (refund = payments.refund).
export async function ticketDoorCancel(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const refund = fd.get("refund") === "1"
  const here = listHere(fd)
  if (!ctx.can(refund ? "payments.refund" : "tickets.manage")) back(here, { error: t("errors.not_allowed") })
  let status: string | null = null
  try {
    status = await cancelTicket(ctx.org.id, String(fd.get("id") ?? ""), String(fd.get("reason") ?? "").slice(0, 500) || undefined, refund)
  } catch (e) {
    back(listHere(fd, { edit: String(fd.get("id") ?? "") }), { error: e instanceof Error && e.message.includes(".") ? t.dynamic(e.message) : t("errors.generic") })
  }
  back(here, { ok: status === "pending" ? t("payments.refundPending") : t("payments.ticketCancelled") })
}

// Door → Mitglieder tab (search by name): look up = link, let in = this form.
export async function memberDoorCheckIn(fd: FormData) {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const event = String(fd.get("event") ?? "")
  const contact = String(fd.get("contact") ?? "")
  const here = `/scan?${new URLSearchParams({ event, tab: "members", q: String(fd.get("q") ?? ""), who: contact })}`
  if (!/^[0-9a-f-]{36}$/.test(event) || !/^[0-9a-f-]{36}$/.test(contact)) back(here, { error: t("errors.invalid_input") })
  let r: MemberAtDoor
  try {
    r = await memberDoor(ctx.supabase, event, { contactId: contact }, true)
  } catch (e) {
    back(here, { error: dbError(t, e as { message: string }) })
  }
  if (r!.result === "ok") back(here, { ok: t("door.checkedIn", { name: r!.name ?? "" }) })
  back(here, { error: t.dynamic(`door.member.${r!.result}`) })
}

// Door → Verkauf tab: sell tickets / free amounts and collect them (cash, QR on the buyer's phone, card terminal).
export type DoorPay = { orderId?: string; status?: "paid" | "pending"; qr?: string; error?: string }

const doorError = async (e: unknown) => {
  const t = await getT()
  const key = (e as { message?: string })?.message ?? ""
  return { error: /^[a-z]+\.[A-Za-z_.]+$/.test(key) ? t.dynamic(key) : t("door.sale.failed") }
}

async function payResult(orgId: string, orderId: string, method: DoorMethod): Promise<DoorPay> {
  const r = await payAtDoor(orgId, orderId, method)
  return { orderId, status: r.status, qr: r.status === "pending" && r.url ? await qrSvg(r.url) : undefined }
}

/** `offline` = a cash sale the device stored without connection (id = its key, at = when it was sold). */
export async function doorSell(eventId: string, rawLines: unknown, method: DoorMethod, buyer: { name?: string; email?: string }, offline?: { id: string; at: string }): Promise<DoorPay> {
  const ctx = await requirePerm("tickets.scan")
  const lines = readLines(rawLines)
  if (!lines || !/^[0-9a-f-]{36}$/.test(eventId) || !DOOR_METHODS.includes(method) || (offline && !/^[0-9a-f-]{36}$/.test(offline.id))) return { error: (await getT())("errors.invalid_input") }
  try {
    const { orderId, existing } = await sellAtDoor({ orgId: ctx.org.id, eventId, lines, name: buyer.name, email: buyer.email, soldBy: ctx.userId, clientId: offline?.id, soldAt: offline?.at })
    if (existing && (await doorSaleStatus(ctx.org.id, orderId)) === "paid") return { orderId, status: "paid" }
    return await payResult(ctx.org.id, orderId, method).catch(async (e) => ({ orderId, ...(await doorError(e)) }))
  } catch (e) {
    return doorError(e)
  }
}

/** Collect again (the card failed, or switch method). */
export async function doorPay(orderId: string, method: DoorMethod): Promise<DoorPay> {
  const ctx = await requirePerm("tickets.scan")
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !DOOR_METHODS.includes(method)) return { error: (await getT())("errors.invalid_input") }
  return payResult(ctx.org.id, orderId, method).catch(async (e) => ({ orderId, ...(await doorError(e)) }))
}

export async function doorStatus(orderId: string) {
  const ctx = await requirePerm("tickets.scan")
  return /^[0-9a-f-]{36}$/.test(orderId) ? doorSaleStatus(ctx.org.id, orderId) : null
}

export async function doorCancel(orderId: string) {
  const ctx = await requirePerm("tickets.scan")
  if (/^[0-9a-f-]{36}$/.test(orderId)) await cancelDoorSale(ctx.org.id, orderId).catch(() => null)
}

export async function doorStatsAction(eventId: string) {
  const ctx = await requirePerm("tickets.scan")
  return /^[0-9a-f-]{36}$/.test(eventId) ? doorStats(ctx.org.id, eventId) : null
}
