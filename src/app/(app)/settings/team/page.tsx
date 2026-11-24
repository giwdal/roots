import Link from "next/link"
import { UserMinusIcon, UsersIcon, XIcon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page"
import { Picture } from "@/components/picture"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { changeRole, removeMember, revokeInvite } from "./actions"
import { InviteForm } from "./invite-form"
import { InviteLink } from "./invite-link"

// Organisation › Team: who works in this org with which role (tap → role sheet, ⋯ remove), open invites; + invites.
export default async function TeamSettings({ searchParams }: PageProps<"/settings/team">) {
  const ctx = await requirePerm("org.members.manage")
  const sp = await searchParams
  const t = await getT()
  const db = ctx.supabase
  const roleFilter = param(sp, "role")

  const [{ data: members }, { data: roles }, { data: invites }] = await Promise.all([
    db.from("org_members").select("id, user_id, role_id, created_at").eq("org_id", ctx.org.id).order("created_at"),
    db.from("roles").select("id, name, is_owner, permissions").or(`org_id.is.null,org_id.eq.${ctx.org.id}`).order("is_owner", { ascending: false }).order("created_at"),
    db.from("invites").select("id, email, role_id, expires_at").eq("org_id", ctx.org.id).is("accepted_at", null).order("created_at"),
  ])
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, full_name, avatar_path")
    .in("id", members?.map((m) => m.user_id) ?? [])
  const profile = new Map(profiles?.map((p) => [p.id, p]))
  const roleName = new Map(roles?.map((r) => [r.id, t.pick(r.name)]))
  // Only owners can hand out the owner role.
  const assignable = roles?.filter((r) => ctx.role.is_owner || !r.is_owner).map((r) => ({ ...r, name: t.pick(r.name) })) ?? []
  // New people default to the role with the fewest permissions.
  const defaultRole = assignable.filter((r) => !r.is_owner).sort((a, b) => a.permissions.length - b.permissions.length)[0]
  const shown = (members ?? []).filter((m) => !roleFilter || m.role_id === roleFilter)

  const editing = members?.find((m) => m.id === param(sp, "edit"))
  const inviting = param(sp, "new") === "invite"
  const who = (userId: string) => profile.get(userId)?.full_name || profile.get(userId)?.email || "?"

  return (
    <>
      <PageHeader icon={UsersIcon} title={t("settings.tabs.team")} primary={{ href: withParams(sp, { new: "invite", edit: undefined }), label: t("members.invite") }} />
      <Notice error={!editing && !inviting ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      {roleFilter && roleName.has(roleFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button render={<Link href={withParams(sp, { role: undefined })} aria-label={`${roleName.get(roleFilter)} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
            {roleName.get(roleFilter)} <XIcon />
          </Button>
        </div>
      )}

      <DataTable
        rows={shown}
        rowKey={(m) => m.id}
        rowHref={(m) => withParams(sp, { edit: m.id, new: undefined })}
        empty={t("members.emptyMembers")}
        columns={[
          {
            header: t("members.person"),
            cell: (m) => {
              const p = profile.get(m.user_id)
              return (
                <span className="flex items-center gap-3">
                  <Picture path={p?.avatar_path} name={who(m.user_id)} />
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{who(m.user_id)}</span>
                    {p?.full_name && <span className="truncate text-xs text-muted-foreground">{p.email}</span>}
                  </span>
                </span>
              )
            },
          },
          { header: t("members.role"), cell: (m) => roleName.get(m.role_id) },
          { header: t("members.joined"), cell: (m) => t.date(m.created_at) },
        ]}
      />

      {(invites ?? []).length > 0 && (
        <Section id="invites" title={t("members.openInvites")}>
          <DataTable
            rows={invites ?? []}
            rowKey={(i) => i.id}
            empty={t("members.invitesEmpty")}
            columns={[
              { header: t("members.email"), cell: (i) => <span className="font-medium">{i.email}</span> },
              { header: t("members.role"), cell: (i) => roleName.get(i.role_id) },
              { header: t("members.expiresHeader"), cell: (i) => t.date(i.expires_at) },
              {
                header: "",
                className: "w-0 text-right",
                phone: "end",
                cell: (i) => (
                  <span className="flex items-center justify-end gap-1">
                    <InviteLink id={i.id} />
                    <form action={revokeInvite.bind(null, i.id)}>
                      <SubmitButton variant="ghost" size="sm" data-confirm="members.confirmRevoke" className="text-destructive hover:text-destructive">
                        {t("members.revoke")}
                      </SubmitButton>
                    </form>
                  </span>
                ),
              },
            ]}
          />
        </Section>
      )}

      {editing && (
        <UrlSheet
          params={["edit"]}
          title={who(editing.user_id)}
          description={profile.get(editing.user_id)?.email}
          menu={
            <ActionsMenu>
              <MenuSubmit form="remove-member" icon={<UserMinusIcon />} destructive confirm={editing.user_id === ctx.userId ? "members.confirmLeave" : "members.confirmRemove"}>
                {editing.user_id === ctx.userId ? t("account.leaveOrg") : t("members.remove")}
              </MenuSubmit>
            </ActionsMenu>
          }
        >
          <Notice error={param(sp, "error")} />
          <form id="remove-member" action={removeMember.bind(null, editing.id)} hidden />
          <form action={changeRole} className="grid gap-4">
            <input type="hidden" name="member_id" value={editing.id} />
            <div className="grid gap-2">
              <Label htmlFor="member-role">{t("members.role")}</Label>
              <Choice
                id="member-role"
                name="role_id"
                label={t("members.role")}
                required
                defaultValue={editing.role_id}
                options={(assignable.some((r) => r.id === editing.role_id) ? assignable : (roles ?? []).map((r) => ({ ...r, name: t.pick(r.name) }))).map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>
            <SaveBar />
          </form>
        </UrlSheet>
      )}

      {inviting && (
        <UrlSheet params={["new"]} title={t("members.dialogTitle")} description={t("members.dialogDescription")}>
          <InviteForm roles={assignable} defaultRoleId={defaultRole?.id} />
        </UrlSheet>
      )}
    </>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
