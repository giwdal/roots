import Link from "next/link"
import { BanIcon, BellIcon, CheckIcon, DownloadIcon, LandmarkIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import { BulkBar } from "@/components/bulk-bar"
import { ActionsMenu, MenuExport, MenuLink, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { DateInput } from "@/components/date-input"
import { Notice } from "@/components/notice"
import { EmptyState, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { Segments } from "@/components/segments"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { contactName } from "@/app/(app)/contacts/fields"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { reminderScope } from "@/members/dues"
import { addLevy, bulkDues, createSepaRun, generateDues, sendReminders, setRunStatus } from "../actions"
import { DueBadge } from "../badges"

const STATUSES = ["open", "failed", "paid", "cancelled", "all"] as const
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10)

// The treasurer's list: what is open and overdue (Stats), the direct debits under way as three steps (file → bank →
// collected), then every due with search + status. Creating dues (period fees, a levy) and a SEPA run are sheets.
export default async function DuesPage({ searchParams }: PageProps<"/members/dues">) {
  const ctx = await requirePerm("members.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("members.manage")
  const status = STATUSES.find((s) => s === param(sp, "status")) ?? "open"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  const now = today()
  const year = now.slice(0, 4)
  const sheet = canManage ? param(sp, "new") : undefined

  let query = ctx.supabase
    .from("member_dues")
    .select("id, membership_id, description, amount_cents, due_on, status, run_id, reminders, reminded_at, failed_at, memberships!inner(number, contacts!inner(first_name, last_name, company, email))")
    .eq("org_id", ctx.org.id)
    .order("due_on", { ascending: false })
    .range(...pageRange(page))
  if (status === "failed") query = query.eq("status", "open").not("failed_at", "is", null)
  else if (status !== "all") query = query.eq("status", status)
  if (q) query = query.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${q}%`).join(","), { referencedTable: "memberships.contacts" })
  const [{ data }, { data: runs }, { data: open }, { count: anyDues }, { data: tagRows }, { data: creditor }] = await Promise.all([
    query,
    ctx.supabase.from("sepa_runs").select("id, collection_on, count, total_cents, status, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(10),
    // ponytail: open total summed here over ≤ 5000 rows; an RPC once dues lists get longer.
    ctx.supabase.from("member_dues").select("amount_cents, due_on, membership_id, run_id, failed_at").eq("org_id", ctx.org.id).eq("status", "open").limit(5000),
    ctx.supabase.from("member_dues").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
    sheet === "levy" ? ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }) : Promise.resolve({ data: [] }),
    sheet === "sepa" ? ctx.supabase.from("member_settings").select("creditor_name, creditor_id, iban").eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const openTotal = (open ?? []).reduce((s, d) => s + d.amount_cents, 0)
  const overdue = (open ?? []).filter((d) => d.due_on < now)
  const returned = (open ?? []).filter((d) => d.failed_at).length
  const remind = reminderScope(open ?? [], now) // what "remind all" really mails (dues in a SEPA run are skipped)
  const tags = ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale))
  const highlight = param(sp, "run")
  const running = (runs ?? []).filter((r) => r.status === "exported")
  const done = (runs ?? []).filter((r) => r.status !== "exported")
  const creditorReady = !!(creditor?.creditor_name && creditor.creditor_id && creditor.iban)
  const runLine = (r: { collection_on: string; count: number; total_cents: number }) => t("membership.runLine", { date: t.date(r.collection_on), count: r.count, total: t.money(r.total_cents) })

  return (
    <>
      <PageHeader
        title={t("membership.tabs.dues")}
        area="members"
        settings={canManage && { href: "/members/settings", label: t("common.settings") }}
        actions={
          canManage && (
            <>
              <Button render={<Link href={withParams(sp, { new: "sepa" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                <LandmarkIcon /> {t("membership.sepa")}
              </Button>
              {remind.people > 0 && (
                <form action={sendReminders}>
                  <SubmitButton size="sm" variant="outline" data-confirm="membership.confirmRemindAll" data-confirm-count={remind.people} data-confirm-amount={t.money(remind.cents)}>
                    <BellIcon /> {t("membership.remindAllShort")}
                  </SubmitButton>
                </form>
              )}
            </>
          )
        }
        menu={
          <ActionsMenu>
            {canManage && (
              <MenuLink href={withParams(sp, { new: "levy" })} icon={<PlusIcon />}>
                {t("membership.levy")}
              </MenuLink>
            )}
            <MenuExport entity="dues" query={{ status, q }} />
          </ActionsMenu>
        }
        primary={canManage ? { href: withParams(sp, { new: "generate" }), label: t("membership.generate"), icon: RefreshCwIcon } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {!!anyDues && (
        <Stats>
          <Stat label={t("membership.statOpen")} value={t.money(openTotal)} hint={t("membership.statOpenCount", { count: open?.length ?? 0 })} href={status === "open" ? undefined : "/members/dues"} />
          <Stat label={t("membership.overdue")} value={t.money(overdue.reduce((s, d) => s + d.amount_cents, 0))} hint={t("membership.statOpenCount", { count: overdue.length })} tone={overdue.length ? "warn" : undefined} />
          <Stat label={t("membership.filters.returned")} value={returned} href="/members/dues?status=failed" tone={returned ? "warn" : undefined} />
        </Stats>
      )}

      {!!runs?.length && (
        <Section id="runs" title={t("membership.runs")}>
          {running.map((r) => (
            <div key={r.id} className={`grid gap-3 rounded-lg border p-3 text-sm ${r.id === highlight ? "border-primary" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{runLine(r)}</span>
                <Badge variant="warning">{t("membership.runStatus.exported")}</Badge>
                {canManage && (
                  <>
                    <form id={`run-cancel-${r.id}`} action={setRunStatus} hidden>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="cancelled" />
                    </form>
                    <ActionsMenu>
                      <MenuSubmit form={`run-cancel-${r.id}`} icon={<BanIcon />} destructive confirm="membership.confirmCancelRun">
                        {t("membership.cancelRun")}
                      </MenuSubmit>
                    </ActionsMenu>
                  </>
                )}
              </div>
              <ol className="grid gap-2">
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Step n={1} />
                  <span className="min-w-0 flex-1">{t("membership.runStep1")}</span>
                  <Button render={<a href={`/members/sepa/${r.id}`} />} nativeButton={false} size="sm" variant="outline">
                    <DownloadIcon /> {t("membership.downloadXml")}
                  </Button>
                </li>
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Step n={2} />
                  <span className="min-w-0 flex-1">{t("membership.runStep2", { date: t.date(r.collection_on) })}</span>
                </li>
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Step n={3} />
                  <span className="min-w-0 flex-1">{t("membership.runStep3")}</span>
                  {canManage && (
                    <form action={setRunStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="collected" />
                      <SubmitButton size="sm" data-confirm="membership.confirmCollected" data-confirm-count={r.count} data-confirm-amount={t.money(r.total_cents)}>
                        <CheckIcon /> {t("membership.markCollected")}
                      </SubmitButton>
                    </form>
                  )}
                </li>
              </ol>
            </div>
          ))}
          {!!done.length && (
            <ul className="grid divide-y rounded-lg border">
              {done.map((r) => (
                <li key={r.id} className={`flex min-h-11 flex-wrap items-center gap-2 px-3 py-2 text-sm ${r.id === highlight ? "bg-muted" : ""}`}>
                  <span className="min-w-0 flex-1">{runLine(r)}</span>
                  <Badge variant={r.status === "collected" ? "success" : "secondary"}>{t(`membership.runStatus.${r.status as "collected" | "cancelled"}`)}</Badge>
                  {r.status !== "cancelled" && (
                    <Button render={<a href={`/members/sepa/${r.id}`} aria-label={`${t("membership.downloadXml")} · ${runLine(r)}`} />} nativeButton={false} size="sm" variant="ghost">
                      <DownloadIcon /> {t("membership.downloadXml")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {!!anyDues && (
        <ListToolbar search={<SearchBox q={q} label={t("membership.searchDues")} keep={status !== "open" ? { status } : undefined} />}>
          <Segments
            label={t("membership.status")}
            items={STATUSES.map((s) => ({
              href: `/members/dues${withParams(sp, { status: s === "open" ? undefined : s, page: undefined, run: undefined })}`,
              current: s === status,
              label: s === "all" ? t("membership.filters.all") : s === "failed" ? t("membership.filters.returned") : t(`membership.dueStatus.${s}`),
            }))}
          />
        </ListToolbar>
      )}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/members/${r.membership_id}#dues`}
        select={canManage ? { form: "bulk-dues", label: t("common.select") } : undefined}
        empty={
          anyDues ? (
            t("membership.noDues")
          ) : (
            <EmptyState
              area="members"
              title={t("membership.duesEmpty")}
              text={t("membership.duesEmptyText")}
              action={
                canManage && (
                  <Button render={<Link href={withParams(sp, { new: "generate" })} scroll={false} />} nativeButton={false} size="sm">
                    <RefreshCwIcon /> {t("membership.generate")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("membership.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.memberships?.contacts ? contactName(r.memberships.contacts) : ""}</span>
                <span className="text-xs text-muted-foreground">{r.description}</span>
              </span>
            ),
          },
          { header: t("membership.dueOn"), cell: (r) => t.date(r.due_on), className: "whitespace-nowrap" },
          {
            header: t("membership.status"),
            cell: (r) => (
              <span className="grid justify-items-start gap-0.5">
                <DueBadge t={t} d={r} now={now} />
                {r.status === "open" && (r.run_id || r.reminded_at) && (
                  <span className="text-xs text-muted-foreground">
                    {[r.run_id && t("membership.inRun"), r.reminded_at && t("membership.reminded", { count: r.reminders, date: t.date(r.reminded_at) })].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            ),
          },
          { header: t("membership.amount"), cell: (r) => t.money(r.amount_cents), className: "whitespace-nowrap text-right tabular-nums" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {canManage && (
        <BulkBar form="bulk-dues" action={bulkDues}>
          <input type="hidden" name="back" value={`/members/dues${withParams(sp, {})}`} />
          <SubmitButton size="sm" variant="outline" name="intent" value="paid" data-confirm="membership.confirmBulkPaid">
            <CheckIcon /> {t("membership.markPaid")}
          </SubmitButton>
          <SubmitButton size="sm" variant="outline" name="intent" value="remind" data-confirm="membership.confirmBulkRemind">
            <BellIcon /> {t("membership.remind")}
          </SubmitButton>
          <Button type="submit" size="sm" variant="ghost" formAction="/export/dues" formMethod="get" name="format" value="xlsx">
            <DownloadIcon /> {t("common.exportSelected")}
          </Button>
        </BulkBar>
      )}

      {sheet === "generate" && (
        <UrlSheet params={["new"]} title={t("membership.generate")}>
          <form action={generateDues} className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("membership.generateHint")}</p>
            <div className="grid grid-cols-2 gap-3">
              <DateField id="g-from" name="from" label={t("membership.from")} defaultValue={`${year}-01-01`} required />
              <DateField id="g-to" name="to" label={t("membership.to")} defaultValue={`${year}-12-31`} required />
            </div>
            <SaveBar label={t("membership.generate")} always />
          </form>
        </UrlSheet>
      )}
      {sheet === "levy" && (
        <UrlSheet params={["new"]} title={t("membership.levy")}>
          <form action={addLevy} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="l-desc">{t("membership.levyText")}</Label>
              <Input id="l-desc" name="description" maxLength={140} required placeholder={t("membership.levyPlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid content-start gap-2">
                <Label htmlFor="l-amount">{t("membership.amount")}</Label>
                <TypedInput kind="money" id="l-amount" name="amount" required />
              </div>
              <DateField id="l-due" name="due_on" label={t("membership.dueOn")} defaultValue={now} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="l-tag">{t("membership.levyGroup")}</Label>
              <Choice id="l-tag" name="tag" label={t("membership.levyGroup")} emptyLabel={t("membership.allMembers")} options={tags.map((tg) => ({ value: tg, label: tg }))} />
            </div>
            <SaveBar label={t("membership.addLevy")} always />
          </form>
        </UrlSheet>
      )}
      {sheet === "sepa" && (
        <UrlSheet params={["new"]} title={t("membership.sepa")}>
          <form action={createSepaRun} className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("membership.sepaHint")}</p>
            {!creditorReady && (
              <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
                {t("membership.creditorMissing")}{" "}
                <Link href="/members/settings#sepa" className="link">
                  {t("common.settings")}
                </Link>
              </p>
            )}
            <DateField id="s-date" name="collection_on" label={t("membership.collectionOn")} defaultValue={addDays(now, 7)} min={addDays(now, 1)} required />
            <SaveBar label={t("membership.createRun")} always />
          </form>
        </UrlSheet>
      )}
    </>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums" aria-hidden>
      {n}
    </span>
  )
}

function DateField({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof DateInput>) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <DateInput id={id} {...props} />
    </div>
  )
}

export const instant = false
