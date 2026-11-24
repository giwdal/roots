import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ChevronRightIcon, FileTextIcon, FolderKanbanIcon, KeyRoundIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { customInlineItems } from "@/components/custom-field-inline"
import { customDetails } from "@/components/custom-field-details"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { InlineField } from "@/components/inline-field"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { AddLink, Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { formatMoney } from "@/lib/inputs"
import { param, withParams } from "@/lib/url"
import { FAMILIES, KINDS, UNITS, longTerm, notOver, rentalState, wordFor, type Family } from "@/rentals/fields"
import { OBJECT_COLS, RENTAL_COLS } from "@/rentals/server"
import { addChildrenAction, deleteRateAction, handOutAction, patchRentalObject, returnAction, saveParentAction, saveRateAction, searchObjects, trashObjectAction } from "../actions"
import { ObjectBadge, StateBadge } from "../badges"
import { KindSelect, kindLabel, peopleLine, period } from "../parts"

const UUID = /^[0-9a-f-]{36}$/

// One object (patterns.md §8): identity (name, kind, Frei/Vergeben), Stats (now, next, rent, parts), main column =
// its rentals, what belongs to it (keys with who holds them: Ausgeben / Zurücknehmen), rates; right rail =
// Eigenschaften edited in place (patchRentalObject), Verknüpft, Dateien. Sheets: ?new=handout(&item=<part>),
// ?new=children, ?new=rate, ?edit=<rate id>, ?edit=parent.
export default async function ObjectPage({ params, searchParams }: PageProps<"/rentals/[id]">) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const sp = await searchParams
  const here = `/rentals/${id}`
  // Old sheet links: ?handout=<id>, ?several=1, ?rate=new|<id>.
  const old = param(sp, "handout") ?? (param(sp, "several") ? "children" : null) ?? param(sp, "rate")
  if (old) {
    const h = param(sp, "handout")
    const rate = param(sp, "rate")
    redirect(`${here}${withParams(sp, { handout: undefined, several: undefined, rate: undefined, ...(h ? { new: "handout", item: h === id ? undefined : h } : rate ? (rate === "new" ? { new: "rate" } : { edit: rate }) : { new: "children" }) })}`)
  }
  const canManage = ctx.can("rentals.manage")
  const seesProjects = ctx.modules.has("projects") && ctx.can("projects.view")
  const [{ data: o }, { data: children }, { data: rates }, { data: rentals }, { data: locations }, defs, { data: projects }] = await Promise.all([
    ctx.supabase.from("rental_objects").select(`${OBJECT_COLS}, parent:parent_id(id, name, kind)`).eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("rental_objects").select("id, name, kind, family, status, lendable, rentable, included, deposit_cents").eq("parent_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).order("position").order("name").limit(500),
    ctx.supabase.from("rental_rates").select("*").eq("object_id", id).eq("org_id", ctx.org.id).order("position"),
    ctx.supabase.from("rentals").select(RENTAL_COLS).eq("object_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).order("starts_at", { ascending: false }).limit(200),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "rental_objects"),
    seesProjects ? ctx.supabase.from("project_links").select("projects(id, name)").eq("org_id", ctx.org.id).eq("entity", "rental_objects").eq("entity_id", id) : Promise.resolve({ data: [] }),
  ])
  if (!o || o.deleted_at) notFound()
  const parts = children ?? []
  const parent = o.parent as { id: string; name: string; kind: string } | null
  const now = new Date().toISOString()
  // Who has each part right now (keys, devices); the contracts of the current rentals, shown with each.
  const [{ data: partRentals }, { data: docs }] = await Promise.all([
    parts.length
      ? ctx.supabase.from("rentals").select(RENTAL_COLS).in("object_id", parts.map((c) => c.id)).eq("org_id", ctx.org.id).is("deleted_at", null).eq("status", "confirmed").lte("starts_at", now).or(notOver(now))
      : Promise.resolve({ data: [] }),
    ctx.can("org.files.view") && rentals?.length
      ? ctx.supabase.from("files").select("id, name, entity_id").eq("org_id", ctx.org.id).eq("entity", "rentals").in("entity_id", rentals.map((r) => r.id)).is("deleted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; entity_id: string | null }[] }),
  ])
  const holder = (partId: string) => (partRentals ?? []).find((r) => r.object_id === partId)
  const current = (rentals ?? []).filter((r) => ["running", "upcoming", "request"].includes(rentalState(r)))
  const earlier = (rentals ?? []).filter((r) => !current.includes(r))
  const running = current.find((r) => rentalState(r) === "running")
  const next = [...current].filter((r) => rentalState(r) !== "running").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const family = o.family as Family
  const firstRate = (rates ?? []).find((r) => r.active)
  const word = wordFor(family, firstRate?.unit)
  const day = (v: string) => t.date(v, { dateStyle: "medium" })
  const usable = o.status === "active" && !o.included
  const partKind = family === "place" ? "key" : (KINDS[family][0] ?? "key")
  const out = parts.filter((p) => holder(p.id)).length

  // Sheets
  const newParam = param(sp, "new")
  const editParam = param(sp, "edit")
  const handout = newParam === "handout" ? (param(sp, "item") ? parts.find((p) => p.id === param(sp, "item")) : o) : undefined
  const rate = editParam && UUID.test(editParam) ? (rates ?? []).find((r) => r.id === editParam) : undefined
  const rateSheet = canManage && o.rentable && (newParam === "rate" || !!rate)
  const sheetOpen = !!handout || newParam === "children" || rateSheet || editParam === "parent"

  // Eigenschaften: every value edited where it is shown (rentals.manage); patchRentalObject checks it like the form.
  const prop = (field: string, label: string, value: string | null, opts: { kind?: React.ComponentProps<typeof InlineField>["kind"]; display?: React.ReactNode; options?: { value: string; label: string }[] } = {}) => ({
    label,
    value: canManage ? <InlineField action={patchRentalObject} id={o.id} field={field} value={value} label={label} {...opts} /> : (opts.display ?? value),
  })
  const yesNo = [
    { value: "true", label: t("common.yes") },
    { value: "false", label: t("common.no") },
  ]
  const bool = (field: "rentable" | "lendable" | "included", label: string) => prop(field, label, String(o[field]), { kind: "choice", options: yesNo, display: o[field] ? t("common.yes") : t("common.no") })
  const kindOptions = [...FAMILIES.flatMap((f) => KINDS[f]), "other"].map((k) => ({ value: k, label: kindLabel(t, k) }))
  if (!kindOptions.some((k) => k.value === o.kind)) kindOptions.push({ value: o.kind, label: o.kind })
  const location = (locations ?? []).find((l) => l.id === o.location_id)

  const properties = (
    <Section id="properties" title={t("rentals.properties")}>
      <DetailList
        phoneLimit={4}
        items={[
          prop("name", t("rentals.name"), o.name),
          prop("kind", t("rentals.kind"), o.kind, { kind: "choice", options: kindOptions, display: kindLabel(t, o.kind) }),
          {
            label: t("rentals.parent"),
            value: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                {parent ? (
                  <Link href={`/rentals/${parent.id}`} className="link">
                    {parent.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t("rentals.topLevel")}</span>
                )}
                {canManage && (
                  <Link href={withParams(sp, { edit: "parent", new: undefined })} scroll={false} className="text-xs link">
                    {t("rentals.change")}
                  </Link>
                )}
              </span>
            ),
          },
          (locations ?? []).length > 0 && prop("location_id", t("rentals.location"), o.location_id, { kind: "choice", options: (locations ?? []).map((l) => ({ value: l.id, label: l.name })), display: location?.name }),
          prop("status", t("rentals.status"), o.status, { kind: "choice", options: (["active", "inactive", "lost"] as const).map((x) => ({ value: x, label: t(`rentals.statuses.${x}`) })), display: t.dynamic(`rentals.statuses.${o.status}`) }),
          bool("rentable", t("rentals.rentableShort")),
          bool("lendable", t("rentals.lendableShort")),
          !!parent && bool("included", t("rentals.includedLabel")),
          prop("capacity", t("rentals.capacity"), String(o.capacity), { kind: "number" }),
          prop("deposit", t("rentals.deposit"), o.deposit_cents != null ? formatMoney(o.deposit_cents) : null, { kind: "money", display: o.deposit_cents != null && t.money(o.deposit_cents) }),
          prop("description", t("rentals.description"), o.description || null, { kind: "textarea", display: o.description && <span className="whitespace-pre-line">{o.description}</span> }),
          ...(canManage ? customInlineItems(t, defs, o.custom, patchRentalObject, o.id) : customDetails(t, defs, o.custom)),
        ]}
      />
    </Section>
  )

  const linked: LinkRow[] = [
    ...(parent ? [{ key: "parent", icon: KeyRoundIcon, href: `/rentals/${parent.id}`, title: parent.name, detail: kindLabel(t, parent.kind) }] : []),
    ...(projects ?? []).flatMap((l) => (l.projects ? [{ key: l.projects.id, icon: FolderKanbanIcon, href: `/projects/${l.projects.id}`, title: l.projects.name, detail: t("projects.project") }] : [])),
  ]

  const contractFiles = (rentalId: string) => (docs ?? []).filter((d) => d.entity_id === rentalId)
  const rentalRow = (r: NonNullable<typeof rentals>[number]) => (
    <li key={r.id} className="grid gap-2 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-3">
        <Link href={`/rentals/r/${r.id}`} className="grid min-w-0 flex-1 hover:underline">
          <span className="truncate font-medium">{peopleLine(r.rental_contacts, 3) || t("rentals.nobody")}</span>
          <span className="truncate text-xs text-muted-foreground">
            {period(t, r)}
            {r.price_cents != null && r.unit && ` · ${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}`}
          </span>
        </Link>
        <StateBadge t={t} r={r} />
        {canManage && o.lendable && !o.rentable && rentalState(r) === "running" && returnButton(r.id)}
      </div>
      {contractFiles(r.id).length > 0 && (
        <ul className="grid gap-1">
          {contractFiles(r.id).map((d) => (
            <li key={d.id} className="min-w-0">
              <a href={`/files/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-xs link">
                <FileTextIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{d.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
  function returnButton(rentalId: string) {
    return (
      <form action={returnAction}>
        <input type="hidden" name="id" value={rentalId} />
        <input type="hidden" name="back" value={here} />
        <SubmitButton size="sm" variant="outline" data-confirm="rentals.confirmReturn">
          {t("rentals.takeBack")}
        </SubmitButton>
      </form>
    )
  }

  const runningPrice = running?.price_cents != null && running.unit ? running : null
  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/rentals", label: t("rentals.objects") }, ...(parent ? [{ href: `/rentals/${parent.id}`, label: parent.name }] : []), { label: o.name }]}
        title={o.name}
        badge={
          <>
            <Badge variant="outline">{kindLabel(t, o.kind)}</Badge>
            {o.included ? <Badge variant="secondary">{t("rentals.includedShort")}</Badge> : (o.rentable || o.lendable || o.status !== "active") && <ObjectBadge t={t} status={o.status} busy={!!running} />}
          </>
        }
        meta={[parent?.name, location?.name].filter(Boolean).join(" · ") || undefined}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuSubmit form="trash-object" icon={<Trash2Icon />} destructive>
                {t("rentals.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={
          canManage && usable
            ? o.rentable
              ? { href: `/rentals/r/new?object=${id}`, label: t.dynamic(`rentals.newWord.${word}`) }
              : o.lendable && !running
                ? { href: withParams(sp, { new: "handout", item: undefined, edit: undefined }), label: t("rentals.handOut") }
                : undefined
            : undefined
        }
      />
      {canManage && (
        <form id="trash-object" action={trashObjectAction} hidden>
          <input type="hidden" name="id" value={id} />
        </form>
      )}
      <Notice error={!sheetOpen ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      {(o.rentable || o.lendable || parts.length > 0) && (
        <Stats>
          {(o.rentable || o.lendable) && (
            <Stat
              label={t("rentals.nowStat")}
              value={running ? peopleLine(running.rental_contacts, 1) || "–" : o.status === "active" ? t("rentals.free") : t.dynamic(`rentals.statuses.${o.status}`)}
              hint={running ? (running.ends_at ? t("rentals.until", { date: day(running.ends_at) }) : t("rentals.since", { date: day(running.starts_at) })) : undefined}
              href={running ? `/rentals/r/${running.id}` : undefined}
            />
          )}
          {(o.rentable || o.lendable) && <Stat label={t("rentals.nextStat")} value={next ? day(next.starts_at) : "–"} hint={next ? peopleLine(next.rental_contacts, 1) || undefined : undefined} href={next ? `/rentals/r/${next.id}` : undefined} />}
          {o.rentable && (
            <Stat
              label={t("rentals.rentStat")}
              value={runningPrice ? t.money(runningPrice.price_cents!) : firstRate ? t.money(firstRate.price_cents) : "–"}
              hint={runningPrice ? t.dynamic(`rentals.units.${runningPrice.unit}`) : firstRate ? `${t("rentals.rate")} · ${t.dynamic(`rentals.units.${firstRate.unit}`)}` : undefined}
            />
          )}
          {parts.length > 0 && <Stat label={t("rentals.children")} value={parts.length} hint={out ? t("rentals.outCount", { count: out }) : undefined} />}
        </Stats>
      )}

      {/* patterns.md §8: desktop = main column + right rail; tablets and phones = Eigenschaften → main → Verknüpft → Dateien. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-1">{properties}</aside>
        <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {(o.rentable || o.lendable || !!rentals?.length) && (
            <Section id="rentals" title={t("rentals.tabs.rentals")} action={rentals?.length ? <Link href={`/rentals/list?object=${id}&view=all`} className="text-sm link">{t("common.showAll")}</Link> : undefined}>
              {current.length ? <ul className="grid divide-y rounded-lg border">{current.map(rentalRow)}</ul> : <p className="text-sm text-muted-foreground">{t("rentals.noRentals")}</p>}
              {earlier.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {t("rentals.history")} ({earlier.length})
                  </summary>
                  <ul className="mt-2 grid divide-y rounded-lg border">{earlier.map(rentalRow)}</ul>
                </details>
              )}
            </Section>
          )}

          <Section id="children" title={t("rentals.children")} description={!parts.length ? t("rentals.noChildren") : undefined}>
            {parts.length > 0 && (
              <ul className="grid divide-y rounded-lg border">
                {parts.map((c) => {
                  const h = holder(c.id)
                  const canHandOut = canManage && c.lendable && c.status === "active" && !c.included
                  return (
                    <li key={c.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                      <Link href={`/rentals/${c.id}`} className="grid min-w-0 flex-1 hover:underline">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[kindLabel(t, c.kind), c.status === "lost" ? t("rentals.lostShort") : c.included ? t("rentals.includedShort") : h ? t("rentals.handedTo", { who: peopleLine(h.rental_contacts) || "–", date: day(h.starts_at) }) : c.lendable ? t("rentals.inOffice") : null].filter(Boolean).join(" · ")}
                        </span>
                      </Link>
                      {canHandOut && h && returnButton(h.id)}
                      {canHandOut && !h && (
                        <Link href={withParams(sp, { new: "handout", item: c.id, edit: undefined })} scroll={false} className="text-sm link">
                          {t("rentals.handOut")}
                        </Link>
                      )}
                      {!canHandOut && <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />}
                    </li>
                  )
                })}
              </ul>
            )}
            {canManage && <AddLink href={withParams(sp, { new: "children", edit: undefined, item: undefined })}>{t("rentals.addChildrenLink")}</AddLink>}
          </Section>

          {o.rentable && (
            <Section id="rates" title={t("rentals.rates")} description={t("rentals.ratesHint")}>
              {rates?.length ? (
                <ul className="grid divide-y rounded-lg border">
                  {rates.map((r) => {
                    const body = (
                      <>
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[
                              `${t.money(r.price_cents)} ${t.dynamic(`rentals.units.${r.unit}`)}`,
                              r.term_months && t("rentals.termShort", { months: r.term_months }),
                              r.renew_months && t("rentals.renewShort", { months: r.renew_months }),
                              r.notice_months != null && longTerm(r.unit) && t("rentals.noticeShort", { months: r.notice_months }),
                              r.deposit_cents != null && `${t("rentals.deposit")} ${t.money(r.deposit_cents)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {!r.active && <Badge variant="secondary">{t("rentals.statuses.inactive")}</Badge>}
                      </>
                    )
                    return (
                      <li key={r.id}>
                        {canManage ? (
                          <Link href={withParams(sp, { edit: r.id, new: undefined })} scroll={false} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-muted active:bg-muted">
                            {body}
                            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </Link>
                        ) : (
                          <div className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("rentals.noRates")}</p>
              )}
              {canManage && <AddLink href={withParams(sp, { new: "rate", edit: undefined })}>{t("rentals.newRate")}</AddLink>}
            </Section>
          )}
        </div>
        <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-2">
          {linked.length > 0 && (
            <Section id="linked" title={t("rentals.linked")}>
              <LinkRows rows={linked} />
            </Section>
          )}
          <FileList ctx={ctx} entity="rental_objects" entityId={id} back={here} />
        </aside>
      </div>

      {canManage && handout && (
        <UrlSheet params={["new", "item"]} title={`${handout.name} · ${t("rentals.handOut")}`} compact>
          <Notice error={param(sp, "error")} />
          <form action={handOutAction} className="grid gap-4">
            <input type="hidden" name="object_id" value={handout.id} />
            <input type="hidden" name="back" value={here} />
            {handout.id !== id && <input type="hidden" name="item" value="1" />}
            {handout.id !== id && running && <input type="hidden" name="parent_id" value={running.id} />}
            <ContactPicker name="contact_id" label={t("rentals.handOutTo")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="h-from">{t("rentals.starts")}</Label>
                <TypedInput kind="date" id="h-from" name="starts_at" defaultValue={now.slice(0, 10)} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="h-dep">{t("rentals.deposit")}</Label>
                <TypedInput kind="money" id="h-dep" name="deposit" defaultValue={handout.deposit_cents != null ? formatMoney(handout.deposit_cents) : ""} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="h-note">{t("rentals.noteOptional")}</Label>
              <Input id="h-note" name="note" maxLength={500} />
            </div>
            <SaveBar label={t("rentals.handOut")} always />
          </form>
        </UrlSheet>
      )}

      {canManage && newParam === "children" && (
        <UrlSheet params={["new"]} title={t("rentals.addChildrenTitle")} meta={o.name}>
          <Notice error={param(sp, "error")} />
          <form action={addChildrenAction} className="grid gap-4">
            <input type="hidden" name="parent_id" value={id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="s-count">{t("rentals.howMany")}</Label>
                <TypedInput kind="number" id="s-count" name="count" min={1} max={100} defaultValue={1} required />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="s-kind">{t("rentals.kind")}</Label>
                <KindSelect t={t} id="s-kind" defaultValue={partKind} kinds={["access", "item", "place"]} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-prefix">{t("rentals.prefix")}</Label>
              <Input id="s-prefix" name="prefix" maxLength={40} placeholder={kindLabel(t, partKind)} />
              <p className="text-xs text-muted-foreground">{t("rentals.prefixHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-dep">{t("rentals.deposit")}</Label>
              <TypedInput kind="money" id="s-dep" name="deposit" />
            </div>
            <Link href={`/rentals/new?parent=${id}`} className="w-fit text-sm link">
              {t("rentals.addOneFull")}
            </Link>
            <SaveBar label={t("rentals.addChildren")} always />
          </form>
        </UrlSheet>
      )}

      {canManage && editParam === "parent" && (
        <UrlSheet params={["edit"]} title={t("rentals.parent")} meta={o.name} compact>
          <Notice error={param(sp, "error")} />
          <form action={saveParentAction} className="grid gap-4">
            <input type="hidden" name="id" value={id} />
            <RecordPicker name="parent_id" label={t("rentals.parent")} search={searchObjects} initial={parent ? { id: parent.id, label: parent.name, detail: kindLabel(t, parent.kind) } : null} placeholder={t("rentals.noParentPick")} />
            <p className="text-xs text-muted-foreground">{t("rentals.parentHint")}</p>
            <SaveBar />
          </form>
        </UrlSheet>
      )}

      {rateSheet && (
        <UrlSheet
          params={["new", "edit"]}
          title={rate ? rate.name : t("rentals.newRate")}
          meta={o.name}
          menu={
            rate && (
              <ActionsMenu>
                <MenuSubmit form="delete-rate" icon={<Trash2Icon />} destructive confirm="rentals.confirmDeleteRate">
                  {t("rentals.deleteRate")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} />
          {rate && (
            <form id="delete-rate" action={deleteRateAction} hidden>
              <input type="hidden" name="id" value={rate.id} />
              <input type="hidden" name="object_id" value={id} />
            </form>
          )}
          <form action={saveRateAction} className="grid gap-4">
            <input type="hidden" name="object_id" value={id} />
            {rate && <input type="hidden" name="id" value={rate.id} />}
            <div className="grid max-w-xl gap-2">
              <Label htmlFor="r-name">{t("rentals.rateName")}</Label>
              <Input id="r-name" name="name" required maxLength={100} defaultValue={rate?.name ?? ""} placeholder={t("rentals.ratePlaceholder")} />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="r-price">{t("rentals.price")}</Label>
                <TypedInput kind="money" id="r-price" name="price" defaultValue={rate ? formatMoney(rate.price_cents) : ""} required />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="r-unit">{t("rentals.unit")}</Label>
                <Choice id="r-unit" name="unit" label={t("rentals.unit")} required defaultValue={rate?.unit ?? (family === "place" ? "month" : "day")} options={UNITS.map((u) => ({ value: u, label: t.dynamic(`rentals.units.${u}`) }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="r-dep">{t("rentals.deposit")}</Label>
                <TypedInput kind="money" id="r-dep" name="deposit" defaultValue={rate?.deposit_cents != null ? formatMoney(rate.deposit_cents) : ""} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="r-min">{t("rentals.minUnits")}</Label>
                <TypedInput kind="number" id="r-min" name="min_units" min={1} max={1000} defaultValue={rate?.min_units ?? 1} />
              </div>
            </div>
            <fieldset className="grid gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{t("rentals.longTermOnly")}</legend>
              <div className="flex flex-wrap gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor="r-term">{t("rentals.termMonths")}</Label>
                  <TypedInput kind="number" id="r-term" name="term_months" min={1} max={600} defaultValue={rate?.term_months ?? ""} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="r-renew">{t("rentals.renewMonths")}</Label>
                  <TypedInput kind="number" id="r-renew" name="renew_months" min={1} max={600} defaultValue={rate?.renew_months ?? ""} />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="r-notice">{t("rentals.noticeMonths")}</Label>
                  <TypedInput kind="number" id="r-notice" name="notice_months" min={0} max={60} defaultValue={rate?.notice_months ?? ""} />
                </div>
              </div>
            </fieldset>
            {rate && (
              <label className="flex items-center gap-2 text-sm">
                <input type="hidden" name="active" value="off" />
                <input type="checkbox" name="active" value="on" defaultChecked={rate.active} className="size-4 accent-primary" />
                {t("rentals.rateActive")}
              </label>
            )}
            <SaveBar label={rate ? undefined : t("rentals.newRate")} always={!rate} />
          </form>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
