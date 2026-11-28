"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"

// Places of the org (core settings), used by events, shifts, courses and rentals.
const PATH = "/settings/locations"
const UUID = /^[0-9a-f-]{36}$/
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null

export async function saveLocation(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const name = str(fd, "name", 100)
  if (!name) back(PATH, { error: t("errors.invalid_input") })
  // Notes only when the form has the field (the settings rows don't), so a save never clears them.
  const cap = Math.floor(Number(fd.get("capacity")))
  const row = {
    name,
    address: str(fd, "address", 500),
    ...(fd.has("notes") && { notes: str(fd, "notes", 2000) }),
    ...(fd.has("capacity") && { capacity: cap >= 1 ? cap : null }), // how many fit; new events copy it
  }
  const { error } = UUID.test(id)
    ? await ctx.supabase.from("locations").update(row).eq("id", id).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("locations").insert({ ...row, org_id: ctx.org.id })
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, { ok: t("locations.saved") })
}

export async function deleteLocation(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const { error } = await ctx.supabase.from("locations").delete().eq("id", String(fd.get("id") ?? "")).eq("org_id", ctx.org.id)
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, { ok: t("locations.deleted") })
}
