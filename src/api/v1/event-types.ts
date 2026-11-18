import { z } from "zod"
import { readEventType } from "@/app/(app)/events/type-fields"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { STATUS_COLORS } from "@/projects/fields"
import { ApiError, dbError, endpoint, notFound, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

const en = createT("en", messages.en)
const Ok = z.object({ ok: z.literal(true) })

const EventType = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string().describe("Short name, unique in the organisation (a–z, 0–9, hyphens); usable instead of the id in the events API"),
  color: z.enum(STATUS_COLORS).nullable().describe("Colour in calendar and lists"),
  active: z.boolean().describe("Inactive types can't be chosen for new events"),
  counts_visit: z.boolean().describe("Default for the new event's counts_visit (member check-ins count towards membership visit limits)"),
  capacity: z.number().int().nullable().describe("Default for the new event's capacity (null = none)"),
  created_at: ts,
  updated_at: ts,
})
const COLS = "id, name, slug, color, active, counts_visit, capacity, created_at, updated_at"
const Input = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().describe("Optional, made from the name when empty; numbered if taken"),
    color: z.enum(STATUS_COLORS).nullable(),
    active: z.boolean(),
    counts_visit: z.boolean(),
    capacity: z.number().int().min(1).nullable(),
  })
  .partial()
  .strict()

const slugTaken = () => new ApiError(409, "slug_taken", "Another event type already uses this slug.")

// Same checks as the App's form; `rest` = the org's other slugs (an empty slug is made from the name).
async function read(db: Db, orgId: string, body: Parameters<typeof readEventType>[0], id?: string) {
  const { data: others } = await db.from("event_types").select("id, slug").eq("org_id", orgId)
  const r = readEventType(body, (others ?? []).filter((o) => o.id !== id).map((o) => o.slug))
  if ("error" in r) throw new ApiError(422, "invalid_input", "Invalid input.")
  return r.row
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/event-types",
    permission: "events.view",
    tag: "Events",
    summary: "List event types",
    description: "The organisation's event types (name, slug, colour, defaults for new events). Events carry `event_type_id` and `event_type_slug`.",
    response: z.object({ data: z.array(EventType) }),
    async handler({ db, orgId }) {
      const { data } = await db.from("event_types").select(COLS).eq("org_id", orgId).order("name")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "GET",
    path: "/event-types/{id}",
    permission: "events.view",
    tag: "Events",
    summary: "Get an event type",
    response: EventType,
    async handler({ db, orgId, params }) {
      const { data } = await db.from("event_types").select(COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!data) throw notFound()
      return data
    },
  }),
  endpoint({
    method: "POST",
    path: "/event-types",
    permission: "events.manage",
    tag: "Events",
    summary: "Create an event type",
    description:
      "A type labels events (filters, colour) and presets new events: `counts_visit` and `capacity` are copied into an event created with this type unless the request sets them. Changing a type later does not change existing events. 409 `slug_taken` if a given slug is in use.",
    body: Input.required({ name: true }),
    response: EventType,
    status: 201,
    async handler({ db, orgId, body }) {
      const row = await read(db, orgId, body)
      const { data, error } = await db.from("event_types").insert({ ...row, org_id: orgId }).select(COLS).single()
      if (error) throw error.code === "23505" ? slugTaken() : dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/event-types/{id}",
    permission: "events.manage",
    tag: "Events",
    summary: "Change an event type",
    description: "Only the given fields change. Existing events keep their own values.",
    body: Input,
    response: EventType,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("event_types").select(COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const row = await read(db, orgId, { ...old, ...body }, params.id)
      const { data, error } = await db.from("event_types").update(row).eq("id", params.id).eq("org_id", orgId).select(COLS).single()
      if (error) throw error.code === "23505" ? slugTaken() : dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/event-types/{id}",
    permission: "events.manage",
    tag: "Events",
    summary: "Delete an event type",
    description: "Only types no event uses, trashed events included (409 `type_in_use` otherwise: set `active` to false instead).",
    response: Ok,
    async handler({ db, orgId, params }) {
      const { error, count } = await db.from("event_types").delete({ count: "exact" }).eq("id", params.id).eq("org_id", orgId)
      if (error?.code === "23503") throw new ApiError(409, "type_in_use", en("eventTypes.inUse"))
      if (error) throw dbError(error)
      if (!count) throw notFound()
      return { ok: true as const }
    },
  }),
]
