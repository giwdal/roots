"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { removeImage, replaceImage } from "@/lib/images"
import { getT } from "@/i18n/server"
import { authError, dbError } from "@/i18n/translate"
import { getSession } from "@/lib/context"
import { MIN_PASSWORD } from "@/lib/inputs"
import { back } from "@/lib/url"
import { eventTypes, personChannels } from "@/events/registry"

// Where the form came from: a settings page (or its sheet) or the standalone /account page.
const backTo = (formData: FormData, key = "back") => {
  const to = String(formData.get(key) ?? "")
  return /^\/settings\/[a-z]+(\?edit=[a-z]+)?$/.test(to) ? to : "/account"
}

/** Name edited in place (InlineField): saves the one value, the sidebar shows it after the refresh. */
export async function patchProfile(formData: FormData): Promise<{ error?: string }> {
  const session = await getSession()
  const t = await getT()
  if (!session || formData.get("field") !== "full_name") return { error: t("errors.not_allowed") }
  const full_name = String(formData.get("value") ?? "").trim().slice(0, 100) || null
  const { error } = await session.supabase.from("profiles").update({ full_name }).eq("id", session.userId)
  if (error) return { error: dbError(t, error) }
  revalidatePath("/", "layout")
  return {}
}

// `retry` = where errors go (the open password sheet), `back` = where it lands once changed.
export async function updatePassword(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const t = await getT()
  const retry = formData.get("retry") ? backTo(formData, "retry") : backTo(formData)
  const password = String(formData.get("password") ?? "")
  if (password.length < MIN_PASSWORD) back(retry, { error: t("auth.passwordTooShort", { min: MIN_PASSWORD }) })
  if (password !== String(formData.get("repeat") ?? "")) back(retry, { error: t("account.passwordsDontMatch") })
  const { error } = await session.supabase.auth.updateUser({ password })
  if (error) back(retry, { error: authError(t, error) })
  back(backTo(formData), { ok: t("account.passwordChanged") })
}

/** One switch of Settings › Benachrichtigungen: this event type on this channel, on or off. */
export async function setPreference(eventType: string, channel: string, enabled: boolean): Promise<{ error?: string }> {
  const session = await getSession()
  const t = await getT()
  const known = eventTypes.some((e) => e.key === eventType && e.audience && (!e.audience.platform || session?.isPlatformAdmin))
  if (!session || !known || !(personChannels as readonly string[]).includes(channel)) return { error: t("errors.not_allowed") }
  const { error } = await session.supabase
    .from("notification_preferences")
    .upsert({ user_id: session.userId, event_type: eventType, channel, enabled: !!enabled }, { onConflict: "user_id,event_type,channel" })
  return error ? { error: dbError(t, error) } : {}
}

export async function updateAvatar(formData: FormData) {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const t = await getT()
  const { data: profile } = await session.supabase.from("profiles").select("avatar_path").eq("id", session.userId).maybeSingle()
  let avatar_path: string | null = null
  if (formData.get("remove") === "1") await removeImage(session.supabase, profile?.avatar_path)
  else {
    const res = await replaceImage(session.supabase, `users/${session.userId}`, formData.get("file"), profile?.avatar_path)
    if ("error" in res) back(backTo(formData), { error: t.dynamic(`errors.${res.error}`) })
    avatar_path = res.path!
  }
  const { error } = await session.supabase.from("profiles").update({ avatar_path }).eq("id", session.userId)
  if (error) back(backTo(formData), { error: dbError(t, error) })
  revalidatePath("/", "layout")
  back(backTo(formData), { ok: t("account.saved") })
}
