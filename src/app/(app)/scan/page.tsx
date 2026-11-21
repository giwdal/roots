import Link from "next/link"
import { Page, PageHeader } from "@/components/page"
import { TopbarCrumbs } from "@/components/topbar-crumbs"
import { BodyFlag } from "@/lib/body-flag"
import { Segments } from "@/components/segments"
import { cn } from "@/lib/utils"
import { FilterMenu } from "@/components/filter-menu"
import { notFound } from "next/navigation"
import { SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { memberDoor, type MemberAtDoor } from "@/members/door"
import { guestCheckIn, memberDoorCheckIn, ticketDoorCancel, ticketDoorCheckIn, ticketDoorUndo } from "./actions"
import { Choice } from "@/components/choice"
import { DetailList } from "@/components/detail-list"
import { UrlSheet } from "@/components/url-sheet"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MemberCard } from "./member-card"
import { Scanner } from "./scanner"
import { CheckIcon, ScanLineIcon, ShoppingCartIcon, UndoIcon, UsersIcon, XCircleIcon } from "lucide-react"
import { DoorSale } from "./door-sale"
import { doorOffer, doorSells, doorStats, doorSummary } from "@/tickets/door"
import { DoorStats } from "./door-stats"
import { ActionsMenu, MenuLink, MenuSubmit } from "@/components/actions-menu"

const TAB_ICONS = { scan: ScanLineIcon, sale: ShoppingCartIcon, list: UsersIcon } as const

