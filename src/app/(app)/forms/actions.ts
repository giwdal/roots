"use server"

import { slugify } from "@/app/(app)/events/slug"
import { parseTags } from "@/app/(app)/contacts/fields"
import { deliverSoon } from "@/events/worker"
import { checkElements, PURPOSES, readElements, type Purpose } from "@/forms/elements"
import { acceptSubmission as accept, insertForm } from "@/forms/server"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { refreshPublic } from "@/lib/public-cache"
import { back } from "@/lib/url"

const PATH = "/forms"
const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max) || null

async function manager(path = PATH) {
  const ctx = await requirePerm("forms.manage")
  const t = await getT()
  if (!ctx.modules.has("forms")) back(path, { error: t("errors.not_allowed") })
  return { ctx, t }
}

export async function createForm(fd: FormData) {
  const { ctx, t } = await manager()
  const title = str(fd, "title", 200)
  const purpose = PURPOSES.find((p) => p === fd.get("purpose")) ?? "contact"
  if (!title) back(`${PATH}?new=1`, { error: t("forms.titleRequired") })
  if (purpose === "membership" && !ctx.modules.has("members")) back(`${PATH}?new=1`, { error: t("forms.needsMembers") })
  const { data, error } = await insertForm(ctx.supabase, ctx.org, title, purpose, t)
  if (error || !data) back(`${PATH}?new=1`, { error: dbError(t, error) })
  back(`${PATH}/${data.id}`, { ok: t("forms.created") })
}

/**
 * The builder's one form: settings (title, slug, status, texts, tags) and the element list (JSON from <ElementRows>,
 * same rules as the API). `publish` (the header's "Veröffentlichen") saves and publishes in one go.
 */
export async function saveForm(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const here = `${PATH}/${id}`
  const title = str(fd, "title", 200)
  const slug = slugify(str(fd, "slug", 80) ?? "")
  if (!title || !slug) back(here, { error: t("forms.titleRequired") })
  const { data: form } = await ctx.supabase.from("forms").select("purpose, status").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle()
  if (!form) back(PATH, { error: t("errors.not_allowed") })
  const elements = readElements(String(fd.get("elements") ?? ""))
  const custom = (await loadFields(ctx.supabase, ctx.org.id, "contacts")).map((d) => d.key)
  if (!elements || checkElements(elements, form.purpose as Purpose, custom)) back(here, { error: t("forms.elementsInvalid") })
  // The status changes through the header's actions (Veröffentlichen, ⋯ Schließen, Wieder öffnen), not the settings.
  const status = fd.get("publish") ? "published" : form.status
  const { error } = await ctx.supabase
    .from("forms")
    .update({
      title,
      slug,
      status,
      intro: str(fd, "intro", 5000),
      success_text: str(fd, "success_text", 2000),
      settings: { tags: parseTags(String(fd.get("tags") ?? "")).slice(0, 20) },
      elements: elements as never,
    })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error) back(here, { error: error.code === "23505" ? t("errors.slug_taken") : dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(here, { ok: t(fd.get("publish") ? "forms.published" : "forms.saved") })
}

/** Header actions of a live or closed form: close it (the public page says so) or open it again. */
export async function setFormStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const status = fd.get("status") === "closed" ? "closed" : "published"
  const { error } = await ctx.supabase.from("forms").update({ status }).eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null)
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(`${PATH}/${id}`, { ok: t(status === "closed" ? "forms.formClosed" : "forms.formReopened") })
}

export async function trashForm(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.forms", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(PATH, { ok: t("forms.trashed") })
}

export async function restoreForm(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.forms", p_id: str(fd, "id", 36) ?? "" })
  // Another live form took the slug meanwhile → unique violation.
  refreshPublic(ctx.org.id) // public pages show this
  back(`${PATH}?trash=1`, error ? { error: error.code === "23505" ? t("errors.slug_taken") : dbError(t, error) } : { ok: t("forms.restored") })
}

/** Membership application → member (contact + membership); contact form submissions are already in. */
export async function acceptSubmission(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const back_ = String(fd.get("back") ?? "")
  const here = back_.startsWith("/forms/") ? back_ : PATH
  let r: Awaited<ReturnType<typeof accept>> | undefined
  try {
    r = await accept(ctx.supabase, ctx.org.id, id, { canMembers: () => ctx.can("members.manage"), t })
  } catch (e) {
    back(here, { error: dbError(t, e as { message?: string; code?: string }) })
  }
  if (r === "not_allowed") back(here, { error: t("errors.not_allowed") })
  deliverSoon()
  back(here, { ok: t("forms.accepted") })
}

export async function rejectSubmission(fd: FormData) {
  const { ctx, t } = await manager()
  const back_ = String(fd.get("back") ?? "")
  const here = back_.startsWith("/forms/") ? back_ : PATH
  const { error } = await ctx.supabase.from("form_submissions").update({ status: "rejected" }).eq("id", str(fd, "id", 36) ?? "").eq("org_id", ctx.org.id).eq("status", "new")
  back(here, error ? { error: dbError(t, error) } : { ok: t("forms.rejected") })
}
