import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { EmptyState } from "@/components/page"
import { AddLink } from "@/components/section"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { GuestListTable, LIST_COLS } from "../../../guestlists/table"

// The event's guest lists (plus permanent ones, which apply to every event). Lists open on their own page.
export default async function EventGuestLists({ params }: PageProps<"/events/[eventId]/guestlists">) {
  const ctx = await requirePerm("guestlists.view")
  if (!ctx.modules.has("guestlists")) notFound()
  const { eventId } = await params
  const t = await getT()
  const { data } = await ctx.supabase.from("guest_lists").select(LIST_COLS).eq("org_id", ctx.org.id).is("deleted_at", null).or(`event_id.eq.${eventId},event_id.is.null`).order("created_at")
  const canManage = ctx.can("guestlists.manage")
  const href = `/guestlists/new?event=${eventId}`
  if (!data?.length)
    return (
      <EmptyState
        area="events"
        title={t("guestlists.empty")}
        text={t("eventsPage.guestlistsEmptyText")}
        action={
          canManage && (
            <Button render={<Link href={href} />} nativeButton={false}>
              <PlusIcon /> {t("guestlists.new")}
            </Button>
          )
        }
      />
    )
  // The lists, then "+ Neue Gästeliste" at the end (like Ticketarten); permanent lists say so under their name.
  return (
    <section className="grid grid-cols-1 gap-3" aria-label={t("guestlists.title")}>
      <GuestListTable t={t} rows={data} withEvent={false} empty={t("guestlists.empty")} />
      {canManage && <AddLink href={href}>{t("guestlists.new")}</AddLink>}
    </section>
  )
}

export const instant = false