// Door: pick the event (today's first), then scan QR codes, check guest lists, or look up tickets by name.
export default async function DoorPage({ searchParams }: PageProps<"/scan">) {
  const ctx = await getContext()
  const canScan = ctx.modules.has("tickets") && ctx.can("tickets.scan")
  const canGuests = ctx.modules.has("guestlists") && ctx.can("guestlists.checkin")
  if (!canScan && !canGuests) notFound()
  const t = await getT()
  const sp = await searchParams
  const now = new Date().getTime()
  const since = new Date(now - 12 * 3600_000).toISOString()
  const { data: events } = await ctx.supabase
    .from("events")
    .select("id, title, starts_at, door")
    .eq("org_id", ctx.org.id)
    .eq("status", "published")
    .gte("starts_at", new Date(now - 7 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(20)
  const current = events?.find((e) => e.id === param(sp, "event")) ?? events?.find((e) => e.starts_at >= since)
  const canMembers = canScan && ctx.modules.has("members")
  const [stats, sells] = current && canScan ? await Promise.all([doorStats(ctx.org.id, current.id), doorSells(ctx.org.id, current.door)]) : [null, false]
  // Lookups: "Alle" (tickets + guest lists in one list, members when searching) first, then each kind on its own.
  const tabs = [...(canScan ? ["scan", ...(sells ? ["sale"] : [])] : []), "all", ...(canScan ? ["tickets"] : []), ...(canMembers ? ["members"] : []), ...(canGuests ? ["guests"] : [])]
  const tab = tabs.find((x) => x === param(sp, "tab")) ?? tabs[0]
  // Phones show one view (`tab`, bottom tab bar). Desktop is a door dashboard: an action panel (Scannen · Verkauf)
  // next to the live numbers and a lookup panel (Tickets · Gäste · Mitglieder, `look`), all at once.
  const actions: string[] = tabs.filter((x) => x === "scan" || x === "sale")
  const lookups = tabs.filter((x) => !actions.includes(x))
  const action = actions.includes(tab) ? tab : actions[0]
  const look = lookups.find((x) => x === param(sp, "look")) ?? (lookups.includes(tab) ? tab : lookups[0])
  // Desktop panels keep each other's state in the URL; phone links set both so a resize shows the same view.
  const href = (next: { tab?: string; look?: string }) =>
    `/scan?${new URLSearchParams({ event: current?.id ?? "", tab: next.tab ?? tab, look: next.look ?? look ?? "" })}`
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  // Door settings (methods, terminal, cash book) are the event's ticket settings: the gear goes there.
  const settingsHref = current && ctx.modules.has("tickets") && ctx.can("tickets.manage") ? `/events/${current.id}/tickets?edit=settings#door` : undefined
  // "Einlass · <event>" as the page title (top bar); long names are cut so the bar keeps its buttons.
  const short = (x: string) => (x.length > 28 ? `${x.slice(0, 27).trimEnd()}…` : x)
  const title = current ? `${t("tickets.scanNav")} · ${short(current.title)}` : t("tickets.scanNav")
  return (
    <Page size="list">
      {/* Einlass hides the tab bar (it has its own): the top bar's back chevron is the way out. */}
      <TopbarCrumbs items={[{ href: "/events", label: t("eventsPage.title") }, { label: title }]} />
      <PageHeader
        area="events"
        title={title}
        settings={settingsHref ? { href: settingsHref, label: t("door.settingsLink") } : false}
        menu={
          (events?.length ?? 0) > 1 && (
            // Switching the event lives in ⋯ (an action sheet on phones), so the door screen stays calm.
            <ActionsMenu label={t("tickets.pickEvent")}>
              {events!.map((e) => (
                <MenuLink key={e.id} href={`/scan?event=${e.id}&tab=${tab}${look ? `&look=${look}` : ""}`} icon={<CheckIcon className={e.id === current?.id ? undefined : "invisible"} />}>
                  {`${e.title} · ${t.date(e.starts_at, { dateStyle: "short" })}`}
                </MenuLink>
              ))}
            </ActionsMenu>
          )
        }
      />
      <div className="grid gap-4 pb-24 md:pb-0">
      {!events?.length && <p className="text-sm text-muted-foreground">{t("tickets.noEventsToScan")}</p>}
      {current && (
        <>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          {/* Live numbers on every view; remounts when the server's numbers change (list check-ins re-render the page). */}
          {canScan && <DoorStats key={`${current.id}-${stats?.checkedIn}-${stats?.expected}`} eventId={current.id} initial={stats} />}
          {/* Phones: one view at a time, switched by the bottom tab bar (thumb reach). Hidden from md. */}
          <BodyFlag name="own-tab-bar" />
          <nav
            aria-label={t("door.tabs")}
            className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          >
            {[...actions, "list"].map((x) => {
              const Icon = TAB_ICONS[x as keyof typeof TAB_ICONS]
              const current = x === "list" ? !actions.includes(tab) : x === tab
              return (
                <Link
                  key={x}
                  href={x === "list" ? href({ tab: look, look }) : href({ tab: x })}
                  aria-current={current ? "page" : undefined}
                  className="flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground active:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-primary"
                >
                  <Icon className="size-5" />
                  {t.dynamic(`door.tab.${x}`)}
                </Link>
              )
            })}
          </nav>
          <div className={cn("grid gap-6", action && look && "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start")}>
            {action && (
              <div className={cn("grid min-w-0 gap-4", !actions.includes(tab) && "max-md:hidden")}>
                {actions.length > 1 && (
                  <Segments
                    label={t("door.tabs")}
                    className="justify-self-start max-md:hidden"
                    items={actions.map((x) => ({ href: href({ tab: x }), label: t.dynamic(`door.tab.${x}`), current: x === action }))}
                  />
                )}
                {action === "scan" && <Scanner key={current.id} eventId={current.id} />}
                {action === "sale" && <Sale eventId={current.id} settingsHref={settingsHref} />}
                <div className={cn(action !== "sale" && "max-md:hidden")}>
                  <DoorCash eventId={current.id} />
                </div>
              </div>
            )}
            <div className={cn("grid min-w-0 gap-4", actions.includes(tab) && "max-md:hidden", !action && "md:col-span-2")}>
              {lookups.length > 1 && (
                <Segments
                  label={t("door.lookup")}
                  className="justify-self-start max-md:w-full"
                  items={lookups.map((x) => ({ href: href({ look: x, tab: actions.includes(tab) ? tab : x }), label: t.dynamic(`door.tab.${x}`), current: x === look }))}
                />
              )}
              {look === "all" && <Everyone eventId={current.id} q={q} canScan={canScan} canGuests={canGuests} canMembers={canMembers} />}
              {look === "guests" && <Guests eventId={current.id} q={q} list={param(sp, "list")} />}
              {look === "tickets" && <Tickets eventId={current.id} q={q} />}
              {canScan && /^[0-9a-f-]{36}$/.test(param(sp, "edit") ?? "") && <CancelTicket eventId={current.id} id={param(sp, "edit")!} tab={tab} q={q} />}
              {look === "members" && <Members eventId={current.id} q={q} who={param(sp, "who")} sp={sp} />}
            </div>
          </div>
        </>
      )}
      </div>
    </Page>
  )
}

type Ctx = Awaited<ReturnType<typeof getContext>>
type T = Awaited<ReturnType<typeof getT>>

// Guest-list entries for this event: its lists + permanent lists (valid at every event).
async function loadGuests(ctx: Ctx, eventId: string, q?: string, list?: string) {
  const { data: lists } = await ctx.supabase
    .from("guest_lists")
    .select("id, name, door_price, event_id")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .or(`event_id.eq.${eventId},event_id.is.null`)
    .order("name")
  const ids = (list && lists?.some((l) => l.id === list) ? [list] : lists?.map((l) => l.id)) ?? []
  let entries = ctx.supabase
    .from("guest_entries")
    .select("id, name, list_id, guest_checkins(event_id, checked_in_at)")
    .in("list_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("name")
    .limit(500)
  if (q) entries = entries.ilike("name", `%${q}%`)
  const { data } = await entries
  const byId = new Map(lists?.map((l) => [l.id, l]))
  const rows = (data ?? []).map((e) => ({ ...e, list: byId.get(e.list_id)!, at: e.guest_checkins.find((c) => c.event_id === eventId)?.checked_in_at }))
  return { lists: lists ?? [], rows }
}
type GuestRow = Awaited<ReturnType<typeof loadGuests>>["rows"][number]

// `pill` = which kind of entry (only in "Alle").
function guestRow(t: T, eventId: string, r: GuestRow, back: { tab: string; q?: string; list?: string }, pill?: boolean) {
  return (
    <DoorRow
      key={`g${r.id}`}
      title={r.name}
      pill={pill ? t("door.kind.guest") : undefined}
      meta={[r.list.name, r.list.door_price > 0 && t("guestlists.atDoor", { price: t.money(r.list.door_price) })].filter(Boolean).join(" · ")}
      done={!!r.at}
    >
      <form action={guestCheckIn} className="flex items-center gap-2">
        <input type="hidden" name="event" value={eventId} />
        <input type="hidden" name="entry" value={r.id} />
        <input type="hidden" name="name" value={r.name} />
        <input type="hidden" name="tab" value={back.tab} />
        <input type="hidden" name="q" value={back.q ?? ""} />
        <input type="hidden" name="list" value={back.list ?? ""} />
        {r.at ? (
          <>
            <Badge variant="success">{t("door.inSince", { time: t.date(r.at, { timeStyle: "short" }) })}</Badge>
            <input type="hidden" name="undo" value="1" />
            <SubmitButton size="lg" variant="ghost" className="h-11">
              {t("door.undo")}
            </SubmitButton>
          </>
        ) : (
          <SubmitButton size="lg" className="h-11 px-6">{t("door.checkIn")}</SubmitButton>
        )}
      </form>
    </DoorRow>
  )
}

async function Guests({ eventId, q, list }: { eventId: string; q?: string; list?: string }) {
  const ctx = await getContext()
  const t = await getT()
  const { lists, rows } = await loadGuests(ctx, eventId, q, list)
  const inCount = rows.filter((r) => r.at).length
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox size="lg" q={q} label={t("door.searchGuests")} keep={{ event: eventId, tab: "guests", ...(list ? { list } : {}) }} />
        {lists.length > 1 && <FilterMenu param="list" label={t("door.list")} allLabel={t("door.allLists")} options={lists.map((l) => ({ value: l.id, label: l.name }))} />}
        <span className="text-sm text-muted-foreground md:ml-auto">{t("door.guestCount", { in: inCount, total: rows.length })}</span>
      </div>
      <ul className="grid gap-2">
        {rows.map((r) => guestRow(t, eventId, r, { tab: "guests", q, list }))}
        {!rows.length && <li className="text-sm text-muted-foreground">{t("door.noGuests")}</li>}
      </ul>
    </section>
  )
}

// Abendkasse: sell tickets / free amounts.
async function Sale({ eventId, settingsHref }: { eventId: string; settingsHref?: string }) {
  const ctx = await getContext()
  const [offer, stats] = await Promise.all([doorOffer(ctx.org.id, eventId), doorStats(ctx.org.id, eventId)])
  if (!offer) return null
  return (
    <DoorSale
      key={eventId}
      eventId={eventId}
      types={offer.types.map((ty) => ({ ...ty, left: stats?.capacity ? null : (stats?.left[ty.id] ?? null) }))}
      methods={offer.methods}
      provider={offer.provider}
      left={offer.left}
      currency={offer.types[0]?.currency ?? "eur"}
      settingsHref={settingsHref}
    />
  )
}

// The night's door sales per payment method (for counting the till).
async function DoorCash({ eventId }: { eventId: string }) {
  const ctx = await getContext()
  const t = await getT()
  const sum = await doorSummary(ctx.org.id, eventId)
  if (!sum.sales) return null
  return (
    <section className="grid gap-2 rounded-xl bg-muted p-4 text-sm" aria-label={t("door.sale.summary")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{t("door.sale.summary")}</h3>
        <span className="text-xs text-muted-foreground">{t("door.sale.summaryMeta", { sales: sum.sales, tickets: sum.tickets })}</span>
      </div>
      {Object.entries(sum.byMethod).map(([m, x]) => (
        <div key={m} className="flex justify-between gap-2">
          <span>
            {t.dynamic(`door.sale.method.${m}`)} · {x.count}
          </span>
          <span className="tabular-nums">{t.money(x.total)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t pt-2 font-medium">
        <span>{t("door.sale.total")}</span>
        <span className="tabular-nums">{t.money(sum.total)}</span>
      </div>
    </section>
  )
}

async function loadTickets(ctx: Ctx, eventId: string, q?: string) {
  let query = ctx.supabase
    .from("tickets")
    .select("id, code, holder_name, status, checked_in_at, ticket_types(name), pay_orders(customer_name, paid_at)")
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "void"])
    .order("holder_name")
    .limit(200)
  if (q) query = query.or(`holder_name.ilike.%${q}%,code.ilike.%${q}%`)
  const { data } = await query
  // Cancelled = void tickets of orders that were paid (refunds), not reservations that simply expired.
  // ponytail: expired reservations still count toward the 200 limit; filter in SQL if that bites.
  return (data ?? []).filter((k) => k.status !== "void" || k.pay_orders?.paid_at)
}
type TicketRow = Awaited<ReturnType<typeof loadTickets>>[number]
const ticketName = (k: TicketRow) => k.holder_name ?? k.pay_orders?.customer_name ?? "–"

// Valid: Einchecken (+ Stornieren for whoever may cancel); checked in: the time + Auschecken (let in by mistake).
function ticketRow(t: T, eventId: string, k: TicketRow, back: { tab: string; q?: string; canCancel?: boolean }, pill?: boolean) {
  const hidden = (
    <>
      <input type="hidden" name="event" value={eventId} />
      <input type="hidden" name="tab" value={back.tab} />
      <input type="hidden" name="q" value={back.q ?? ""} />
    </>
  )
  return (
    <DoorRow key={`t${k.id}`} title={ticketName(k)} pill={pill ? t("door.kind.ticket") : undefined} meta={[k.ticket_types?.name, k.code].filter(Boolean).join(" · ")} done={k.status !== "valid"}>
      {k.status === "void" ? (
        <Badge variant="destructive">{t("tickets.statuses.void")}</Badge>
      ) : k.status === "used" ? (
        // Checked in: the time, and Auschecken (let in by mistake) in ⋯ so the name keeps its room.
        <div className="flex items-center gap-1">
          {k.checked_in_at && <span className="text-sm text-muted-foreground tabular-nums">{t("door.inSince", { time: t.date(k.checked_in_at, { timeStyle: "short" }) })}</span>}
          <form id={`undo-${k.id}`} action={ticketDoorUndo} hidden>
            {hidden}
            <input type="hidden" name="id" value={k.id} />
          </form>
          <ActionsMenu>
            <MenuSubmit form={`undo-${k.id}`} icon={<UndoIcon />}>
              {t("door.checkOut")}
            </MenuSubmit>
          </ActionsMenu>
        </div>
      ) : (
        // One button (Einchecken); Stornieren lives in ⋯.
        <div className="flex items-center gap-1">
          <form action={ticketDoorCheckIn}>
            {hidden}
            <input type="hidden" name="code" value={k.code} />
            <SubmitButton size="lg" className="h-11 px-5">{t("door.checkIn")}</SubmitButton>
          </form>
          {back.canCancel && (
            <ActionsMenu>
              <MenuLink href={`/scan?${new URLSearchParams({ event: eventId, tab: back.tab, q: back.q ?? "", edit: k.id })}`} icon={<XCircleIcon />} destructive>
                {t("door.cancel")}
              </MenuLink>
            </ActionsMenu>
          )}
        </div>
      )}
    </DoorRow>
  )
}

// "Stornieren" (?edit=<ticket>): void it, with or without giving the money back; the note goes to the refund.
async function CancelTicket({ eventId, id, tab, q }: { eventId: string; id: string; tab: string; q?: string }) {
  const ctx = await getContext()
  const t = await getT()
  const { data: k } = await ctx.supabase
    .from("tickets")
    .select("id, code, holder_name, status, price, ticket_types(name), pay_orders(customer_name, status)")
    .eq("id", id)
    .eq("event_id", eventId)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!k || k.status !== "valid") return null
  const paid = (k.price ?? 0) > 0 && ["paid", "partially_refunded"].includes(k.pay_orders?.status ?? "")
  const canRefund = paid && ctx.can("payments.refund")
  return (
    <UrlSheet params={["edit"]} title={t("door.cancelTitle")} compact>
      <form action={ticketDoorCancel} className="grid gap-4">
        <input type="hidden" name="event" value={eventId} />
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="q" value={q ?? ""} />
        <input type="hidden" name="id" value={k.id} />
        <DetailList
          items={[
            { label: t("tickets.holder"), value: k.holder_name ?? k.pay_orders?.customer_name },
            { label: t("tickets.typeName"), value: [k.ticket_types?.name, k.code].filter(Boolean).join(" · ") },
            paid && { label: t("tickets.price"), value: t.money(k.price ?? 0) },
          ]}
        />
        {canRefund ? (
          <div className="grid gap-2">
            <Label htmlFor="door-refund">{t("door.refund")}</Label>
            <Choice id="door-refund" name="refund" label={t("door.refund")} required defaultValue="1" options={[{ value: "1", label: t("door.refundYes") }, { value: "0", label: t("door.refundNo") }]} />
          </div>
        ) : (
          <input type="hidden" name="refund" value="0" />
        )}
        {canRefund && (
          <div className="grid gap-2">
            <Label htmlFor="door-reason">{t("door.cancelNote")}</Label>
            <Textarea id="door-reason" name="reason" rows={2} maxLength={500} />
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SubmitButton variant="destructive" data-confirm="door.confirmCancel">
            {t("door.cancel")}
          </SubmitButton>
        </div>
      </form>
    </UrlSheet>
  )
}

async function Tickets({ eventId, q }: { eventId: string; q?: string }) {
  const ctx = await getContext()
  const t = await getT()
  const data = await loadTickets(ctx, eventId, q)
  const canCancel = ctx.can("tickets.manage") || ctx.can("payments.refund")
  return (
    <section className="grid gap-3">
      <SearchBox size="lg" q={q} label={t("door.searchTickets")} keep={{ event: eventId, tab: "tickets" }} />
      <ul className="grid gap-2">
        {data.map((k) => ticketRow(t, eventId, k, { tab: "tickets", q, canCancel }))}
        {!data.length && <li className="text-sm text-muted-foreground">{t("door.noTickets")}</li>}
      </ul>
    </section>
  )
}

// "Alle": everyone expected tonight in one list (tickets + guest lists, by name, a pill says which); members have no
// entry for an event, so they only join when searching (a hit opens their card on the Mitglieder view).
async function Everyone({ eventId, q, canScan, canGuests, canMembers }: { eventId: string; q?: string; canScan: boolean; canGuests: boolean; canMembers: boolean }) {
  const ctx = await getContext()
  const t = await getT()
  const [tickets, guests, { data: members }] = await Promise.all([
    canScan ? loadTickets(ctx, eventId, q) : [],
    canGuests ? loadGuests(ctx, eventId, q).then((g) => g.rows) : [],
    canMembers && q ? ctx.supabase.rpc("member_door_search", { p_event: eventId, p_q: q }) : Promise.resolve({ data: [] }),
  ])
  const rows = [
    ...tickets.map((k) => ({ name: ticketName(k), node: ticketRow(t, eventId, k, { tab: "all", q, canCancel: ctx.can("tickets.manage") || ctx.can("payments.refund") }, true) })),
    ...guests.map((g) => ({ name: g.name, node: guestRow(t, eventId, g, { tab: "all", q }, true) })),
    ...(members ?? []).map((m) => ({
      name: m.name ?? "",
      node: (
        <DoorRow key={`m${m.contact_id}`} title={m.name ?? "–"} pill={t("door.kind.member")} meta={m.member_no ? t("membership.numberShort", { number: m.member_no }) : undefined}>
          <Button render={<Link href={`/scan?${new URLSearchParams({ event: eventId, tab: "members", look: "members", q: q ?? "", who: m.contact_id })}`} />} nativeButton={false} size="lg" variant="outline" className="h-11 px-6">
            {t("door.member.open")}
          </Button>
        </DoorRow>
      ),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name, t.locale))
  return (
    <section className="grid gap-3">
      <SearchBox size="lg" q={q} label={canMembers ? t("door.searchAllMembers") : t("door.searchTickets")} keep={{ event: eventId, tab: "all" }} />
      <ul className="grid gap-2">
        {rows.map((r) => r.node)}
        {!rows.length && <li className="text-sm text-muted-foreground">{t("door.noOne")}</li>}
      </ul>
    </section>
  )
}

// Members by name (forgot the card): pick one → the same card as the scanner, with "Einlassen".
async function Members({ eventId, q, who, sp }: { eventId: string; q?: string; who?: string; sp: Record<string, string | string[] | undefined> }) {
  const ctx = await getContext()
  const t = await getT()
  const valid = !!who && /^[0-9a-f-]{36}$/.test(who)
  const [{ data: found }, member] = await Promise.all([
    q ? ctx.supabase.rpc("member_door_search", { p_event: eventId, p_q: q }) : Promise.resolve({ data: [] }),
    valid ? memberDoor(ctx.supabase, eventId, { contactId: who }, false).catch((): MemberAtDoor => ({ result: "invalid" })) : null,
  ])
  return (
    <section className="grid gap-3">
      <SearchBox size="lg" q={q} label={t("door.searchMembers")} keep={{ event: eventId, tab: "members" }} />
      {member && (
        <MemberCard t={t} m={member}>
          <form action={memberDoorCheckIn}>
            <input type="hidden" name="event" value={eventId} />
            <input type="hidden" name="contact" value={who} />
            <input type="hidden" name="q" value={q ?? ""} />
            <SubmitButton size="lg">{t("door.member.admit")}</SubmitButton>
          </form>
        </MemberCard>
      )}
      {q && (
        <ul className="grid gap-1">
          {(found ?? []).map((m) => (
            <li key={m.contact_id}>
              <Link
                href={withParams(sp, { who: m.contact_id })}
                aria-current={m.contact_id === who ? "true" : undefined}
                className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 hover:bg-muted aria-[current=true]:bg-muted"
              >
                <span className="font-medium">{m.name}</span>
                {m.member_no && <span className="text-muted-foreground">{t("membership.numberShort", { number: m.member_no })}</span>}
              </Link>
            </li>
          ))}
          {!found?.length && <li className="text-sm text-muted-foreground">{t("door.member.noneFound")}</li>}
        </ul>
      )}
    </section>
  )
}

export const instant = false

// One person at the door: big name, one muted line, the action on the right (wraps below on narrow phones).
function DoorRow({ title, pill, meta, done, children }: { title: string; pill?: string; meta?: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${done ? "bg-muted/50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-medium">{title}</span>
          {pill && <Badge variant="outline" className="shrink-0">{pill}</Badge>}
        </p>
        {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
      </div>
      {children}
    </li>
  )
}
