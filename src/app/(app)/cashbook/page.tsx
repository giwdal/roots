import Link from "next/link"
import { notFound } from "next/navigation"
import { BanIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, PaperclipIcon, PencilIcon, PlusIcon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink } from "@/components/actions-menu"
import { Choice, Segment, SegmentGroup } from "@/components/choice"
import { DataTable, ListToolbar } from "@/components/data-table"
import { DateInput } from "@/components/date-input"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { Segments } from "@/components/segments"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { ACCOUNT_KINDS, SPHERES } from "@/cashbook/fields"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param, withParams, type SearchParams } from "@/lib/url"
import { priceInput } from "@/tickets/price"
import { bookCashEntry, closeCashMonth, reverseCashEntry, saveAccount, searchOpenInvoices } from "./actions"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
type Entry = Tables<"cash_entries">

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const UUID = /^[0-9a-f-]{36}$/

// Cash book: one account at a time, one month at a time (both in the URL). Entries are booked, never edited; a
// mistake is reversed. A finished month is closed with a cash count (sheet ?new=closing), then it takes no more
// entries. Booking, reversing and closing all ask first.
export default async function CashbookPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("cashbook.view")
  if (!ctx.modules.has("cashbook")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("cashbook.manage")
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  })
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month") ?? "") ? param(sp, "month")! : today.slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const first = `${month}-01`
  const last = iso(y, m, 0)
  const before = iso(y, m - 1, 0)
  const isNew = param(sp, "new")

  // With ?account= everything loads in one round; without it the default account has to be found first.
  const wanted = UUID.test(param(sp, "account") ?? "") ? param(sp, "account")! : null
  const accountsQuery = ctx.supabase.from("cash_accounts").select("*").eq("org_id", ctx.org.id).order("active", { ascending: false }).order("name")
  const initial = wanted ? null : (await accountsQuery).data
  const pick = (list: Tables<"cash_accounts">[] | null | undefined) => list?.find((a) => a.id === wanted) ?? list?.find((a) => a.active) ?? list?.[0]
  const preliminary = wanted ?? pick(initial)?.id ?? null
  const editId = param(sp, "edit")
  const [{ data: listed }, { data: entries }, { data: start }, { data: closing }, { data: cats }, { data: editing }] = await Promise.all([
    wanted ? accountsQuery : Promise.resolve({ data: initial }),
    preliminary
      ? ctx.supabase.from("cash_entries").select("*").eq("org_id", ctx.org.id).eq("account_id", preliminary).gte("booked_on", first).lte("booked_on", last).order("booked_on").order("number")
      : Promise.resolve({ data: [] as Entry[] }),
    preliminary
      ? ctx.supabase.rpc("cash_balances", {
          p_org: ctx.org.id,
          p_until: before,
        })
      : Promise.resolve({ data: [] }),
    preliminary ? ctx.supabase.from("cash_closings").select("*").eq("account_id", preliminary).eq("month", first).maybeSingle() : Promise.resolve({ data: null }),
    canManage && isNew === "entry"
      ? ctx.supabase.from("cash_entries").select("category").eq("org_id", ctx.org.id).not("category", "is", null).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [] }),
    editId && UUID.test(editId) ? ctx.supabase.from("cash_entries").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const accounts = listed ?? []
  const account = accounts.find((a) => a.id === preliminary) // an unknown ?account= shows the empty state
  const ids = (entries ?? []).map((e) => e.id)
  const [{ data: reversals }, { data: receipts }] = await Promise.all([
    ids.length ? ctx.supabase.from("cash_entries").select("reverses_id, number").in("reverses_id", ids) : Promise.resolve({ data: [] }),
    ids.length && ctx.can("org.files.view") ? ctx.supabase.from("files").select("entity_id").eq("entity", "cash_entries").in("entity_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ])
  const reversedBy = new Map((reversals ?? []).map((r) => [r.reverses_id!, r.number]))
  const receiptCount = (id: string) => (receipts ?? []).filter((r) => r.entity_id === id).length
  const opening = Number((start ?? []).find((b) => b.account_id === account?.id)?.balance_cents ?? account?.opening_cents ?? 0)
  const sum = (entries ?? []).reduce((s, e) => s + e.amount_cents, 0)
  const income = (entries ?? []).filter((e) => e.amount_cents > 0).reduce((s, e) => s + e.amount_cents, 0)
  const ended = last < today
  const canClose = canManage && !!account && ended && !closing
  const nav = (mm: number) => `/cashbook${withParams(sp, { month: iso(y, mm, 1).slice(0, 7), edit: undefined, new: undefined })}`
  const money = (c: number) => t.money(c)
  const monthName = t.date(first, { month: "long", year: "numeric" })

  return (
    <Page>
      <PageHeader
        area="finance"
        title={t("cashbook.title")}
        badge={
          account &&
          closing && (
            <Badge variant="success">
              <LockIcon /> {t("cashbook.monthClosed")}
            </Badge>
          )
        }
        actions={
          canClose && (
            <Button render={<Link href={`/cashbook${withParams(sp, { new: "closing", edit: undefined })}`} scroll={false} />} nativeButton={false} size="sm" variant="outline">
              <LockIcon /> {t("cashbook.closeMonth")}
            </Button>
          )
        }
        menu={
          (account || canManage) && (
            <ActionsMenu>
              {canManage && account && (
                <MenuLink href={`/cashbook${withParams(sp, { edit_account: account.id, edit: undefined, new: undefined })}`} icon={<PencilIcon />}>
                  {t("cashbook.editAccount")}
                </MenuLink>
              )}
              {canManage && (
                <MenuLink href={`/cashbook${withParams(sp, { new: "account", edit: undefined })}`} icon={<PlusIcon />}>
                  {t("cashbook.newAccount")}
                </MenuLink>
              )}
              {account && <MenuExport entity="cash_entries" query={{ account: account.id, month }} />}
            </ActionsMenu>
          )
        }
        primary={
          canManage && account && !closing
            ? {
                href: `/cashbook${withParams(sp, { new: "entry", edit: undefined })}`,
                label: t("cashbook.newEntry"),
              }
            : undefined
        }
      />
      <Notice error={isNew || editId || param(sp, "edit_account") ? undefined : param(sp, "error")} ok={param(sp, "ok")} />

      {!account ? (
        <EmptyState
          area="finance"
          title={t("cashbook.noAccountsTitle")}
          text={t("cashbook.noAccounts")}
          action={
            canManage && (
              <Button render={<Link href={`/cashbook${withParams(sp, { new: "account" })}`} />} nativeButton={false} size="sm" variant="outline">
                <PlusIcon /> {t("cashbook.newAccount")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <ListToolbar>
            <div className="flex items-center gap-1">
              <Button render={<Link href={nav(m - 2)} scroll={false} />} nativeButton={false} size="icon" variant="ghost" aria-label={t("cashbook.prevMonth")} title={t("cashbook.prevMonth")}>
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-32 text-center text-sm font-medium">{monthName}</span>
              <Button render={<Link href={nav(m)} scroll={false} />} nativeButton={false} size="icon" variant="ghost" aria-label={t("cashbook.nextMonth")} title={t("cashbook.nextMonth")}>
                <ChevronRightIcon />
              </Button>
            </div>
            {accounts.length > 1 && (
              <Segments
                label={t("cashbook.accounts")}
                className="md:ml-auto"
                items={accounts.map((a) => ({
                  href: `/cashbook?account=${a.id}&month=${month}`,
                  label: a.active ? a.name : `${a.name} · ${t("cashbook.inactive")}`,
                  current: a.id === account.id,
                }))}
              />
            )}
          </ListToolbar>

          <Stats>
            <Stat label={t("cashbook.openingBalance")} value={money(opening)} />
            <Stat label={t("cashbook.income")} value={money(income)} />
            <Stat label={t("cashbook.expenses")} value={money(income - sum)} />
            <Stat label={t("cashbook.closingBalance")} value={money(opening + sum)} tone={opening + sum < 0 ? "warn" : undefined} />
          </Stats>

          <DataTable
            rows={entries ?? []}
            rowKey={(e) => e.id}
            rowHref={(e) => `/cashbook${withParams(sp, { edit: e.id, new: undefined })}`}
            empty={t("cashbook.noEntries")}
            columns={[
              {
                header: t("cashbook.entry"),
                cell: (e) => (
                  <span className="grid max-w-md min-w-0">
                    <span className="truncate font-medium">{e.description}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {e.number} · {t.date(e.booked_on, { dateStyle: "medium" })}
                      {e.counterparty && ` · ${e.counterparty}`}
                    </span>
                  </span>
                ),
              },
              {
                header: t("cashbook.category"),
                cell: (e) => e.category ?? "–",
              },
              {
                header: t("cashbook.sphere"),
                cell: (e) => (e.sphere ? t.dynamic(`cashbook.spheres.${e.sphere}`) : "–"),
              },
              {
                header: t("cashbook.amount"),
                cell: (e) => (
                  <span className="flex flex-wrap items-center justify-end gap-2 tabular-nums">
                    {(reversedBy.has(e.id) || e.reverses_id) && <Badge variant="outline">{e.reverses_id ? t("cashbook.reversal") : t("cashbook.reversedShort")}</Badge>}
                    {receiptCount(e.id) > 0 && <PaperclipIcon className="size-3.5 text-muted-foreground" aria-label={t("cashbook.receipts")} />}
                    <span className={e.amount_cents < 0 ? "text-destructive" : ""}>{money(e.amount_cents)}</span>
                  </span>
                ),
                className: "text-right",
              },
            ]}
          />

          <Section id="closing" title={t("cashbook.closing")}>
            {closing ? (
              <p className="text-sm">
                {t("cashbook.closedInfo", {
                  balance: money(closing.balance_cents),
                  date: t.date(closing.created_at, { dateStyle: "medium" }),
                })}
                {closing.counted_cents != null && ` · ${t("cashbook.countedInfo", { counted: money(closing.counted_cents), diff: money(closing.counted_cents - closing.balance_cents) })}`}
                {closing.note && ` · ${closing.note}`}
              </p>
            ) : !ended ? (
              <p className="text-sm text-muted-foreground">{t("cashbook.closeLater")}</p>
            ) : canManage ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-3">
                <p className="text-sm">
                  {t("cashbook.closeDue", {
                    month: monthName,
                    balance: money(opening + sum),
                  })}
                </p>
                <Button render={<Link href={`/cashbook${withParams(sp, { new: "closing", edit: undefined })}`} scroll={false} />} nativeButton={false} size="sm">
                  <LockIcon /> {t("cashbook.closeMonth")}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("cashbook.notClosed")}</p>
            )}
          </Section>
        </>
      )}

      {canManage && account && !closing && isNew === "entry" && (
        <UrlSheet params={["new"]} title={t("cashbook.newEntry")} description={account.name}>
          <Notice error={param(sp, "error")} />
          <EntryForm
            t={t}
            accountId={account.id}
            today={today}
            categories={[...new Set((cats ?? []).map((c) => c.category!))].slice(0, 100)}
            invoices={ctx.modules.has("invoices") && ctx.can("invoices.view")}
          />
        </UrlSheet>
      )}
      {canClose && isNew === "closing" && (
        <UrlSheet params={["new"]} title={t("cashbook.closeTitle", { month: monthName })} description={account.name}>
          <Notice error={param(sp, "error")} />
          <form action={closeCashMonth} className="grid gap-4">
            <input type="hidden" name="account_id" value={account.id} />
            <input type="hidden" name="month" value={month} />
            <DetailList
              items={[
                {
                  label: t("cashbook.openingBalance"),
                  value: <span className="tabular-nums">{money(opening)}</span>,
                },
                {
                  label: t("cashbook.income"),
                  value: <span className="tabular-nums">{money(income)}</span>,
                },
                {
                  label: t("cashbook.expenses"),
                  value: <span className="tabular-nums">{money(income - sum)}</span>,
                },
                {
                  label: t("cashbook.closingBalance"),
                  value: <span className="font-medium tabular-nums">{money(opening + sum)}</span>,
                },
              ]}
            />
            {account.kind === "cash" && (
              <div className="grid gap-2">
                <Label htmlFor="c-counted">{t("cashbook.counted")}</Label>
                <TypedInput kind="money" id="c-counted" name="counted" />
                <p className="text-xs text-muted-foreground">{t("cashbook.countedHint")}</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="c-note">{t("cashbook.note")}</Label>
              <Input id="c-note" name="note" maxLength={1000} />
            </div>
            <SaveBar label={t("cashbook.closeMonth")} always confirm="cashbook.confirmClose" />
          </form>
        </UrlSheet>
      )}
      {canManage && (isNew === "account" || param(sp, "edit_account")) && (
        <UrlSheet params={["new", "edit_account"]} title={isNew === "account" ? t("cashbook.newAccount") : t("cashbook.editAccount")}>
          <Notice error={param(sp, "error")} />
          <AccountForm t={t} a={isNew === "account" ? undefined : accounts.find((a) => a.id === param(sp, "edit_account"))} today={today} />
        </UrlSheet>
      )}
      {editing && <EntrySheet t={t} ctx={ctx} e={editing} reversedBy={reversedBy.get(editing.id)} canManage={canManage} sp={sp} />}
    </Page>
  )
}

function EntryForm({ t, accountId, today, categories, invoices }: { t: T; accountId: string; today: string; categories: string[]; invoices: boolean }) {
  return (
    <form action={bookCashEntry} className="grid gap-4">
      <input type="hidden" name="account_id" value={accountId} />
      <SegmentGroup label={t("cashbook.direction")}>
        {(["out", "in"] as const).map((d) => (
          <Segment key={d} name="direction" value={d} label={t.dynamic(`cashbook.directions.${d}`)} defaultChecked={d === "out"} />
        ))}
      </SegmentGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="e-amount">{t("cashbook.amount")}</Label>
          <TypedInput kind="money" id="e-amount" name="amount" required autoFocus />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="e-date">{t("cashbook.date")}</Label>
          <DateInput id="e-date" name="booked_on" type="date" defaultValue={today} required />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="e-desc">{t("cashbook.description")}</Label>
        <Input id="e-desc" name="description" maxLength={300} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="e-cat">{t("cashbook.categoryOptional")}</Label>
          <Input id="e-cat" name="category" list="e-cats" maxLength={100} autoComplete="off" />
          <datalist id="e-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="e-party">{t("cashbook.counterpartyOptional")}</Label>
          <Input id="e-party" name="counterparty" maxLength={200} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="e-sphere">{t("cashbook.sphere")}</Label>
        <Choice
          id="e-sphere"
          name="sphere"
          label={t("cashbook.sphere")}
          options={SPHERES.map((s) => ({
            value: s,
            label: t.dynamic(`cashbook.spheres.${s}`),
          }))}
        />
      </div>
      {invoices && (
        <div className="grid gap-2">
          <RecordPicker name="document_id" label={t("cashbook.invoice")} search={searchOpenInvoices} placeholder={t("cashbook.invoiceSearch")} />
          <p className="text-xs text-muted-foreground">{t("cashbook.invoiceHint")}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("cashbook.bookHint")}</p>
      <SaveBar label={t("cashbook.book")} always confirm="cashbook.confirmBook" />
    </form>
  )
}

function AccountForm({ t, a, today }: { t: T; a?: Tables<"cash_accounts">; today: string }) {
  return (
    <form action={saveAccount} className="grid gap-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      <div className="grid gap-2">
        <Label htmlFor="a-name">{t("cashbook.accountName")}</Label>
        <Input id="a-name" name="name" defaultValue={a?.name ?? ""} placeholder={t("cashbook.accountPlaceholder")} maxLength={100} required autoFocus={!a} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="a-kind">{t("cashbook.accountKind")}</Label>
        <Choice
          id="a-kind"
          name="kind"
          label={t("cashbook.accountKind")}
          required
          defaultValue={a?.kind ?? "cash"}
          options={ACCOUNT_KINDS.map((k) => ({
            value: k,
            label: t.dynamic(`cashbook.kinds.${k}`),
          }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="a-opening">{t("cashbook.opening")}</Label>
          <TypedInput kind="money" id="a-opening" name="opening" defaultValue={a ? priceInput(Math.abs(a.opening_cents)) : ""} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="a-on">{t("cashbook.openingOn")}</Label>
          <DateInput id="a-on" name="opening_on" type="date" defaultValue={a?.opening_on ?? today} />
        </div>
      </div>
      {a && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={a.active} className="size-4 accent-primary" />
          {t("cashbook.accountActive")}
        </label>
      )}
      {a ? <SaveBar /> : <SaveBar label={t("cashbook.createAccount")} always />}
    </form>
  )
}

async function EntrySheet({ t, ctx, e, reversedBy, canManage, sp }: { t: T; ctx: Ctx; e: Entry; reversedBy?: string | null; canManage: boolean; sp: SearchParams }) {
  const [{ data: original }, { data: doc }, { data: later }] = await Promise.all([
    e.reverses_id ? ctx.supabase.from("cash_entries").select("id, number").eq("id", e.reverses_id).maybeSingle() : Promise.resolve({ data: null }),
    e.document_id && ctx.modules.has("invoices") ? ctx.supabase.from("documents").select("id, number").eq("id", e.document_id).maybeSingle() : Promise.resolve({ data: null }),
    reversedBy === undefined ? ctx.supabase.from("cash_entries").select("id, number").eq("reverses_id", e.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const reversal = reversedBy ?? later?.number
  const entryLink = (id: string | undefined, label: string | null | undefined) =>
    id ? (
      <Link href={`/cashbook${withParams(sp, { edit: id })}`} scroll={false} className="text-[var(--link)] hover:underline">
        {label}
      </Link>
    ) : (
      label
    )
  const canReverse = canManage && !e.reverses_id && !reversal
  return (
    <UrlSheet
      params={["edit"]}
      title={e.description}
      description={`${e.number} · ${t.money(e.amount_cents)}`}
      actions={
        canReverse && (
          <form action={reverseCashEntry}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="account_id" value={e.account_id} />
            <SubmitButton size="sm" variant="outline" data-confirm="cashbook.confirmReverse">
              <BanIcon /> {t("cashbook.reverse")}
            </SubmitButton>
          </form>
        )
      }
    >
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <DetailList
        items={[
          {
            label: t("cashbook.date"),
            value: t.date(e.booked_on, { dateStyle: "medium" }),
          },
          {
            label: t("cashbook.amount"),
            value: <span className={e.amount_cents < 0 ? "text-destructive tabular-nums" : "tabular-nums"}>{t.money(e.amount_cents)}</span>,
          },
          e.category && { label: t("cashbook.category"), value: e.category },
          e.sphere && {
            label: t("cashbook.sphere"),
            value: t.dynamic(`cashbook.spheres.${e.sphere}`),
          },
          e.counterparty && {
            label: t("cashbook.counterparty"),
            value: e.counterparty,
          },
          doc && {
            label: t("cashbook.invoice"),
            value: (
              <Link href={`/invoices/${doc.id}`} className="text-[var(--link)] hover:underline">
                {doc.number}
              </Link>
            ),
          },
          original && {
            label: t("cashbook.reverses"),
            value: entryLink(original.id, original.number),
          },
          reversal && {
            label: t("cashbook.reversedBy"),
            value: entryLink(later?.id, reversal),
          },
          {
            label: t("cashbook.bookedAt"),
            value: t.date(e.created_at, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          },
        ]}
      />
      <Section id="receipts" title={t("cashbook.receipts")}>
        <FileList ctx={ctx} entity="cash_entries" entityId={e.id} back={`/cashbook${withParams(sp, {})}`} />
      </Section>
    </UrlSheet>
  )
}

export const instant = false
