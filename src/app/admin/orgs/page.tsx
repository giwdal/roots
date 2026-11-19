import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ActivityIcon, ArchiveRestoreIcon, BuildingIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Segments } from "@/components/segments"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePlatformAdmin } from "@/lib/context"
import { pageParam, param, ROOT_DOMAIN, withParams } from "@/lib/url"
import { addMember, createOrg, deleteOrg, openOrg, removeMember, restoreOrg, trashOrg, updateOrg } from "./actions"
import { disableModule, enableModule } from "./module-actions"
import { missingModules, modules } from "@/modules/registry"
import { Badge } from "@/components/ui/badge"
import { SubmitButton } from "@/components/submit-button"

export default async function AdminOrgs({ searchParams }: PageProps<"/admin/orgs">) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const sp = await searchParams
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const creating = param(sp, "new") === "org"
  const trash = param(sp, "trash") === "1"

  let query = supabase
    .from("orgs")
    .select("id, name, slug, created_at, deleted_at, org_members(count)")
    .order(trash ? "deleted_at" : "created_at", { ascending: false })
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []

  return (
    <Page>
      <PageHeader icon={BuildingIcon} title={t("admin.orgs.title")} primary={{ href: withParams(sp, { new: "org", edit: undefined }), label: t("admin.orgs.new") }} />
      <Notice error={!editId && !creating ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />
      <ListToolbar search={<SearchBox q={q} label={t("common.search")} keep={trash ? { trash: "1" } : undefined} />}>
        <Segments
          label={t("admin.orgs.title")}
          className="md:ml-auto"
          items={[
            { href: withParams(sp, { trash: undefined, page: undefined, edit: undefined }), label: t("admin.orgs.active"), current: !trash },
            { href: withParams(sp, { trash: "1", page: undefined, edit: undefined }), label: t("admin.trash.title"), current: trash },
          ]}
        />
      </ListToolbar>
      {trash && <p className="text-sm text-muted-foreground">{t("admin.trash.hint", { days: 30 })}</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={t("admin.orgs.empty")}
        columns={[
          { header: t("admin.orgs.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: t("admin.orgs.address"), cell: (r) => <span className="text-muted-foreground">{r.slug}</span> },
          { header: t("admin.orgs.members"), cell: (r) => t("roles.people", { count: r.org_members[0]?.count ?? 0 }), className: "tabular-nums" },
          trash
            ? { header: t("admin.trash.deletedAt"), cell: (r) => t.date(r.deleted_at!) }
            : { header: t("common.created"), cell: (r) => t.date(r.created_at) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {creating && (
        <UrlSheet params={["new"]} title={t("admin.orgs.new")}>
          <form action={createOrg} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            <div className="grid gap-2">
              <Label htmlFor="org-name">{t("admin.orgs.name")}</Label>
              <Input id="org-name" name="name" required maxLength={100} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-slug">{t("admin.orgs.address")}</Label>
              <Input id="org-slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" />
              <p className="text-xs text-muted-foreground">{t("onboarding.addressHelp")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-owner">{t("admin.orgs.owner")}</Label>
              <Input id="org-owner" name="owner" type="email" />
              <p className="text-xs text-muted-foreground">{t("admin.orgs.ownerHelp")}</p>
            </div>
            <SaveBar label={t("admin.orgs.new")} always />
          </form>
        </UrlSheet>
      )}

      {editId && <EditOrg t={t} orgId={editId} error={param(sp, "error")} ok={param(sp, "ok")} />}
    </Page>
  )
}

async function EditOrg({ t, orgId, error, ok }: { t: T; orgId: string; error?: string; ok?: string }) {
  const { supabase } = await requirePlatformAdmin()
  const [{ data: org }, { data: members }, { data: roles }, { data: mods }] = await Promise.all([
    supabase.from("orgs").select("id, name, slug, deleted_at").eq("id", orgId).maybeSingle(),
    supabase.from("org_members").select("id, user_id, roles(name)").eq("org_id", orgId).order("created_at"),
    supabase
      .from("roles")
      .select("id, name, is_owner")
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .order("is_owner", { ascending: false })
      .order("created_at"),
    supabase.from("org_modules").select("module_key").eq("org_id", orgId),
  ])
  const enabled = new Set(mods?.map((m) => m.module_key))
  if (!org) return null
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", members?.map((m) => m.user_id) ?? [])
  const profile = new Map(profiles?.map((p) => [p.id, p]))

  return (
    <UrlSheet
      params={["edit"]}
      title={org.name}
      description={`${org.slug}.${ROOT_DOMAIN}`}
      actions={
        org.deleted_at ? (
          <form action={restoreOrg.bind(null, org.id)}>
            <SubmitButton size="sm">
              <ArchiveRestoreIcon /> {t("admin.trash.restore")}
            </SubmitButton>
          </form>
        ) : (
          <form action={openOrg.bind(null, org.id)}>
            <SubmitButton size="sm" variant="outline">
              {t("admin.orgs.open")}
            </SubmitButton>
          </form>
        )
      }
      menu={
        <ActionsMenu>
          {!org.deleted_at && (
            <MenuLink href={`/admin/activity?org=${org.id}`} icon={<ActivityIcon />}>
              {t("admin.activity.title")}
            </MenuLink>
          )}
          {org.deleted_at ? (
            <MenuSubmit form="delete-org" icon={<Trash2Icon />} destructive confirm="admin.orgs.confirmDelete">
              {t("admin.trash.deleteNow")}
            </MenuSubmit>
          ) : (
            <MenuSubmit form="trash-org" icon={<Trash2Icon />} destructive confirm="admin.orgs.confirmTrash">
              {t("admin.trash.moveToTrash")}
            </MenuSubmit>
          )}
        </ActionsMenu>
      }
    >
      <Notice error={error} ok={ok} />
      <form id="delete-org" action={deleteOrg.bind(null, org.id)} hidden />
      <form id="trash-org" action={trashOrg.bind(null, org.id)} hidden />
      {org.deleted_at ? (
        <>
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("admin.trash.deletedOn", {
              date: t.date(org.deleted_at),
              purge: t.date(new Date(new Date(org.deleted_at).getTime() + 30 * 86_400_000)),
            })}
          </p>
        </>
      ) : (
        <>
          <section className="grid gap-3">
            <h3 className="font-medium">{t("admin.orgs.details")}</h3>
            <form action={updateOrg.bind(null, org.id)} className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">{t("admin.orgs.name")}</Label>
                <Input id="edit-name" name="name" defaultValue={org.name} required maxLength={100} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-slug">{t("admin.orgs.address")}</Label>
                <Input id="edit-slug" name="slug" defaultValue={org.slug} required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" />
              </div>
              <SaveBar />
            </form>
          </section>

          <section className="grid gap-3">
            <h3 className="font-medium">{t("admin.orgs.modules")}</h3>
            <ul className="grid divide-y rounded-lg border">
              {modules.map((m) => {
                const on = enabled.has(m.key)
                const extra = on ? [] : missingModules(m.key, enabled)
                return (
                  <li key={m.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {t.dynamic(`modules.${m.key}.name`)}
                        {on && <Badge variant="success">{t("modules.on")}</Badge>}
                      </span>
                      {extra.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t("admin.orgs.alsoNeeds", { list: t.list(extra.map((k) => t.dynamic(`modules.${k}.name`))) })}
                        </span>
                      )}
                    </span>
                    <form action={on ? disableModule.bind(null, org.id, m.key) : enableModule.bind(null, org.id, m.key)}>
                      <SubmitButton variant="outline" size="sm" data-confirm={on ? "admin.orgs.confirmModuleOff" : undefined}>
                        {on ? t("modules.turnOff") : t("modules.turnOn")}
                      </SubmitButton>
                    </form>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="grid gap-3">
            <h3 className="font-medium">{t("admin.orgs.members")}</h3>
            {members?.length ? (
              <ul className="grid divide-y rounded-lg border">
                {members.map((m) => {
                  const p = profile.get(m.user_id)
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{p?.full_name || p?.email}</span>
                        <span className="text-xs text-muted-foreground">{t.pick(m.roles?.name)}</span>
                      </span>
                      <form action={removeMember.bind(null, org.id, m.id)}>
                        <SubmitButton variant="ghost" size="sm" data-confirm="members.confirmRemove" className="text-destructive hover:text-destructive">
                          {t("members.remove")}
                        </SubmitButton>
                      </form>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.orgs.noMembers")}</p>
            )}
            <form action={addMember.bind(null, org.id)} className="grid gap-2 rounded-lg border p-3">
              <Label htmlFor="add-email">{t("admin.orgs.addMember")}</Label>
              <Input id="add-email" name="email" type="email" required placeholder={t("members.email")} />
              <Choice name="role_id" label={t("members.role")} required defaultValue={roles?.find((r) => !r.is_owner)?.id} options={(roles ?? []).map((r) => ({ value: r.id, label: t.pick(r.name) }))} />
              <SubmitButton variant="outline" className="justify-self-start">
                {t("admin.orgs.add")}
              </SubmitButton>
            </form>
          </section>
        </>
      )}
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
