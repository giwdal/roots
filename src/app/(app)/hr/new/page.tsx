import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { EmployeeForm } from "../employee-form"

// Personal › Neue Person: the HR record of an org member (?user=<id> pre-picks the member), created on "Person anlegen".
export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("hr.manage")
  const t = await getT()
  const sp = await searchParams
  const user = param(sp, "user")
  const { data: profile } = user && /^[0-9a-f-]{36}$/.test(user) ? await ctx.supabase.from("profiles").select("id, full_name, email").eq("id", user).maybeSingle() : { data: null }
  return (
    <NewPage list={{ href: "/hr", label: t("hr.tabs.people") }} title={t("hr.new")} error={param(sp, "error")}>
      <EmployeeForm t={t} member={profile ? { id: profile.id, label: profile.full_name || profile.email || "–", detail: profile.full_name ? (profile.email ?? undefined) : undefined } : null} />
    </NewPage>
  )
}

export const instant = false
