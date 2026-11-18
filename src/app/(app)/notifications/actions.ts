"use server"

import { revalidatePath } from "next/cache"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getSession } from "@/lib/context"
import { back } from "@/lib/url"

export async function markAllRead() {
  const session = await getSession()
  if (!session) return
  const t = await getT()
  const { error } = await session.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.userId).is("read_at", null)
  revalidatePath("/", "layout")
  back("/notifications", error ? { error: dbError(t, error) } : { ok: t("inbox.allMarked") })
}
