import Link from "next/link"
import { notFound } from "next/navigation"
import { BriefcaseBusinessIcon, ClockIcon, ContactIcon, PlusIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { MultiSelect } from "@/components/multi-select"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { saveStaff, searchTeamCandidates } from "../actions"

// Schichten › Einstellungen › Team: who can be planned (organisation members). The sheet edits a person's terms for
// planning and links to their HR record, hours and contact. ?new=staff (&user=<id> pre-picks the member) / ?edit=<id>.
export default async function TeamPage({ searchParams }: PageProps<"/shifts/team">) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("shifts.manage")
  const userArg = param(sp, "user")
  const [{ data: staff }, { data: positions }, { data: prefill }] = await Promise.all([
    ctx.supabase.from("staff").select("*").eq("org_id", ctx.org.id).order("active", { ascending: false }).order("name"),
    ctx.supabase.from("positions").select("id, name").eq("org_id", ctx.org.id).order("position").order("name"),
    canManage && userArg && /^[0-9a-f-]{36}$/.test(userArg) ? ctx.supabase.from("profiles").select("id, full_name, email").eq("id", userArg).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const editing = canManage ? staff?.find((s) => s.id === param(sp, "edit")) : undefined
  const creating = canManage && param(sp, "new") === "staff"
  const posName = new Map(positions?.map((p) => [p.id, p.name]))
  const [{ data: employee }, { data: contact }] = editing
    ? await Promise.all([
        ctx.modules.has("hr") && ctx.can("hr.view") ? ctx.supabase.from("employees").select("id, job_title").eq("org_id", ctx.org.id).eq("staff_id", editing.id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
        ctx.modules.has("crm") && ctx.can("crm.view") ? ctx.supabase.from("contacts").select("id").eq("org_id", ctx.org.id).eq("user_id", editing.user_id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
      ])
    : [{ data: null }, { data: null }]
  const linked: LinkRow[] = editing
    ? [
        ...(employee ? [{ key: "hr", icon: BriefcaseBusinessIcon, href: `/hr/${employee.id}`, title: t("shifts.hrRecord"), detail: employee.job_title ?? undefined }] : []),
        { key: "hours", icon: ClockIcon, href: `/shifts/hours/${editing.id}`, title: t("shifts.tabs.hours"), detail: t("shifts.thisMonth") },
        ...(contact ? [{ key: "contact", icon: ContactIcon, href: `/contacts/${contact.id}`, title: t("shifts.contact"), detail: editing.email ?? undefined }] : []),
      ]
    : []
  const newHref = withParams(sp, { new: "staff", edit: undefined })

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: "/shifts", label: t("shifts.nav") }, { href: "/shifts/settings", label: t("common.settings") }, { label: t("shifts.tabs.team") }]}
        title={t("shifts.tabs.team")}
        primary={canManage ? { href: newHref, label: t("shifts.addStaff") } : undefined}
      />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <DataTable
        rows={staff ?? []}
        rowKey={(s) => s.id}
        rowHref={canManage ? (s) => withParams(sp, { edit: s.id, new: undefined }) : undefined}
        empty={
          <EmptyState
            area="shifts"
            title={t("shifts.noStaff")}
            text={t("shifts.noStaffText")}
            action={
              canManage && (
                <Button render={<Link href={newHref} />} nativeButton={false} size="sm">
                  <PlusIcon /> {t("shifts.addStaff")}
                </Button>
              )
            }
          />
        }
        columns={[
          {
            header: t("shifts.name"),
            cell: (s) => (
              <span className="grid">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {s.name} {!s.active && <Badge variant="secondary">{t("shifts.inactive")}</Badge>}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{s.email}</span>
              </span>
            ),
          },
          { header: t("shifts.roleLabel"), cell: (s) => s.role_label ?? "–" },
          { header: t("shifts.positions"), cell: (s) => (s.position_ids.length ? s.position_ids.map((p) => posName.get(p)).filter(Boolean).join(", ") : t("shifts.anyPosition")) },
          { header: t("shifts.targetHours"), cell: (s) => (s.target_hours != null ? `${t.number(Number(s.target_hours))} h` : "–"), className: "tabular-nums" },
        ]}
      />
      {(creating || editing) && (
        <UrlSheet params={["new", "edit", "user"]} title={editing?.name ?? t("shifts.addStaff")} meta={editing?.email}>
          <Notice error={param(sp, "error")} />
          <form action={saveStaff} className="grid gap-4">
            {editing ? (
              <input type="hidden" name="id" value={editing.id} />
            ) : (
              <div className="grid gap-1">
                <RecordPicker name="user" label={t("shifts.member")} search={searchTeamCandidates} initial={prefill ? { id: prefill.id, label: prefill.full_name || prefill.email || "–", detail: prefill.full_name ? (prefill.email ?? undefined) : undefined } : null} required />
                <p className="text-xs text-muted-foreground">
                  {t("shifts.memberHint")}{" "}
                  <Link href="/settings/team" className="text-[var(--link)] hover:underline">
                    {t("shifts.inviteLink")}
                  </Link>
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="st-role">{t("shifts.roleLabel")}</Label>
                <Input id="st-role" name="role_label" defaultValue={editing?.role_label ?? ""} maxLength={100} placeholder={t("shifts.rolePlaceholder")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="st-target">{t("shifts.targetHours")}</Label>
                <TypedInput kind="number" id="st-target" name="target_hours" min={0} max={999} step="any" defaultValue={editing?.target_hours ?? ""} />
              </div>
            </div>
            {(positions?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="st-pos">{t("shifts.canDo")}</Label>
                <MultiSelect id="st-pos" name="positions" options={(positions ?? []).map((p) => ({ value: p.id, label: p.name }))} defaultValue={editing?.position_ids ?? []} placeholder={t("shifts.anyPosition")} />
                <p className="text-xs text-muted-foreground">{t("shifts.canDoHint")}</p>
              </div>
            )}
            <label className="grid grid-cols-[auto_1fr] items-start gap-x-2 text-sm">
              <input type="checkbox" name="active" value="1" defaultChecked={editing?.active ?? true} className="mt-0.5 size-4 accent-primary" />
              {t("shifts.activeLabel")}
              <span className="col-start-2 text-xs text-muted-foreground">{t("shifts.activeHint")}</span>
            </label>
            <SaveBar label={editing ? undefined : t("shifts.addStaff")} always={!editing} />
          </form>
          {linked.length > 0 && (
            <section className="grid gap-2" aria-labelledby="st-linked">
              <h3 id="st-linked" className="text-sm font-medium">
                {t("shifts.linked")}
              </h3>
              <LinkRows rows={linked} />
            </section>
          )}
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
