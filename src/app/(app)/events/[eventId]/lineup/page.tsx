import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ListChecksIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { DataTable } from "@/components/data-table"
import { DateInput } from "@/components/date-input"
import { Notice } from "@/components/notice"
import { EmptyState } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { toLocalInput } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { artistGuestList, deleteSlot, saveArtist, saveSlot } from "./actions"
import { ArtistField } from "./artist-field"

// The event's timetable. A slot (?edit=<slot id>, ?new=slot) is an artist and/or a title with stage and times; the
// artist's own details (public description, links, internal notes) open in their sheet (?edit=<artist id>).
export default async function LineupPage({ params, searchParams }: PageProps<"/events/[eventId]/lineup">) {
  const ctx = await requirePerm("events.view")
  if (!ctx.modules.has("events")) notFound()
  const { eventId } = await params
  const sp = await searchParams
  const t = await getT()
  // Old sheet links (?slot=<id>, ?artist=<id>) → ?edit=<id>.
  const old = param(sp, "slot") ?? param(sp, "artist")
  if (old) redirect(`/events/${eventId}/lineup?edit=${old}`)
  const canManage = ctx.can("events.manage")
  const guestlists = ctx.modules.has("guestlists") && ctx.can("guestlists.manage")
  const editId = canManage ? param(sp, "edit") : undefined
  const [{ data: ev }, { data: slots }] = await Promise.all([
    ctx.supabase.from("events").select("id, title, starts_at").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("event_slots").select("*, artists(id, name)").eq("event_id", eventId).order("starts_at"),
  ])
  if (!ev) notFound()
  const editingSlot = slots?.find((s) => s.id === editId)
  const { data: editingArtist } =
    editId && !editingSlot && /^[0-9a-f-]{36}$/.test(editId)
      ? await ctx.supabase.from("artists").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle()
      : { data: null }
  const creating = canManage && param(sp, "new") === "slot"
  const sheet = !!(creating || editingSlot || editingArtist)
  const time = (v: string) => t.date(v, { weekday: "short", hour: "2-digit", minute: "2-digit" })
  const newSlot = withParams(sp, { new: "slot", edit: undefined })

  return (
    <>
      <Notice error={sheet ? undefined : param(sp, "error")} ok={param(sp, "ok")} />
      {slots?.length ? (
        <section className="grid gap-3" aria-label={t("lineup.title")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("lineup.count", { count: slots.length })}</p>
            {canManage && (
              <Button render={<Link href={newSlot} scroll={false} />} nativeButton={false} size="sm">
                <PlusIcon /> {t("lineup.newSlot")}
              </Button>
            )}
          </div>
          <DataTable
            rows={slots}
            rowKey={(s) => s.id}
            rowHref={canManage ? (s) => withParams(sp, { edit: s.id, new: undefined }) : undefined}
            empty={t("lineup.empty")}
            columns={[
              {
                header: t("lineup.act"),
                cell: (s) => (
                  <span className="grid min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {s.artists?.name ?? s.title}
                      {!s.public && <Badge variant="secondary">{t("lineup.internal")}</Badge>}
                    </span>
                    {s.artists && s.title && <span className="text-xs text-muted-foreground">{s.title}</span>}
                  </span>
                ),
              },
              {
                header: t("lineup.time"),
                cell: (s) => (
                  <span className="whitespace-nowrap tabular-nums">
                    {time(s.starts_at)}
                    {s.ends_at && ` – ${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                ),
              },
              { header: t("lineup.stage"), cell: (s) => s.stage },
            ]}
          />
        </section>
      ) : (
        <EmptyState
          area="events"
          title={t("lineup.empty")}
          text={t("lineup.emptyText")}
          action={
            canManage && (
              <Button render={<Link href={newSlot} scroll={false} />} nativeButton={false} size="sm">
                <PlusIcon /> {t("lineup.newSlot")}
              </Button>
            )
          }
        />
      )}

      {(creating || editingSlot) && (
        <UrlSheet
          params={["new", "edit"]}
          title={editingSlot ? (editingSlot.artists?.name ?? editingSlot.title ?? "") : t("lineup.newSlot")}
          menu={
            editingSlot && (
              <ActionsMenu>
                {editingSlot.artists && (
                  <MenuLink href={withParams(sp, { edit: editingSlot.artists.id })} icon={<PencilIcon />}>
                    {t("lineup.editArtist")}
                  </MenuLink>
                )}
                {editingSlot.artists && guestlists && (
                  <MenuSubmit form="artist-guestlist" icon={<ListChecksIcon />}>
                    {t("lineup.guestList")}
                  </MenuSubmit>
                )}
                {editingSlot.artists && <MenuSeparator />}
                <MenuSubmit form="delete-slot" icon={<Trash2Icon />} destructive confirm="lineup.confirmDeleteSlot">
                  {t("lineup.deleteSlot")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} />
          <SlotForm t={t} eventId={ev.id} defaultStart={ev.starts_at} slot={editingSlot} />
          {editingSlot && (
            <>
              <form id="delete-slot" action={deleteSlot} hidden>
                <input type="hidden" name="event" value={ev.id} />
                <input type="hidden" name="id" value={editingSlot.id} />
              </form>
              {editingSlot.artists && guestlists && (
                <form id="artist-guestlist" action={artistGuestList} hidden>
                  <input type="hidden" name="event" value={ev.id} />
                  <input type="hidden" name="artist" value={editingSlot.artists.id} />
                </form>
              )}
            </>
          )}
        </UrlSheet>
      )}
      {editingArtist && (
        <UrlSheet params={["edit"]} title={editingArtist.name} description={t("lineup.artistHint")}>
          <Notice error={param(sp, "error")} />
          <form action={saveArtist} className="grid gap-4">
            <input type="hidden" name="event" value={ev.id} />
            <input type="hidden" name="id" value={editingArtist.id} />
            <div className="grid gap-2">
              <Label htmlFor="a-name">{t("lineup.artistName")}</Label>
              <Input id="a-name" name="name" defaultValue={editingArtist.name} required maxLength={200} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-desc">{t("lineup.description")}</Label>
              <Textarea id="a-desc" name="description" rows={4} defaultValue={editingArtist.description ?? ""} maxLength={5000} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-links">{t("lineup.links")}</Label>
              <Textarea id="a-links" name="links" rows={2} defaultValue={editingArtist.links.join("\n")} placeholder="https://soundcloud.com/…" />
              <p className="text-xs text-muted-foreground">{t("lineup.linksHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-notes">{t("lineup.notes")}</Label>
              <Textarea id="a-notes" name="notes" rows={3} defaultValue={editingArtist.notes ?? ""} maxLength={5000} placeholder={t("lineup.notesPlaceholder")} />
            </div>
            <SaveBar />
          </form>
        </UrlSheet>
      )}
    </>
  )
}

function SlotForm({ t, eventId, defaultStart, slot }: { t: T; eventId: string; defaultStart: string; slot?: Tables<"event_slots"> & { artists: { id: string; name: string } | null } }) {
  return (
    <form action={saveSlot} className="grid gap-4">
      <input type="hidden" name="event" value={eventId} />
      {slot && <input type="hidden" name="id" value={slot.id} />}
      <ArtistField initial={slot?.artists ? { id: slot.artists.id, label: slot.artists.name } : null} />
      <div className="grid gap-2">
        <Label htmlFor="s-title">{t("lineup.slotTitle")}</Label>
        <Input id="s-title" name="title" defaultValue={slot?.title ?? ""} maxLength={200} placeholder={t("lineup.slotTitlePlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="s-start">{t("lineup.start")}</Label>
          <DateInput id="s-start" name="starts_at" type="datetime-local" required defaultValue={toLocalInput(slot?.starts_at ?? defaultStart)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-end">{t("lineup.end")}</Label>
          <DateInput id="s-end" name="ends_at" type="datetime-local" defaultValue={slot?.ends_at ? toLocalInput(slot.ends_at) : undefined} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="s-stage">{t("lineup.stage")}</Label>
        <Input id="s-stage" name="stage" defaultValue={slot?.stage ?? ""} maxLength={100} placeholder="Main Floor" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" value="1" defaultChecked={slot?.public ?? true} className="size-4 accent-primary" />
        {t("lineup.publicLabel")}
      </label>
      <div className="grid gap-2">
        <Label htmlFor="s-notes">{t("lineup.notes")}</Label>
        <Input id="s-notes" name="notes" defaultValue={slot?.notes ?? ""} maxLength={2000} />
      </div>
      <SaveBar label={slot ? undefined : t("lineup.createSlot")} always={!slot} />
    </form>
  )
}

export const instant = false
