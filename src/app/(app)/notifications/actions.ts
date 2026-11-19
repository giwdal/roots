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

/** One row: read ↔ unread (the row's ⋯). Only `read_at` of the person's own rows can change (RLS + column grant). */
export async function setRead(fd: FormData) {
  const session = await getSession()
  if (!session) return
  const t = await getT()
  const id = Number(fd.get("id"))
  const read = fd.get("read") === "1"
  const { error } = await session.supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).eq("id", id).eq("user_id", session.userId)
  revalidatePath("/", "layout")
  back(String(fd.get("back") ?? "/notifications"), error ? { error: dbError(t, error) } : { ok: t(read ? "inbox.markedRead" : "inbox.markedUnread") })
}
