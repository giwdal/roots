// Member check-in at the door (member_door() in the DB): look up by card code, member number or contact id, then let in = a used,
// free ticket of the event's member ticket type. Shared by the scanner, the door's member tab and the API.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type MemberAtDoor = {
  result: "invalid" | "not_member" | "member" | "ok" | "already" | "limit"
  contact_id?: string
  code?: string | null
  number?: string | null // member number without separators, for matching
  full?: boolean // event capacity reached: the door decides
  name?: string | null
  membership_id?: string | null
  member_no?: string | null
  type?: string | null
  state?: "none" | "upcoming" | "ended" | "active"
  ends_on?: string | null
  paused?: boolean
  paused_until?: string | null
  overdue_count?: number
  overdue_cents?: number
  visits?: number // counting visits in the current membership
  visit_limit?: number | null
  event_counts?: boolean // does this event count as a visit
  last_visit?: string | null
  checked_in_at?: string | null
}

/** Member codes are 12 characters (ticket codes 10), same alphabet. */
export const isMemberCode = (code: string) => /^[A-HJ-NP-Z2-9]{12}$/.test(code)

/** Limit reached at an event that counts (the DB blocks the same way; this is the offline copy). */
export const visitLimitReached = (m: Pick<MemberAtDoor, "visits" | "visit_limit" | "event_counts">) =>
  m.event_counts !== false && m.visit_limit != null && (m.visits ?? 0) >= m.visit_limit

/** Offline decision, mirrors member_door(): the member to show and the queue entry to sync later (none = nobody let in). */
export function localAdmit(m: MemberAtDoor, override: boolean, now: string): { member: MemberAtDoor; queue?: string } {
  if (m.checked_in_at) return { member: { ...m, result: "already" } }
  if (!override && visitLimitReached(m)) return { member: { ...m, result: "limit" } }
  const member = { ...m, result: "ok" as const, checked_in_at: now, visits: (m.visits ?? 0) + (m.event_counts === false ? 0 : 1) }
  return { member, queue: `member:${m.contact_id}${override ? ":override" : ""}` }
}

/** A queued offline entry: `member:<contact>` or `member:<contact>:override`; anything else is a ticket code. */
export function queuedMember(entry: string): { contactId: string; override: boolean } | null {
  const [kind, contactId, flag] = entry.split(":")
  return kind === "member" && contactId ? { contactId, override: flag === "override" } : null
}

export async function memberDoor(db: SupabaseClient<Database>, eventId: string, who: { code?: string; contactId?: string }, admit: boolean, override = false) {
  const { data, error } = await db.rpc("member_door", { p_event: eventId, p_code: who.code ?? "", p_contact: who.contactId, p_admit: admit, p_override: override })
  if (error) throw error
  return data as unknown as MemberAtDoor
}

/** Every member with what the door sees, for scanners that check offline. */
export async function memberDoorList(db: SupabaseClient<Database>, eventId: string) {
  const { data, error } = await db.rpc("member_door_list", { p_event: eventId })
  if (error) throw error
  return (data ?? []) as unknown as MemberAtDoor[]
}
