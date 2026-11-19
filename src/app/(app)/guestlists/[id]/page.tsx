import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLinkIcon, PencilIcon, Trash2Icon, UserMinusIcon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { DetailList } from "@/components/detail-list"
import { InlineField } from "@/components/inline-field"
import { InlineTitle } from "@/components/inline-title"
import { toLocalInput } from "@/lib/time"
import { priceInput } from "@/tickets/price"
import { CopyButton } from "@/components/copy-button"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl, withParams } from "@/lib/url"
import { addEntries, patchGuestList, removeEntry, renameEntry, setLink, trashList } from "../actions"
import { ListForm } from "../list-form"

// A guest list opens on its numbers (guests, in, via link) with "Gäste hinzufügen" as the next step, the share link,
// then the guests (main column) with Eigenschaften (edited in place) and the share link in the rail; a guest opens in a
// sheet (?edit=<entry>) to rename or remove, the whole form (event, artist) in ⋯ → ?edit=list.
export default async function GuestListPage({ params, searchParams }: PageProps<"/guestlists/[id]">) {
  const ctx = await requirePerm("guestlists.view")
  if (!ctx.modules.has("guestlists")) notFound()
  const { id } = await params
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("guestlists.manage")
  if (param(sp, "edit") === "1") redirect(`/guestlists/${id}?edit=list`) // old settings sheet
  const [{ data: list }, { data: entries }] = await Promise.all([
    ctx.supabase.from("guest_lists").select("*, events(id, title, starts_at, status), artists(id, name)").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("guest_entries").select("id, name, email, added_via, submitted_by, created_at, tickets!guest_entries_ticket_id_fkey(code, status), guest_checkins(event_id, checked_in_at)").eq("list_id", id).order("name"),
  ])
  if (!list) notFound()
  const rows = entries ?? []
  const link = list.link_token ? siteUrl(ctx.org.slug, `/g/${list.link_token}`, ctx.org.site_domain) : null
  const checkedIn = (e: (typeof rows)[number]) => (list.event_id ? e.guest_checkins.find((c) => c.event_id === list.event_id) : e.guest_checkins.at(-1))
  const edit = canManage ? param(sp, "edit") : undefined
  const editingList = edit === "list"
  const entry = edit && edit !== "list" ? rows.find((e) => e.id === edit) : undefined
  const adding = canManage && param(sp, "new") === "guests"
  const inside = rows.filter((e) => checkedIn(e)).length
  const viaLink = rows.filter((e) => e.added_via === "link").length
  const hidden = <input type="hidden" name="id" value={list.id} />
  // Eigenschaften: each value edited in place (patchGuestList); event + artist are pickers in "Alle Angaben bearbeiten".
  const prop = (field: string, label: string, value: string | null, opts: Omit<React.ComponentProps<typeof InlineField>, "action" | "id" | "field" | "value" | "label"> = {}) => ({
    label,
    value: <InlineField action={patchGuestList} id={list.id} field={field} value={value} label={label} disabled={!canManage} {...opts} />,
  })
  const properties = [
    prop("door_price", t("guestlists.doorPriceLabel"), priceInput(list.door_price), { kind: "money", display: list.door_price ? t.money(list.door_price) : t("guestlists.free") }),
    prop("quota", t("guestlists.quota"), list.quota == null ? null : String(list.quota), { kind: "number", display: list.quota == null ? undefined : String(list.quota) }),
    prop("per_submission", t("guestlists.perSubmission"), String(list.per_submission), { kind: "number", display: String(list.per_submission) }),
    prop("link_closes_at", t("guestlists.closesAtShort"), list.link_closes_at ? toLocalInput(list.link_closes_at) : null, { kind: "datetime", display: list.link_closes_at ? t.date(list.link_closes_at, { dateStyle: "medium", timeStyle: "short" }) : undefined }),
    list.artists && { label: t("guestlists.artist"), value: list.artists.name },
    prop("notes", t("guestlists.notesShort"), list.notes, { kind: "textarea" }),
  ]

  return (
    <Page>
      <PageHeader
        crumbs={
          // Event lists live in the event's Gästelisten; permanent lists (every event) in Events › Gästelisten.
          list.events
            ? [{ href: "/events", label: t("eventsPage.nav") }, { href: `/events/${list.events.id}/guestlists`, label: list.events.title }, { label: list.name }]
            : [{ href: "/guestlists", label: t("guestlists.title") }, { label: list.name }]
        }
        title={canManage ? <InlineTitle action={patchGuestList} id={list.id} name={list.name} label={t("guestlists.name")} /> : list.name}
        badge={<Badge variant={list.link_enabled ? "success" : "secondary"}>{list.link_enabled ? t("guestlists.linkOn") : t("guestlists.linkOff")}</Badge>}
        meta={
          <>
            {list.events ? `${list.events.title} · ${t.date(list.events.starts_at, { dateStyle: "medium", timeStyle: "short" })}` : t("guestlists.permanentHint")}
            {list.ticket_type_id && ` · ${t("guestlists.withTickets")}`}
          </>
        }
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={withParams(sp, { edit: "list" })} icon={<PencilIcon />}>
                {t("common.editAll")}
              </MenuLink>
              <MenuSeparator />
              <MenuSubmit form="trash-list" icon={<Trash2Icon />} destructive confirm="guestlists.confirmTrash">
                {t("guestlists.trash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={canManage ? { href: withParams(sp, { new: "guests" }), label: t("guestlists.addGuests") } : undefined}
      />
      {canManage && (
        <form id="trash-list" action={trashList} hidden>
          {hidden}
        </form>
      )}
      <Notice error={!edit && !adding ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <Stats>
        <Stat label={t("guestlists.statsGuests")} value={list.quota ? `${rows.length} / ${list.quota}` : rows.length} hint={list.quota ? t("guestlists.left", { count: Math.max(0, list.quota - rows.length) }) : undefined} />
        <Stat label={t("guestlists.statsIn")} value={`${inside} / ${rows.length}`} />
        <Stat label={t("guestlists.statsViaLink")} value={viaLink} />
      </Stats>

      <RecordLayout
        top={
          <Section id="details" title={t("common.properties")}>
            <DetailList items={properties} />
          </Section>
        }
        aside={
          <Section id="link" title={t("guestlists.publicLink")} description={t("guestlists.linkHint", { count: list.per_submission })}>
            {list.link_enabled && list.events && list.events.status !== "published" && (
              // The public link only opens for published events (guest_link_info): say so instead of a silent "closed".
              <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
                {t("guestlists.linkNeedsPublished")}{" "}
                <Link href={`/events/${list.events.id}`} className=" link">
                  {t("guestlists.toEvent")}
                </Link>
              </p>
            )}
            {link && list.link_enabled && (
              <div className="flex min-w-0 items-center gap-1 rounded-lg border px-3 py-1.5">
                <a href={link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm link">
                  {link.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton value={link} label={t("guestlists.copyLink")} />
                <Button render={<a href={link} target="_blank" rel="noreferrer" aria-label={t("guestlists.openLink")} />} nativeButton={false} size="icon-sm" variant="ghost">
                  <ExternalLinkIcon />
                </Button>
              </div>
            )}
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {(["on", "off", "renew"] as const)
                  .filter((w) => (w === "on" ? !list.link_enabled : w === "off" ? list.link_enabled : true))
                  .map((w) => (
                    <form key={w} action={setLink}>
                      {hidden}
                      <input type="hidden" name="link" value={w} />
                      <SubmitButton size="sm" variant={w === "on" ? "default" : "outline"} data-confirm={w === "renew" ? "guestlists.confirmRenew" : w === "off" ? "guestlists.confirmOff" : undefined}>
                        {t.dynamic(`guestlists.linkAction.${w}`)}
                      </SubmitButton>
                    </form>
                  ))}
              </div>
            )}
          </Section>
        }
      >
        <Section id="entries" title={`${t("guestlists.entriesTitle", { count: rows.length })}${list.quota ? ` / ${list.quota}` : ""}`}>
          <DataTable
            rows={rows}
            rowKey={(e) => e.id}
            rowHref={canManage ? (e) => withParams(sp, { edit: e.id }) : undefined}
            empty={t("guestlists.noEntries")}
            columns={[
              {
                header: t("guestlists.guest"),
                cell: (e) => (
                  <span className="grid">
                    <span className="font-medium">{e.name}</span>
                    {e.email && <span className="text-xs break-all text-muted-foreground">{e.email}</span>}
                  </span>
                ),
              },
              {
                header: t("guestlists.via"),
                cell: (e) => <span className="text-xs text-muted-foreground">{e.added_via === "link" ? t("guestlists.viaLink", { name: e.submitted_by ?? "–" }) : t("guestlists.viaApp")}</span>,
              },
              { header: t("guestlists.ticket"), cell: (e) => (e.tickets ? <span className="font-mono text-xs">{e.tickets.code}</span> : null) },
              {
                header: t("guestlists.checkedIn"),
                cell: (e) => {
                  const c = checkedIn(e)
                  return c ? <Badge variant="success">{t.date(c.checked_in_at, { timeStyle: "short" })}</Badge> : null
                },
              },
            ]}
          />
        </Section>
      </RecordLayout>

      {adding && (
        <UrlSheet params={["new"]} title={t("guestlists.addGuests")}>
          <Notice error={param(sp, "error")} />
          <form action={addEntries} className="grid gap-2">
            {hidden}
            <Label htmlFor="names">{t("guestlists.addNames")}</Label>
            <Textarea id="names" name="names" rows={6} placeholder={t("guestlists.namesPlaceholder")} autoFocus />
            {list.event_id && <p className="text-xs text-muted-foreground">{t("guestlists.addTicketsHint")}</p>}
            <SaveBar label={t("guestlists.add")} always />
          </form>
        </UrlSheet>
      )}

      {entry && (
        <UrlSheet
          params={["edit"]}
          title={entry.name}
          meta={entry.added_via === "link" ? t("guestlists.viaLink", { name: entry.submitted_by ?? "–" }) : t("guestlists.viaApp")}
          menu={
            <ActionsMenu>
              <MenuSubmit form="remove-entry" icon={<UserMinusIcon />} destructive confirm="guestlists.confirmRemove">
                {t("guestlists.remove")}
              </MenuSubmit>
            </ActionsMenu>
          }
        >
          <Notice error={param(sp, "error")} />
          <form action={renameEntry} className="grid gap-4">
            {hidden}
            <input type="hidden" name="entry" value={entry.id} />
            <div className="grid gap-2">
              <Label htmlFor="entry-name">{t("guestlists.guest")}</Label>
              <Input id="entry-name" name="name" defaultValue={entry.name} required maxLength={200} />
              <p className="text-xs text-muted-foreground">{t("guestlists.renameHint")}</p>
            </div>
            <SaveBar />
          </form>
          <form id="remove-entry" action={removeEntry} hidden>
            {hidden}
            <input type="hidden" name="entry" value={entry.id} />
          </form>
        </UrlSheet>
      )}

      {editingList && (
        <UrlSheet params={["edit"]} title={list.name}>
          <Notice error={param(sp, "error")} />
          <ListForm t={t} list={list} event={list.events ? { id: list.events.id, label: list.events.title } : null} artist={list.artists ? { id: list.artists.id, label: list.artists.name } : null} />
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
