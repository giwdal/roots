import { ChevronRightIcon } from "lucide-react"
import { contactName } from "@/app/(app)/contacts/fields"
import { ContactPicker } from "@/components/contact-picker"
import { NewPage } from "@/components/new-page"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { saveMembership } from "../actions"
import { Field, MembershipFields, TYPE_COLS } from "../membership-parts"

// New member: an existing contact (?contact= preselects one) or a new person, then the membership.
export default async function NewMemberPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("members.manage")
  const t = await getT()
  const sp = await searchParams
  const contact = param(sp, "contact")
  const [{ data: types }, { data: preset }, defs] = await Promise.all([
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    contact && /^[0-9a-f-]{36}$/.test(contact)
      ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", contact).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadFields(ctx.supabase, ctx.org.id, "memberships"),
  ])
  return (
    <NewPage list={{ href: "/members", label: t("membership.nav") }} title={t("membership.new")} error={param(sp, "error")}>
      <form action={saveMembership} className="grid gap-6">
        <FormCard id="person" title={t("membership.person")}>
          <div className="max-w-xl">
            <ContactPicker name="contact_id" noCreate label={t("membership.existingContact")} initial={preset ? { id: preset.id, label: contactName(preset), detail: preset.email ?? "" } : null} />
          </div>
          {/* No contact yet: type the person here, they become a contact (a picked contact wins). */}
          <details open={!preset && !!param(sp, "error")} className="group grid gap-4">
            <summary className="inline-flex min-h-8 w-fit cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--link)] select-none hover:underline [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" aria-hidden /> {t("membership.newPerson")}
            </summary>
            <div className="mt-3 grid gap-4">
              <p className="text-xs text-muted-foreground">{t("membership.newContactHint")}</p>
              <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                <Field id="m-first" name="first_name" label={t("contacts.firstName")} maxLength={100} autoComplete="off" />
                <Field id="m-last" name="last_name" label={t("contacts.lastName")} maxLength={100} autoComplete="off" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-email">{t("contacts.email")}</Label>
                <TypedInput kind="email" id="m-email" name="email" autoComplete="off" />
              </div>
            </div>
          </details>
        </FormCard>
        <MembershipFields t={t} types={types ?? []} defs={defs} optional />
        <SaveBar label={t("membership.create")} always />
      </form>
    </NewPage>
  )
}

export const instant = false
