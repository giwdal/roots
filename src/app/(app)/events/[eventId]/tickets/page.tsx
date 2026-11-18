import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLinkIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { CopyButton } from "@/components/copy-button"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { DateInput } from "@/components/date-input"
import { Choice } from "@/components/choice"
import { EmptyState } from "@/components/page"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { getContext, requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { toLocalInput } from "@/lib/time"
import { pageParam, param, siteUrl, withParams } from "@/lib/url"
import { posMethods, posReaders } from "@/payments/pos"
import { DOOR_METHODS, readDoor } from "@/tickets/door-fields"
import { priceInput } from "@/tickets/price"
import { AddLink, RowGroup, Section, SettingRow } from "@/components/section"
import { deleteCode, deleteTicketType, removeFromWaitlist, saveCode, saveTicketSettings, saveTicketType } from "./actions"
import { CodeKindFields } from "./code-kind-fields"
import { TierRows } from "./tier-rows"

type TicketType = Tables<"ticket_types">
type Code = Tables<"ticket_codes">
const STATUSES = ["valid", "used", "reserved", "void"] as const

// Tickets of one event: what's on sale (types), codes, who bought, who waits. Each record opens in a sheet
// (?edit=<type or code id>, ?new=type|code); the event's shop + door settings are one sheet (?edit=settings).
export default async function EventTickets({ params, searchParams }: PageProps<"/events/[eventId]/tickets">) {
  const ctx = await requirePerm("tickets.view")
  if (!ctx.modules.has("tickets")) notFound()
  const { eventId } = await params
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("tickets.manage")
  // Old sheet links (?code=<id>) → ?edit=<id>.
  if (param(sp, "code")) redirect(`/events/${eventId}/tickets?edit=${param(sp, "code")}`)
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const page = pageParam(sp)

  let list = ctx.supabase
    .from("tickets")
    .select("id, code, holder_name, status, created_at, checked_in_at, order_id, ticket_types(name), pay_orders(customer_email, customer_name)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  list = status ? list.eq("status", status) : list.neq("status", "reserved")
  if (q) list = list.or(`code.ilike.%${q}%,holder_name.ilike.%${q}%`)
  const [{ data: ev }, { data: types }, { data: tickets }, { data: avail }, { data: counts }, { data: tiers }, { data: codes }] = await Promise.all([
    ctx.supabase.from("events").select("id, title, slug, status, starts_at, ticket_names, max_tickets_per_order, show_code_field").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("ticket_types").select("*").eq("event_id", eventId).order("position").order("price"),
    list,
    ctx.supabase.rpc("ticket_availability", { p_event: eventId }),
    ctx.supabase.from("tickets").select("type_id, tier_id, code_id, status").eq("event_id", eventId).in("status", ["valid", "used"]),
    ctx.supabase.from("ticket_tiers").select("*, ticket_types!inner(event_id)").eq("ticket_types.event_id", eventId).order("position").order("created_at"),
    ctx.supabase.from("ticket_codes").select("*").eq("event_id", eventId).order("created_at"),
  ])
  if (!ev) notFound()
  // Shop types vs. the automatic ones (guest lists, members): counted apart; guest lists sit on top of the capacity.
  const shopTypes = (types ?? []).filter((ty) => !ty.guest_list_id && !ty.for_members)
  const isShop = new Set(shopTypes.map((ty) => ty.id))
  const sold = (typeId?: string) => counts?.filter((c) => (typeId ? c.type_id === typeId : isShop.has(c.type_id))).length ?? 0
  const checkedIn = counts?.filter((c) => c.status === "used").length ?? 0
  const left = new Map(avail?.map((a) => [a.type_id, a.remaining]))
  const editId = param(sp, "edit")
  const editing = canManage ? types?.find((ty) => ty.id === editId) : undefined
  const editingCode = canManage ? codes?.find((c) => c.id === editId) : undefined
  const settings = canManage && editId === "settings"
  const creating = canManage && param(sp, "new") === "type"
  const creatingCode = canManage && param(sp, "new") === "code"
  const sheet = !!(editing || editingCode || settings || creating || creatingCode)
  const used = (key: "tier_id" | "code_id", id: string) => counts?.filter((c) => c[key] === id).length ?? 0
  const shopUrl = siteUrl(ctx.org.slug, `/e/${ev.slug}`, ctx.org.site_domain)
  const codeUrl = (c: Code) => `${shopUrl}?code=${encodeURIComponent(c.code)}`
  const rows = tickets?.slice(0, PAGE_SIZE) ?? []
  const typeTiers = (id: string) => tiers?.filter((r) => r.type_id === id) ?? []

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">{t("tickets.summary", { sold: sold(), checkedIn })}</p>
        {canManage && (
          <Tooltip>
            <TooltipTrigger render={<Button render={<Link href={withParams(sp, { edit: "settings", new: undefined })} scroll={false} />} nativeButton={false} size="icon-sm" variant="ghost" aria-label={t("tickets.settings")} />}>
              <SettingsIcon />
            </TooltipTrigger>
            <TooltipContent>{t("tickets.settings")}</TooltipContent>
          </Tooltip>
        )}
        {ev.status === "published" && (
          <Button render={<a href={shopUrl} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
            {t("tickets.shop")} <ExternalLinkIcon />
          </Button>
        )}
        {canManage && shopTypes.length > 0 && (
          <Button render={<Link href={withParams(sp, { new: "type", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
            <PlusIcon /> {t("tickets.newType")}
          </Button>
        )}
      </div>
      <Notice error={sheet ? undefined : param(sp, "error")} ok={param(sp, "ok")} />
      {ev.status !== "published" && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t("tickets.notPublished")}</p>}

      <div className="grid gap-6">
        <Section id="types" title={t("tickets.types")}>
          {shopTypes.length ? (
            <DataTable
              rows={shopTypes}
              rowKey={(ty) => ty.id}
              rowHref={canManage ? (ty) => withParams(sp, { edit: ty.id, new: undefined }) : undefined}
              empty={t("tickets.noTypes")}
              columns={[
                {
                  header: t("tickets.typeName"),
                  cell: (ty) => (
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {ty.name}
                        {!ty.active && <Badge variant="secondary">{t("tickets.inactive")}</Badge>}
                        {ty.hidden && <Badge variant="outline">{t("tickets.hiddenBadge")}</Badge>}
                      </span>
                      {typeTiers(ty.id).length > 0 && <span className="text-xs text-muted-foreground">{typeTiers(ty.id).map((r) => r.name).join(" → ")}</span>}
                    </span>
                  ),
                },
                { header: t("tickets.price"), cell: (ty) => (ty.price === 0 ? t("shop.free") : t.money(ty.price, ty.currency)), className: "text-right tabular-nums" },
                {
                  header: t("tickets.sold"),
                  cell: (ty) => (
                    <span className="grid tabular-nums">
                      <span>{`${sold(ty.id)}${ty.quota ? ` / ${ty.quota}` : ""}`}</span>
                      <span className="text-xs text-muted-foreground">{left.get(ty.id) == null ? t("tickets.unlimited") : t("tickets.leftCount", { count: left.get(ty.id)! })}</span>
                    </span>
                  ),
                  className: "text-right",
                },
                {
                  header: t("tickets.window"),
                  cell: (ty) =>
                    ty.sales_start || ty.sales_end ? (
                      <span className="text-xs text-muted-foreground">
                        {ty.sales_start ? t.date(ty.sales_start, { dateStyle: "short", timeStyle: "short" }) : "…"} – {ty.sales_end ? t.date(ty.sales_end, { dateStyle: "short", timeStyle: "short" }) : "…"}
                      </span>
                    ) : null,
                },
              ]}
            />
          ) : (
            <EmptyState
              area="events"
              title={t("tickets.noTypesTitle")}
              text={t("tickets.noTypes")}
              action={
                canManage && (
                  <Button render={<Link href={withParams(sp, { new: "type", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("tickets.newType")}
                  </Button>
                )
              }
            />
          )}
        </Section>

        <Section id="codes" title={t("tickets.codes")} description={codes?.length ? undefined : t("tickets.noCodes")}>
          {!!codes?.length && (
            <DataTable
              rows={codes}
              rowKey={(c) => c.id}
              rowHref={canManage ? (c) => withParams(sp, { edit: c.id, new: undefined }) : undefined}
              empty={t("tickets.noCodes")}
              columns={[
                {
                  header: t("tickets.code"),
                  cell: (c) => (
                    <span className="grid gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-mono font-medium">
                        {c.code} {!c.active && <Badge variant="secondary">{t("tickets.inactive")}</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.kind === "percent" ? `−${c.value} %` : c.kind === "amount" ? `−${t.money(c.value, "eur")}` : t("tickets.unlockOnly")} ·{" "}
                        {c.type_ids.length ? shopTypes.filter((ty) => c.type_ids.includes(ty.id)).map((ty) => ty.name).join(", ") : t("tickets.allVisibleTypes")}
                      </span>
                    </span>
                  ),
                },
                { header: t("tickets.uses"), cell: (c) => `${used("code_id", c.id)}${c.max_uses ? ` / ${c.max_uses}` : ""}`, className: "text-right tabular-nums" },
                { header: t("tickets.link"), cell: (c) => <CopyButton value={codeUrl(c)} label={t("tickets.copyLink")} /> },
              ]}
            />
          )}
          {canManage && <AddLink href={withParams(sp, { new: "code", edit: undefined })}>{t("tickets.newCode")}</AddLink>}
        </Section>

        <Section id="sold" title={t("tickets.soldTickets")}>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox q={q} label={t("tickets.search")} />
            <div className="max-w-full overflow-x-auto md:ml-auto">
              <Segments
                label={t("tickets.status")}
                className="flex-nowrap [&>a]:shrink-0 [&>a]:whitespace-nowrap"
                items={[undefined, ...STATUSES].map((s) => ({ href: withParams(sp, { status: s, page: undefined }), label: s ? t.dynamic(`tickets.statuses.${s}`) : t("tickets.allSold"), current: s === status }))}
              />
            </div>
          </div>
          <DataTable
            rows={rows}
            rowKey={(k) => k.id}
            empty={q || status ? t("tickets.noMatch") : t("tickets.noTickets")}
            rowHref={ctx.can("payments.view") && ctx.modules.has("payments") ? (k) => `/payments?edit=${k.order_id}` : undefined}
            columns={[
              {
                header: t("tickets.holder"),
                cell: (k) => (
                  <span className="grid min-w-0">
                    <span className="font-medium">{k.holder_name ?? k.pay_orders?.customer_name ?? "–"}</span>
                    {k.pay_orders?.customer_email && <span className="truncate text-xs text-muted-foreground">{k.pay_orders.customer_email}</span>}
                  </span>
                ),
              },
              { header: t("tickets.typeName"), cell: (k) => k.ticket_types?.name },
              { header: t("tickets.code"), cell: (k) => <span className="font-mono text-xs">{k.code}</span> },
              {
                header: t("tickets.status"),
                cell: (k) => <Badge variant={k.status === "valid" ? "default" : k.status === "used" ? "secondary" : "outline"}>{t.dynamic(`tickets.statuses.${k.status}`)}</Badge>,
              },
            ]}
          />
          <Pager sp={sp} page={page} hasNext={(tickets?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
        </Section>

        <Waitlist t={t} ctx={ctx} eventId={eventId} canManage={canManage} />
      </div>

      {(creating || editing) && (
        <UrlSheet
          params={["new", "edit"]}
          title={editing ? editing.name : t("tickets.newType")}
          meta={editing && t("tickets.typeMeta", { sold: sold(editing.id) })}
          menu={
            editing && (
              <ActionsMenu>
                <MenuSubmit form="delete-type" icon={<Trash2Icon />} destructive confirm="tickets.confirmDeleteType">
                  {t("tickets.deleteType")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} />
          <TypeForm t={t} eventId={ev.id} ty={editing} tiers={editing ? typeTiers(editing.id).map((r) => ({ id: r.id, name: r.name, price: priceInput(r.price), quota: r.quota ? String(r.quota) : "", sales_end: r.sales_end ? toLocalInput(r.sales_end) : "", sold: used("tier_id", r.id) })) : []} />
          {editing && (
            <form id="delete-type" action={deleteTicketType} hidden>
              <input type="hidden" name="event" value={ev.id} />
              <input type="hidden" name="id" value={editing.id} />
            </form>
          )}
          {editing?.hidden && (
            // Hidden types are only sold through codes that name them.
            <section className="grid gap-2 border-t pt-4">
              <h3 className="text-sm font-medium">{t("tickets.unlockedBy")}</h3>
              {codes
                ?.filter((c) => c.type_ids.includes(editing.id))
                .map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2">
                    <Link href={withParams(sp, { edit: c.id })} scroll={false} className="font-mono text-sm link">
                      {c.code}
                    </Link>
                    {!c.active && <Badge variant="outline">{t("tickets.inactive")}</Badge>}
                    <CopyButton value={codeUrl(c)} label={t("tickets.copyLink")} />
                  </div>
                ))}
              {!codes?.some((c) => c.type_ids.includes(editing.id)) && <p className="text-sm text-destructive">{t("tickets.noUnlockCode")}</p>}
              <AddLink href={withParams(sp, { edit: undefined, new: "code" })}>{t("tickets.newCode")}</AddLink>
            </section>
          )}
        </UrlSheet>
      )}
      {(creatingCode || editingCode) && (
        <UrlSheet
          params={["new", "edit"]}
          title={editingCode ? editingCode.code : t("tickets.newCode")}
          meta={
            editingCode && (
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{codeUrl(editingCode)}</span>
                <CopyButton value={codeUrl(editingCode)} label={t("tickets.copyLink")} />
              </span>
            )
          }
          menu={
            editingCode && (
              <ActionsMenu>
                <MenuSubmit form="delete-code" icon={<Trash2Icon />} destructive confirm="tickets.confirmDeleteCode">
                  {t("tickets.deleteCode")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} />
          <CodeForm t={t} eventId={ev.id} c={editingCode} types={shopTypes} />
          {editingCode && (
            <form id="delete-code" action={deleteCode} hidden>
              <input type="hidden" name="event" value={ev.id} />
              <input type="hidden" name="id" value={editingCode.id} />
            </form>
          )}
        </UrlSheet>
      )}
      {settings && (
        <UrlSheet params={["edit"]} title={t("tickets.settings")}>
          <Notice error={param(sp, "error")} />
          <form action={saveTicketSettings} className="grid gap-6">
            <input type="hidden" name="event" value={ev.id} />
            <RowGroup id="shop-settings" title={t("tickets.shopSettings")}>
              <SettingRow label={t("tickets.names")} htmlFor="t-names">
                <Choice id="t-names" name="ticket_names" label={t("tickets.names")} required defaultValue={ev.ticket_names} options={(["off", "optional", "required"] as const).map((n) => ({ value: n, label: t.dynamic(`tickets.namesMode.${n}`) }))} />
              </SettingRow>
              <SettingRow label={t("tickets.maxPerOrder")} htmlFor="t-max">
                <TypedInput kind="number" id="t-max" name="max_tickets_per_order" min={1} max={100} step={1} required defaultValue={ev.max_tickets_per_order} />
              </SettingRow>
              <SettingRow label={t("tickets.showCodeField")} hint={t("tickets.showCodeFieldHint")} htmlFor="t-code-field">
                <input id="t-code-field" type="checkbox" name="show_code_field" defaultChecked={ev.show_code_field} className="size-5 accent-primary" />
              </SettingRow>
            </RowGroup>
            <DoorFields eventId={ev.id} />
            <SaveBar />
          </form>
        </UrlSheet>
      )}
    </>
  )
}

function CodeForm({ t, eventId, c, types }: { t: T; eventId: string; c?: Code; types: TicketType[] }) {
  return (
    <form action={saveCode} className="grid gap-4">
      <input type="hidden" name="event" value={eventId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-2">
        <Label htmlFor="c-code">{t("tickets.code")}</Label>
        <Input id="c-code" name="code" defaultValue={c?.code} required maxLength={40} placeholder="CREW-2026" autoCapitalize="characters" className="font-mono uppercase" />
      </div>
      <CodeKindFields kind={c?.kind ?? "percent"} value={c ? (c.kind === "amount" ? priceInput(c.value) : String(c.value)) : ""} maxUses={c?.max_uses ?? null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="c-from">{t("tickets.validFrom")}</Label>
          <DateInput id="c-from" name="valid_from" type="datetime-local" defaultValue={c?.valid_from ? toLocalInput(c.valid_from) : undefined} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-until">{t("tickets.validUntil")}</Label>
          <DateInput id="c-until" name="valid_until" type="datetime-local" defaultValue={c?.valid_until ? toLocalInput(c.valid_until) : undefined} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("tickets.codeTypes")}</legend>
        {types.map((ty) => (
          <label key={ty.id} className="flex min-h-8 items-center gap-2 text-sm">
            <input type="checkbox" name="type_ids" value={ty.id} defaultChecked={c?.type_ids.includes(ty.id)} className="size-4 accent-primary" />
            {ty.name} {ty.hidden && <Badge variant="outline">{t("tickets.hiddenBadge")}</Badge>}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t("tickets.codeTypesHint")}</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={c?.active ?? true} className="size-4 accent-primary" />
        {t("tickets.codeActive")}
      </label>
      <SaveBar label={c ? undefined : t("tickets.createCode")} always={!c} />
    </form>
  )
}

function TypeForm({ t, eventId, ty, tiers }: { t: T; eventId: string; ty?: TicketType; tiers: React.ComponentProps<typeof TierRows>["initial"] }) {
  return (
    <form action={saveTicketType} className="grid gap-4">
      <input type="hidden" name="event" value={eventId} />
      {ty && <input type="hidden" name="id" value={ty.id} />}
      <div className="grid gap-2">
        <Label htmlFor="ty-name">{t("tickets.typeName")}</Label>
        <Input id="ty-name" name="name" defaultValue={ty?.name} required maxLength={100} placeholder={t("tickets.typeNamePlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ty-price">{t("tickets.priceEur")}</Label>
          <TypedInput kind="money" id="ty-price" name="price" defaultValue={ty ? priceInput(ty.price) : ""} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ty-quota">{t("tickets.quota")}</Label>
          <TypedInput kind="number" id="ty-quota" name="quota" min={1} step={1} defaultValue={ty?.quota ?? ""} placeholder="∞" />
        </div>
      </div>
      {ty && (
        <label className="flex items-start gap-2 text-sm">
          <input type="hidden" name="active_field" value="1" />
          <input type="checkbox" name="active" value="1" defaultChecked={ty.active} className="mt-0.5 size-4 accent-primary" />
          <span>
            {t("tickets.onSale")}
            <span className="block text-xs text-muted-foreground">{t("tickets.pauseHint")}</span>
          </span>
        </label>
      )}
      {/* Rarely needed: sale window, description, hidden, price tiers (progressive disclosure). */}
      <details className="group grid gap-4" open={!!(ty?.sales_start || ty?.sales_end || ty?.description || ty?.hidden || tiers.length)}>
        <summary className="min-h-8 cursor-pointer text-sm text-[var(--link)] select-none">{t("tickets.moreOptions")}</summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ty-start">{t("tickets.salesStart")}</Label>
              <DateInput id="ty-start" name="sales_start" type="datetime-local" defaultValue={ty?.sales_start ? toLocalInput(ty.sales_start) : undefined} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ty-end">{t("tickets.salesEnd")}</Label>
              <DateInput id="ty-end" name="sales_end" type="datetime-local" defaultValue={ty?.sales_end ? toLocalInput(ty.sales_end) : undefined} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ty-desc">{t("tickets.typeDescription")}</Label>
            <Input id="ty-desc" name="description" defaultValue={ty?.description ?? ""} maxLength={1000} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="hidden" value="1" defaultChecked={ty?.hidden} className="mt-0.5 size-4 accent-primary" />
            <span>
              {t("tickets.hiddenLabel")}
              <span className="block text-xs text-muted-foreground">{t("tickets.hiddenHint")}</span>
            </span>
          </label>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{t("tickets.tiers")}</h3>
            <p className="text-xs text-muted-foreground">{t("tickets.tiersHint")}</p>
            <TierRows initial={tiers} />
          </div>
        </div>
      </details>
      <SaveBar label={ty ? undefined : t("tickets.createType")} always={!ty} />
    </form>
  )
}

export const instant = false

// Waiting list (people who signed up while the event was full), in order. Offers go out automatically (minute worker).
async function Waitlist({ t, ctx, eventId, canManage }: { t: T; ctx: Awaited<ReturnType<typeof requirePerm>>; eventId: string; canManage: boolean }) {
  const { data: rows } = await ctx.supabase
    .from("event_waitlist")
    .select("id, name, email, quantity, status, offered_until, created_at")
    .eq("event_id", eventId)
    .eq("org_id", ctx.org.id)
    .in("status", ["waiting", "offered", "claimed", "expired"])
    .order("created_at")
    .limit(500)
  if (!rows?.length) return null
  return (
    <Section id="waitlist" title={t("waitlist.admin")} description={t("waitlist.hint")}>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={t("waitlist.empty")}
        columns={[
          {
            header: t("waitlist.person"),
            cell: (r) => (
              <span className="grid min-w-0">
                <span className="font-medium">{r.name}</span>
                <a href={`mailto:${r.email}`} className="truncate text-xs text-muted-foreground underline-offset-4 hover:underline">
                  {r.email}
                </a>
              </span>
            ),
          },
          { header: t("waitlist.seats"), cell: (r) => r.quantity, className: "text-right tabular-nums" },
          {
            header: t("tickets.status"),
            cell: (r) => (
              <span className="grid gap-0.5">
                <Badge variant={r.status === "offered" ? "default" : "outline"}>{t.dynamic(`waitlist.statuses.${r.status}`)}</Badge>
                {r.status === "offered" && r.offered_until && (
                  <span className="text-xs text-muted-foreground">{t("waitlist.offeredUntil", { date: t.date(r.offered_until, { dateStyle: "short", timeStyle: "short" }) })}</span>
                )}
              </span>
            ),
          },
          { header: t("waitlist.since"), cell: (r) => t.date(r.created_at, { dateStyle: "short", timeStyle: "short" }), className: "whitespace-nowrap" },
          {
            header: "",
            cell: (r) =>
              canManage && (r.status === "waiting" || r.status === "offered") ? (
                <form action={removeFromWaitlist}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="event" value={eventId} />
                  <SubmitButton size="sm" variant="ghost" data-confirm="waitlist.confirmRemove">
                    {t("waitlist.remove")}
                  </SubmitButton>
                </form>
              ) : null,
          },
        ]}
      />
    </Section>
  )
}

// Abendkasse fields inside the settings form: which payment methods the door offers, which card terminal, which
// cash book account. (The door itself is Einlass → Verkauf; its gear links here.)
async function DoorFields({ eventId }: { eventId: string }) {
  const ctx = await getContext()
  const t = await getT()
  const cashbook = ctx.modules.has("cashbook")
  const [{ data: ev }, can, readers, { data: accounts }] = await Promise.all([
    ctx.supabase.from("events").select("door").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    posMethods(ctx.org.id),
    posReaders(ctx.org.id).catch(() => null),
    cashbook ? ctx.supabase.from("cash_accounts").select("id, name").eq("org_id", ctx.org.id).eq("kind", "cash").eq("active", true).order("name") : Promise.resolve({ data: [] }),
  ])
  const d = readDoor(ev?.door)
  return (
    <RowGroup id="door" title={t("door.settings.title")} description={t("door.settings.description")}>
      <input type="hidden" name="door_present" value="1" />
      {DOOR_METHODS.map((m) => (
        <SettingRow key={m} label={t.dynamic(`door.sale.method.${m}`)} hint={can[m] ? undefined : t.dynamic(`door.settings.unavailable.${m}`)} htmlFor={`door-${m}`}>
          <input id={`door-${m}`} type="checkbox" name="methods" value={m} defaultChecked={d.methods.includes(m)} disabled={!can[m]} className="size-5 accent-primary" />
        </SettingRow>
      ))}
      {can.terminal && (
        <SettingRow label={t("door.settings.reader")} htmlFor="door-reader">
          {readers === null ? (
            <p className="text-sm text-destructive">{t("door.settings.readersFailed")}</p>
          ) : readers.length ? (
            <Choice id="door-reader" name="reader_id" label={t("door.settings.reader")} defaultValue={d.reader_id} options={readers.map((r) => ({ value: r.id, label: `${r.name}${r.model ? ` (${r.model})` : ""}` }))} />
          ) : (
            <Link href="/settings/integrations" className="text-sm text-[var(--link)] hover:underline">
              {t("door.settings.pairFirst")} {t("door.settings.toIntegrations")}
            </Link>
          )}
        </SettingRow>
      )}
      {cashbook && (
        <SettingRow label={t("door.settings.cashAccount")} hint={t("door.settings.cashAccountHint")} htmlFor="door-account">
          {accounts?.length ? (
            <Choice id="door-account" name="cash_account_id" label={t("door.settings.cashAccount")} defaultValue={d.cash_account_id} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          ) : (
            <span className="text-sm text-muted-foreground">{t("door.settings.noCashAccounts")}</span>
          )}
        </SettingRow>
      )}
    </RowGroup>
  )
}
