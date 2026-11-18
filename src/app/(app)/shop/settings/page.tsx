import Link from "next/link"
import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { RowGroup, SettingRow } from "@/components/section"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { COUNTRIES, EU, MAIL_KINDS, readShippingRates } from "@/shop/fields"
import { MultiSelect } from "@/components/multi-select"
import { onlineReady, shopSettings } from "@/shop/server"
import { priceInput } from "@/tickets/price"
import { saveShopPart } from "../actions"
import { SettingSwitch } from "./setting-switch"

type Mails = Record<string, { off?: boolean; message?: string }>

// Shop settings as grouped rows (docs/design/patterns.md §2): switches save at once, text values open a small sheet
// (?edit=<part>) with the field and its own SaveBar. The buyer mails live only here (E-Mail › Vorlagen links here).
export default async function ShopSettingsPage({ searchParams }: PageProps<"/shop/settings">) {
  const ctx = await requirePerm("shop.manage")
  if (!ctx.modules.has("shop")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [s, ready, { data: bank }, { data: connected }] = await Promise.all([
    shopSettings(ctx.org.id),
    onlineReady(ctx.org.id),
    ctx.modules.has("invoices") ? ctx.supabase.from("org_billing").select("iban").eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    // A provider can be connected but not able to take payments yet (e.g. Stripe onboarding not finished).
    ctx.supabase.from("org_integrations").select("provider").eq("org_id", ctx.org.id).in("provider", ["stripe", "sumup"]).eq("status", "connected").limit(1),
  ])
  const rates = readShippingRates(s.shipping_rates)
  const mails = (s.mails ?? {}) as Mails
  const edit = param(sp, "edit")
  const change = (part: string) => (
    <Button render={<Link href={withParams(sp, { edit: part })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
      {t("store.settings.change")}
    </Button>
  )
  const value = (v: string | null | undefined) => (v ? <span className="line-clamp-1">{v}</span> : <span className="text-muted-foreground">{t("store.settings.notSet")}</span>)
  const link = (href: string, label: string) => (
    <Link href={href} className="text-[var(--link)] hover:underline">
      {label}
    </Link>
  )

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/shop/orders", label: t("store.nav") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={edit ? undefined : param(sp, "error")} ok={param(sp, "ok")} />

      <RowGroup id="page" title={t("store.settingsPage")}>
        <SettingRow label={t("store.shopPageTitle")} hint={value(s.title ?? t("store.shopTitle"))}>
          {change("page")}
        </SettingRow>
      </RowGroup>

      <RowGroup id="payment" title={t("store.payment")}>
        <SettingRow label={t("store.payments.online")} hint={ready ? t("store.onlineReady") : link("/settings/integrations", connected?.length ? t("store.onlinePending") : t("store.onlineNotReady"))}>
          <SettingSwitch name="pay_online" checked={s.pay_online} label={t("store.payments.online")} />
        </SettingRow>
        <SettingRow label={t("store.payments.transfer")} hint={bank?.iban ? t("store.transferHint") : link("/invoices/settings", t("store.transferNoIban"))}>
          <SettingSwitch name="pay_transfer" checked={s.pay_transfer} label={t("store.payments.transfer")} />
        </SettingRow>
        <SettingRow label={t("store.transferDays")} hint={t("store.settings.days", { count: s.transfer_days })}>
          {change("transfer")}
        </SettingRow>
        <SettingRow label={t("store.payments.pickup")} hint={t("store.payOnPickupHint")}>
          <SettingSwitch name="pay_on_pickup" checked={s.pay_on_pickup} label={t("store.payments.pickup")} />
        </SettingRow>
      </RowGroup>

      <RowGroup id="delivery" title={t("store.delivery")}>
        <SettingRow label={t("store.deliveries.pickup")}>
          <SettingSwitch name="pickup" checked={s.pickup} label={t("store.deliveries.pickup")} />
        </SettingRow>
        <SettingRow label={t("store.pickupText")} hint={value(s.pickup_text)}>
          {change("pickup")}
        </SettingRow>
        <SettingRow label={t("store.deliveries.shipping")} hint={t("store.shippingHint")}>
          <SettingSwitch name="shipping" checked={s.shipping} label={t("store.deliveries.shipping")} />
        </SettingRow>
        <SettingRow label={t("store.shippingRates")} hint={rates.length ? rates.map((r) => `${r.name} ${t.money(r.cents, "eur")}`).join(" · ") : t("store.settings.notSet")}>
          {change("shipping")}
        </SettingRow>
      </RowGroup>

      <RowGroup id="invoices" title={t("store.invoice")}>
        {ctx.modules.has("invoices") ? (
          <SettingRow label={t("store.autoInvoice")} hint={t("store.autoInvoiceHint")}>
            <SettingSwitch name="auto_invoice" checked={s.auto_invoice} label={t("store.autoInvoice")} />
          </SettingRow>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t("store.invoicesModuleOff")}</p>
        )}
      </RowGroup>

      <RowGroup id="mails" title={t("store.mails")} description={t("store.mailsHint")}>
        {MAIL_KINDS.map((k) => (
          <SettingRow key={k} label={t.dynamic(`store.mailKinds.${k}`)} hint={t.dynamic(`store.mailWhen.${k}`)}>
            <span className="flex items-center gap-3">
              <Button render={<Link href={withParams(sp, { edit: `mail-${k}` })} scroll={false} />} nativeButton={false} size="sm" variant="ghost">
                {mails[k]?.message ? t("store.settings.ownText") : t("store.settings.text")}
              </Button>
              <SettingSwitch name={`mail_${k}`} checked={!mails[k]?.off} label={t.dynamic(`store.mailKinds.${k}`)} />
            </span>
          </SettingRow>
        ))}
      </RowGroup>

      <RowGroup id="legal" title={t("store.legal")} description={t("store.legalHint")}>
        <SettingRow label={t("store.terms")} hint={s.terms ? t("store.settings.set") : t("store.settings.notSet")}>
          {change("terms")}
        </SettingRow>
        <SettingRow label={t("store.withdrawal")} hint={s.withdrawal ? t("store.settings.set") : t("store.settings.notSet")}>
          {change("withdrawal")}
        </SettingRow>
      </RowGroup>

      {edit && <PartSheet t={t} part={edit} s={s} mails={mails} rates={rates} error={param(sp, "error")} />}
    </Page>
  )
}

async function PartSheet({ t, part, s, mails, rates, error }: { t: Awaited<ReturnType<typeof getT>>; part: string; s: Awaited<ReturnType<typeof shopSettings>>; mails: Mails; rates: ReturnType<typeof readShippingRates>; error?: string }) {
  const mailKind = MAIL_KINDS.find((k) => `mail-${k}` === part)
  const titles: Record<string, string> = {
    page: t("store.settingsPage"),
    transfer: t("store.transferDays"),
    pickup: t("store.pickupText"),
    shipping: t("store.shippingRates"),
    terms: t("store.terms"),
    withdrawal: t("store.withdrawal"),
  }
  const title = mailKind ? t.dynamic(`store.mailKinds.${mailKind}`) : titles[part]
  if (!title) return null
  // Country picker: "EU" (all members) first, then every country by its name in the reader's language.
  const names = new Intl.DisplayNames([t.locale], { type: "region" })
  const countryOptions = [{ value: "EU", label: t("store.allEu") }, ...COUNTRIES.map((c) => ({ value: c, label: names.of(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label, t.locale))]
  const shown = (cs: string[]) => (EU.every((c) => cs.includes(c)) ? ["EU", ...cs.filter((c) => !EU.includes(c))] : cs)
  const area = (name: string, label: string, v: string | null | undefined, rows: number, hint?: string, placeholder?: string) => (
    <div className="grid gap-2">
      <Label htmlFor={`s-${name}`}>{label}</Label>
      <Textarea id={`s-${name}`} name={name} rows={rows} defaultValue={v ?? ""} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )

  return (
    <UrlSheet params={["edit"]} title={title} description={mailKind ? t.dynamic(`store.mailWhen.${mailKind}`) : undefined} wide={part === "shipping" || part === "terms" || part === "withdrawal"}>
      <Notice error={error} />
      <form action={saveShopPart} className="grid gap-4">
        <input type="hidden" name="part" value={part} />
        {part === "page" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="s-title">{t("store.shopPageTitle")}</Label>
              <Input id="s-title" name="title" maxLength={200} defaultValue={s.title ?? ""} placeholder={t("store.shopTitle")} />
            </div>
            {area("intro", t("store.intro"), s.intro, 4)}
          </>
        )}
        {part === "transfer" && (
          <div className="grid gap-2 sm:max-w-48">
            <Label htmlFor="s-days">{t("store.transferDays")}</Label>
            <TypedInput kind="number" id="s-days" name="transfer_days" min={1} max={60} defaultValue={String(s.transfer_days)} className="w-full" />
          </div>
        )}
        {part === "pickup" && area("pickup_text", t("store.pickupText"), s.pickup_text, 3, t("store.pickupTextHint"))}
        {part === "shipping" && (
          <div className="grid gap-2">
            <div className="hidden grid-cols-[1fr_7rem_7rem] gap-2 text-xs text-muted-foreground sm:grid">
              <span>{t("store.rateName")}</span>
              <span>{t("store.price")}</span>
              <span>{t("store.freeFromLabel")}</span>
            </div>
            {[...rates, null, null].map((r, i) => (
              <div key={r?.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_7rem]">
                <input type="hidden" name="rate_id" value={r?.id ?? ""} />
                <Input name="rate_name" defaultValue={r?.name ?? ""} maxLength={100} placeholder={t("store.ratePlaceholder")} aria-label={t("store.rateName")} className="col-span-2 sm:col-span-1" />
                <TypedInput kind="money" name="rate_price" defaultValue={r ? priceInput(r.cents) : ""} aria-label={t("store.price")} className="w-full" />
                <TypedInput kind="money" name="rate_free" defaultValue={r?.free_from ? priceInput(r.free_from) : ""} placeholder="–" aria-label={t("store.freeFromLabel")} className="w-full" />
                <div className="col-span-2 sm:col-span-3">
                  <MultiSelect name="rate_countries" joined options={countryOptions} defaultValue={shown(r?.countries ?? ["DE"])} placeholder={t("store.countries")} max={250} />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{t("store.ratesHint")}</p>
          </div>
        )}
        {part === "terms" && area("terms", t("store.terms"), s.terms, 14, t("store.settings.markdownHint"))}
        {part === "withdrawal" && area("withdrawal", t("store.withdrawal"), s.withdrawal, 14, t("store.settings.markdownHint"))}
        {mailKind &&
          area(
            "message",
            t("store.mailText"),
            mails[mailKind]?.message,
            4,
            t("store.mailTemplateHint"),
            t.dynamic(`store.mail.${mailKind}.message`, { number: "{number}", name: "{name}", total: "{total}", org: "{org}" }),
          )}
        <SaveBar />
      </form>
    </UrlSheet>
  )
}

export const instant = false
