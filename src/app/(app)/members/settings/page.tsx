import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRightIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { CopyButton } from "@/components/copy-button"
import { Notice } from "@/components/notice"
import { NumberRangeFields } from "@/components/number-range-form"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { AddLink, RowGroup } from "@/components/section"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { formatMoney } from "@/lib/inputs"
import type { Tables } from "@/lib/supabase/types"
import { param, siteUrl, withParams } from "@/lib/url"
import { INTERVALS, type Interval } from "@/members/dues"
import { deleteType, saveSettings, saveType } from "../actions"
import { Field } from "../membership-parts"

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

// Mitglieder › Einstellungen (the gear): membership types (rows → sheet), SEPA creditor data + member numbers in one
// form with one SaveBar, and the member area's address.
export default async function MembersSettingsPage({ searchParams }: PageProps<"/members/settings">) {
  const ctx = await requirePerm("members.manage")
  if (!ctx.modules.has("members")) notFound()
  const t = await getT()
  const sp = await searchParams
  const now = today()
  const [{ data: settings }, { data: range }, { data: types }, { data: active }, { data: eventTypes }] = await Promise.all([
    ctx.supabase.from("member_settings").select("*").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("number_ranges").select("format, next_number, yearly_reset").eq("org_id", ctx.org.id).eq("kind", "member").maybeSingle(),
    ctx.supabase.from("membership_types").select("*").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("type_id").eq("org_id", ctx.org.id).is("deleted_at", null).lte("starts_on", now).or(`ends_on.is.null,ends_on.gte.${now}`),
    ctx.supabase.from("event_types").select("id, name, active").eq("org_id", ctx.org.id).order("name"),
  ])
  const counts = new Map<string, number>()
  for (const m of active ?? []) counts.set(m.type_id, (counts.get(m.type_id) ?? 0) + 1)
  const edit = (types ?? []).find((x) => x.id === param(sp, "edit"))
  const creating = param(sp, "new") === "type"
  const feeText = (x: Tables<"membership_types">) =>
    x.fee_cents === 0 && x.interval === "none" ? t("membership.feeNone") : `${x.fee_is_minimum ? t("membership.feeFrom", { fee: t.money(x.fee_cents) }) : t.money(x.fee_cents)} / ${t(`membership.intervals.${x.interval as Interval}`)}`

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/members", label: t("membership.nav") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <RowGroup id="types" title={t("membership.types")} description={t("membership.typesHint")}>
        {(types ?? []).map((x) => (
          <Link key={x.id} href={withParams(sp, { edit: x.id, new: undefined })} scroll={false} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-muted active:bg-muted">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{x.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  feeText(x),
                  x.entry_fee_cents ? t("membership.entryFeeShort", { fee: t.money(x.entry_fee_cents) }) : null,
                  x.notice_months ? t("membership.noticeShortValue", { n: x.notice_months }) : null,
                  x.prorate && t("membership.prorate"),
                  x.visit_limit ? t("membership.visitLimitShort", { n: x.visit_limit }) : null,
                  x.visit_limit && x.visit_event_types
                    ? t("membership.countRuleShort", { types: t.list(x.visit_event_types.map((id) => eventTypes?.find((e) => e.id === id)?.name ?? "?")) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {!x.active && <Badge variant="secondary">{t("membership.typeInactive")}</Badge>}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("membership.typeCount", { count: counts.get(x.id) ?? 0 })}</span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
        {!types?.length && <p className="px-4 py-3 text-sm text-muted-foreground">{t("membership.noTypes")}</p>}
        <div className="px-4 py-2">
          <AddLink href={withParams(sp, { new: "type", edit: undefined })}>{t("membership.newType")}</AddLink>
        </div>
      </RowGroup>

      <form action={saveSettings} className="grid gap-6">
        <FormCard id="sepa" title={t("membership.sepa")} description={t("membership.creditorHint")}>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <Field id="s-name" name="creditor_name" label={t("membership.creditorName")} maxLength={70} defaultValue={settings?.creditor_name ?? ctx.org.name} />
            <Field id="s-cid" name="creditor_id" label={t("membership.creditorId")} maxLength={35} defaultValue={settings?.creditor_id ?? ""} placeholder="DE98ZZZ09999999999" className="font-mono tracking-wide" />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="grid w-full max-w-md content-start gap-2">
              <Label htmlFor="s-iban">IBAN</Label>
              <TypedInput kind="iban" id="s-iban" name="iban" defaultValue={settings?.iban ?? ""} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="s-bic">{t("membership.bicOptional")}</Label>
              <TypedInput kind="bic" id="s-bic" name="bic" defaultValue={settings?.bic ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-day">{t("membership.dueDay")}</Label>
            <TypedInput kind="number" id="s-day" name="due_day" min={1} max={28} defaultValue={settings?.due_day ?? 15} />
          </div>
        </FormCard>
        <FormCard id="numbers" title={t("membership.numberRange")} description={t("membership.numberRangeHint")}>
          <NumberRangeFields t={t} kind="member" range={range} label={t("membership.numberFormat")} />
        </FormCard>
        <SaveBar />
      </form>

      <RowGroup id="portal" title={t("portal.title")} description={t("membership.portalHint")}>
        <div className="flex min-h-12 items-center gap-2 px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{siteUrl(ctx.org.slug, "/portal", ctx.org.site_domain)}</span>
          <CopyButton value={siteUrl(ctx.org.slug, "/portal", ctx.org.site_domain)} label={t("common.copy")} />
        </div>
      </RowGroup>

      {(creating || edit) && (
        <UrlSheet
          params={["new", "edit"]}
          title={edit ? edit.name : t("membership.newType")}
          menu={
            edit && (
              <ActionsMenu>
                <MenuSubmit form="delete-type" icon={<Trash2Icon />} destructive confirm="membership.confirmDeleteType">
                  {t("membership.deleteType")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          {edit && (
            <form id="delete-type" action={deleteType} hidden>
              <input type="hidden" name="id" value={edit.id} />
            </form>
          )}
          <TypeForm t={t} type={edit} eventTypes={eventTypes ?? []} />
        </UrlSheet>
      )}
    </Page>
  )
}

function TypeForm({ t, type, eventTypes }: { t: T; type?: Tables<"membership_types">; eventTypes: { id: string; name: string; active: boolean }[] }) {
  const counted = type?.visit_event_types ?? []
  // Inactive types only show while this membership type still counts them.
  const offered = eventTypes.filter((e) => e.active || counted.includes(e.id))
  const id = type?.id ?? "new"
  return (
    <form action={saveType} className="grid gap-4">
      {type && <input type="hidden" name="id" value={type.id} />}
      <Field id={`t-name-${id}`} name="name" label={t("membership.typeName")} required maxLength={100} defaultValue={type?.name ?? ""} placeholder={type ? undefined : t("membership.typePlaceholder")} />
      <div className="flex flex-wrap gap-4">
        <div className="grid content-start gap-2">
          <Label htmlFor={`t-fee-${id}`}>{t("membership.fee")}</Label>
          <TypedInput kind="money" id={`t-fee-${id}`} name="fee" defaultValue={type?.fee_cents ? formatMoney(type.fee_cents) : ""} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`t-entry-${id}`}>{t("membership.entryFee")}</Label>
          <TypedInput kind="money" id={`t-entry-${id}`} name="entry_fee" defaultValue={type?.entry_fee_cents ? formatMoney(type.entry_fee_cents) : ""} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`t-int-${id}`}>{t("membership.interval")}</Label>
        <Choice id={`t-int-${id}`} name="interval" label={t("membership.interval")} required defaultValue={type?.interval ?? "year"} options={INTERVALS.map((i) => ({ value: i, label: t(`membership.intervals.${i}`) }))} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`t-notice-${id}`}>{t("membership.noticeMonths")}</Label>
        <TypedInput kind="number" id={`t-notice-${id}`} name="notice_months" min={0} max={24} defaultValue={type?.notice_months ?? 3} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`t-visits-${id}`}>{t("membership.visitLimit")}</Label>
        <TypedInput kind="number" id={`t-visits-${id}`} name="visit_limit" min={1} max={1000} defaultValue={type?.visit_limit ?? ""} />
        <p className="text-xs text-muted-foreground">{t("membership.visitLimitHint")}</p>
      </div>
      {offered.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("membership.countRule")}</legend>
          {offered.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" name="visit_event_types" value={e.id} defaultChecked={counted.includes(e.id)} />
              {e.name}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t("membership.countRuleHint")}</p>
        </fieldset>
      )}
      <div className="grid gap-2.5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" name="prorate" value="on" defaultChecked={type?.prorate ?? false} />
          {t("membership.prorate")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" name="fee_is_minimum" value="on" defaultChecked={type?.fee_is_minimum ?? false} />
          {t("membership.feeIsMinimum")}
        </label>
        {type && (
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="active" value="off" />
            <input type="checkbox" className="size-4 accent-primary" name="active" value="on" defaultChecked={type.active} />
            {t("membership.typeActive")}
          </label>
        )}
      </div>
      <SaveBar label={type ? undefined : t("membership.createType")} always={!type} />
    </form>
  )
}

export const instant = false
