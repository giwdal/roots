import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftRightIcon } from "lucide-react"
import { ContactPicker } from "@/components/contact-picker"
import { DetailList } from "@/components/detail-list"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { conflicts, defaultTake, mergeValue, type MergeContact } from "@/contacts/merge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { mergeContact } from "../../actions"
import { CONTACT_FIELDS, contactName } from "../../fields"

const COLS = "id, first_name, last_name, company, email, phone, street, postal_code, city, country, birthday, member_code, user_id, custom"
const isId = (v: string | undefined): v is string => !!v && /^[0-9a-f-]{36}$/.test(v)

// Merge another contact (?with=<id>) into this one: choose the conflicting fields, see what moves, confirm.
export default async function MergeContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  const ctx = await requirePerm("crm.manage")
  if (!ctx.modules.has("crm") || !isId(id)) notFound()
  const t = await getT()
  const sp = await searchParams
  const withId = param(sp, "with")
  const one = (cid: string) => ctx.supabase.from("contacts").select(COLS).eq("id", cid).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle()
  const [{ data: keep }, { data: other }, defs] = await Promise.all([
    one(id),
    isId(withId) && withId !== id ? one(withId) : Promise.resolve({ data: null }),
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
  ])
  if (!keep) notFound()
  const keepName = contactName(keep)
  const named = (c: { email: string | null }, n: string) => (c.email && c.email !== n ? `${n} (${c.email})` : n)
  const header = (
    <PageHeader
      crumbs={[{ href: "/contacts", label: t("contacts.title") }, { href: `/contacts/${id}`, label: keepName }, { label: t("contacts.merge.title") }]}
      title={t("contacts.merge.title")}
    />
  )
  const error = param(sp, "error") ?? (withId === id ? t("errors.merge_same") : withId && !other ? t("errors.merge_not_found") : undefined)

  if (!other) {
    return (
      <Page size="form">
        {header}
        <Notice error={error} />
        <FormCard title={t("contacts.merge.pick")}>
          <form method="get" className="grid gap-4">
            <ContactPicker name="with" label={t("contacts.title")} noCreate />
            <SubmitButton className="justify-self-start">{t("contacts.merge.next")}</SubmitButton>
          </form>
        </FormCard>
      </Page>
    )
  }

  const drop = other
  const dropName = contactName(drop)
  const customKeys = defs.map((d) => d.key)
  const k = keep as MergeContact
  const d = drop as MergeContact
  const userIds = [k.user_id, d.user_id].filter((u): u is string => !!u)
  const [{ data: refs }, { data: people }] = await Promise.all([
    ctx.supabase.rpc("contact_refs", { p_contact: drop.id }),
    userIds.length ? ctx.supabase.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
  ])
  const label = (key: string) => {
    if (key === "address") return t("contacts.merge.address")
    if (key === "member_code") return t("contacts.merge.memberCode")
    if (key === "user_id") return t("contacts.merge.userId")
    if (key.startsWith("custom.")) return defs.find((f) => f.key === key.slice(7))?.label ?? key
    return t.dynamic(CONTACT_FIELDS.find((f) => f.key === key)?.label ?? key)
  }
  const shown = (c: MergeContact, key: string) => {
    const v = mergeValue(c, key)
    if (key === "birthday") return t.date(v, { dateStyle: "medium" })
    if (key === "user_id") {
      const p = people?.find((x) => x.id === v)
      return p ? p.full_name || p.email : t("contacts.merge.linked")
    }
    return v
  }
  const choose = conflicts(k, d, customKeys)
  const auto = defaultTake(k, d, customKeys)
  const moves = Object.entries((refs ?? {}) as Record<string, number>).filter(([, n]) => n > 0)

  return (
    <Page size="form">
      {header}
      <Notice error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">{t("contacts.merge.into", { keep: named(keep, keepName), drop: named(drop, dropName) })}</p>
        <Button render={<Link href={`/contacts/${drop.id}/merge?with=${id}`} />} nativeButton={false} variant="outline" size="sm">
          <ArrowLeftRightIcon /> {t("contacts.merge.swap")}
        </Button>
      </div>
      <form action={mergeContact} className="grid gap-6">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="drop" value={drop.id} />
        {auto.map((key) => (
          <input key={key} type="hidden" name={`take.${key}`} value="drop" />
        ))}
        <FormCard title={t("contacts.merge.choose")} description={choose.length ? t("contacts.merge.chooseHint") : t("contacts.merge.noChoice")}>
          <div className="grid gap-5">
            {choose.map((key) => (
              <fieldset key={key} className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">{label(key)}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["keep", "drop"] as const).map((side) => (
                    <label key={side} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="radio" name={`take.${key}`} value={side} defaultChecked={side === "keep"} className="mt-1 accent-primary" />
                      <span className="grid min-w-0">
                        <span className="break-words">{shown(side === "keep" ? k : d, key)}</span>
                        <span className="truncate text-xs text-muted-foreground">{t(side === "keep" ? "contacts.merge.keepThis" : "contacts.merge.takeOther")}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {k.member_code && d.member_code && <p className="text-sm text-muted-foreground">{t("contacts.merge.cardWarning")}</p>}
            <p className="text-sm text-muted-foreground">{t("contacts.merge.always")}</p>
          </div>
        </FormCard>
        <FormCard title={t("contacts.merge.moves")} description={moves.length ? undefined : t("contacts.merge.nothingMoves")}>
          {moves.length > 0 && <DetailList items={moves.map(([key, n]) => ({ label: t.dynamic(`contacts.merge.refs.${key}`), value: n }))} />}
        </FormCard>
        <SubmitButton data-confirm="contacts.merge.confirm" className="justify-self-start">
          {t("contacts.merge.submit")}
        </SubmitButton>
      </form>
    </Page>
  )
}

export const instant = false
