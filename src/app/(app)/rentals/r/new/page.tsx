import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"
import { Choice } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { SearchBox } from "@/components/data-table"
import { NewPage } from "@/components/new-page"
import { EmptyState, FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { toLocalInput } from "@/lib/time"
import { param, type SearchParams } from "@/lib/url"
import { longTerm, UNITS, wordFor, type Family } from "@/rentals/fields"
import { createRentalAction } from "../../actions"
import { kindLabel } from "../../parts"
import { TermFields } from "../../term-fields"
import { DateInput } from "@/components/date-input"

// New contract / booking / loan for one object (?object=…; from the calendar also ?start=&end=). Picking a rate is
// enough: empty price/terms are taken from it on save, so the form stays short.
export default async function NewRentalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  const sp = await searchParams
  const objectId = param(sp, "object") ?? param(sp, "resource")
  // Without an object (Neue Vergabe, calendar month view): pick the object first – searchable, keeping start/end.
  if (!objectId || !/^[0-9a-f-]{36}$/.test(objectId)) {
    const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
    let query = ctx.supabase.from("rental_objects").select("id, name, kind").eq("org_id", ctx.org.id).is("deleted_at", null).eq("rentable", true).eq("status", "active").eq("included", false).order("name").limit(100)
    if (q) query = query.ilike("name", `%${q}%`)
    const { data: objects } = await query
    const keep = new URLSearchParams(Object.entries({ start: param(sp, "start"), end: param(sp, "end") }).filter((x): x is [string, string] => !!x[1]))
    return (
      <NewPage list={{ href: "/rentals/list", label: t("rentals.tabs.rentals") }} title={t("rentals.pickObject")}>
        <SearchBox q={q} label={t("rentals.search")} />
        {objects?.length ? (
          <ul className="grid divide-y rounded-lg border">
            {objects.map((x) => (
              <li key={x.id}>
                <Link href={`/rentals/r/new?object=${x.id}${keep.size ? `&${keep}` : ""}`} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-muted active:bg-muted">
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{x.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{kindLabel(t, x.kind)}</span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : q ? (
          <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">{t("rentals.noMatch")}</p>
        ) : (
          <EmptyState area="rentals" title={t("rentals.noRentable")} text={t("rentals.noRentableText")} action={<Link href="/rentals" className="text-sm link">{t("rentals.objects")}</Link>} />
        )}
      </NewPage>
    )
  }
  const [{ data: o }, { data: rates }, defs] = await Promise.all([
    ctx.supabase.from("rental_objects").select("id, name, kind, family").eq("id", objectId).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("rental_rates").select("id, name, unit, price_cents, term_months, renew_months, notice_months").eq("object_id", objectId).eq("org_id", ctx.org.id).eq("active", true).order("position"),
    loadFields(ctx.supabase, ctx.org.id, "rentals"),
  ])
  if (!o) notFound()
  const first = rates?.[0]
  const long = longTerm(first?.unit)
  const word = wordFor(o.family as Family, first?.unit)
  const start = param(sp, "start")
  const end = param(sp, "end")
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  return (
    <NewPage list={{ href: `/rentals/${o.id}`, label: o.name }} title={`${t.dynamic(`rentals.words.${word}`)} · ${o.name}`} error={param(sp, "error")}>
      <form action={createRentalAction} className="grid gap-6">
        <input type="hidden" name="object_id" value={o.id} />
        <FormCard id="who" title={t("rentals.people")} description={t("rentals.peopleHintNew")}>
          <ContactPicker name="contact_id" label={t("rentals.roles.main")} />
        </FormCard>
        <FormCard id="when" title={t("rentals.whenTitle")}>
          {long ? (
            // Term defaults from the first tariff (term, renewal, notice); the form posts what's shown.
            <TermFields start={start?.slice(0, 10) ?? today} end={null} termMonths={first?.term_months ?? (first?.renew_months ? first.renew_months : null)} renew={first?.renew_months ?? null} notice={first?.notice_months ?? null} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="n-start">{t("rentals.starts")}</Label>
                <DateInput id="n-start" name="starts_at" type="datetime-local" required defaultValue={start ? toLocalInput(start) : `${today}T10:00`} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="n-end">{t("rentals.ends")}</Label>
                <DateInput id="n-end" name="ends_at" type="datetime-local" defaultValue={end ? toLocalInput(end) : ""} />
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="n-status">{t("rentals.requestStatus")}</Label>
            <Choice id="n-status" name="status" label={t("rentals.requestStatus")} required defaultValue="confirmed" options={(["confirmed", "request"] as const).map((x) => ({ value: x, label: t(`rentals.statusOptions.${x}`) }))} />
            <p className="text-xs text-muted-foreground">{t("rentals.statusHint")}</p>
          </div>
        </FormCard>
        <FormCard id="price" title={t("rentals.priceTitle")} description={rates?.length ? t("rentals.rateHint") : undefined}>
          {!!rates?.length && (
            <div className="grid gap-2">
              <Label htmlFor="n-rate">{t("rentals.rate")}</Label>
              <Choice id="n-rate" name="rate_id" label={t("rentals.rate")} defaultValue={first?.id} emptyLabel={t("rentals.noRate")} options={rates.map((r) => ({ value: r.id, label: `${r.name} · ${t.money(r.price_cents)} ${t.dynamic(`rentals.unitsShort.${r.unit}`)}` }))} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="n-price">{t("rentals.price")}</Label>
              <TypedInput kind="money" id="n-price" name="price" placeholder={t("rentals.fromRate")} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="n-unit">{t("rentals.unit")}</Label>
              <Choice id="n-unit" name="unit" label={t("rentals.unit")} emptyLabel={rates?.length ? t("rentals.fromRate") : undefined} options={UNITS.map((u) => ({ value: u, label: t.dynamic(`rentals.units.${u}`) }))} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="n-dep">{t("rentals.deposit")}</Label>
              <TypedInput kind="money" id="n-dep" name="deposit" placeholder={t("rentals.fromRate")} />
            </div>
          </div>
        </FormCard>
        <FormCard id="more" title={defs.length ? t("rentals.moreFields") : t("rentals.note")}>
          <CustomFieldInputs defs={defs} idPrefix="n-custom" />
          <div className="grid gap-2">
            {defs.length > 0 && <Label htmlFor="n-note">{t("rentals.note")}</Label>}
            <Textarea id="n-note" name="note" rows={3} maxLength={20000} aria-label={t("rentals.note")} />
          </div>
        </FormCard>
        <SaveBar label={t.dynamic(`rentals.newWord.${word}`)} always />
      </form>
    </NewPage>
  )
}

export const instant = false
