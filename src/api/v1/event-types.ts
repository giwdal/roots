import { z } from "zod"
import { readEventType } from "@/app/(app)/events/type-fields"
import { messages } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { STATUS_COLORS } from "@/projects/fields"
import { ApiError, dbError, endpoint, notFound, uuid, type Endpoint } from "../core"
import { ts } from "./shared"

const en = createT("en", messages.en)
const Ok = z.object({ ok: z.literal(true) })

const EventType = z.object({
  id: uuid,
  name: z.string(),
  color: z.enum(STATUS_COLORS).nullable().describe("Colour in calendar and lists"),
  active: z.boolean().describe("Inactive types can't be chosen for new events"),
  created_at: ts,
  updated_at: ts,
})
const COLS = "id, name, color, active, created_at, updated_at"
const Input = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z.enum(STATUS_COLORS).nullable(),
    active: z.boolean(),
  })
  .partial()
  .strict()

// Same checks as the App's form.
function read(body: Parameters<typeof readEventType>[0]) {
  const r = readEventType(body)
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
    description: "The organisation's event types (name, colour, active). Events carry `event_type_id`; membership types can count only certain types as visits (`visit_event_types`).",
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
      "A type labels events (filter, colour in calendar and lists). Which types count towards a membership type's visit limit is set on the membership type (`visit_event_types`).",
    body: Input.required({ name: true }),
    response: EventType,
    status: 201,
    async handler({ db, orgId, body }) {
      const { data, error } = await db.from("event_types").insert({ ...read(body), org_id: orgId }).select(COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/event-types/{id}",
    permission: "events.manage",
    tag: "Events",
    summary: "Change an event type",
    description: "Only the given fields change.",
    body: Input,
    response: EventType,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("event_types").select(COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const { data, error } = await db.from("event_types").update(read({ ...old, ...body })).eq("id", params.id).eq("org_id", orgId).select(COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/event-types/{id}",
    permission: "events.manage",
    tag: "Events",
    summary: "Delete an event type",
    description: "Only types no event uses (trashed events included) and no membership type counts (409 `type_in_use` otherwise: set `active` to false instead).",
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
