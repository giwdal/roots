import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { kindLabel, ObjectForm } from "../parts"

// New object; ?parent=<id>&kind=key preselect (from an object page's "Hinzufügen" sheet).
export default async function NewObjectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  const sp = await searchParams
  const parentId = param(sp, "parent")
  const [{ data: parent }, { data: locations }, defs] = await Promise.all([
    parentId && /^[0-9a-f-]{36}$/.test(parentId) ? ctx.supabase.from("rental_objects").select("id, name, kind").eq("id", parentId).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "rental_objects"),
  ])
  return (
    <NewPage list={parent ? { href: `/rentals/${parent.id}`, label: parent.name } : { href: "/rentals", label: t("rentals.objects") }} title={t("rentals.newObject")} error={param(sp, "error")}>
      <ObjectForm t={t} locations={locations ?? []} defs={defs} parent={parent ? { id: parent.id, label: parent.name, detail: kindLabel(t, parent.kind) } : null} kind={param(sp, "kind")} />
    </NewPage>
  )
}

export const instant = false
