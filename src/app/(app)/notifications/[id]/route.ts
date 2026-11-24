import { NextResponse } from "next/server"
import { renderEvent } from "@/events/render"
import { getT } from "@/i18n/server"
import { getContext, getSession, setActiveOrg } from "@/lib/context"
import { APP_URL } from "@/lib/url"

// Opening a notification: mark it read, go to what it's about. One of another org switches to that org and says so
// (?ok= on the target: the page's <Notice> shows "Gewechselt zu …"), so nobody lands in another org unknowingly.
export async function GET(request: Request, { params }: RouteContext<"/notifications/[id]">) {
  // Links to this route get prefetched (home inbox, list): a prefetch must not switch the org or mark anything read.
  const h = request.headers
  if (h.get("next-router-prefetch") || h.get("next-router-segment-prefetch") || h.get("sec-purpose")?.includes("prefetch") || h.get("purpose") === "prefetch") return new NextResponse(null, { status: 204 })
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.redirect(`${APP_URL}/login`)
  const { data: n } = await session.supabase
    .from("notifications")
    .select("id, org_id, orgs(name), events:hub_events(type, payload)")
    .eq("id", Number(id))
    .eq("user_id", session.userId)
    .maybeSingle()
  if (!n) return NextResponse.redirect(`${APP_URL}/notifications`)
  await session.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id).is("read_at", null)
  let switched: string | null = null
  if (n.org_id) {
    const current = await getContext().then((c) => c.org.id).catch(() => null)
    if (current !== n.org_id) {
      await setActiveOrg(n.org_id)
      switched = n.orgs?.name ?? null
    }
  }
  const href = (n.events ? renderEvent(n.events, null).href : undefined) ?? "/notifications"
  if (!switched) return NextResponse.redirect(`${APP_URL}${href}`)
  const t = await getT()
  const url = new URL(`${APP_URL}${href}`)
  url.searchParams.set("ok", t("inbox.switched", { org: switched }))
  return NextResponse.redirect(url)
}
