import { ExternalLinkIcon, SquareCodeIcon } from "lucide-react"
import { ActionSwitch } from "@/components/action-switch"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page"
import { RowGroup, SettingRow } from "@/components/section"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { apiCorePermissions, modules } from "@/modules/registry"
import { revokeApiKey, setAllowAi } from "./actions"
import { NewKey } from "./new-key"
import { Connections } from "../connections"

// Organisation › API: keys for the org's own tools (new key in a sheet, shown once), whether AI apps may connect, the
// apps connected so far. Revoked and expired keys only under "Alle".
export default async function ApiSettings({ searchParams }: PageProps<"/settings/api">) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const sp = await searchParams
  const all = param(sp, "all") === "1"
  const now = new Date().toISOString()
  const [{ data: org }, { data: keys }] = await Promise.all([
    ctx.supabase.from("orgs").select("allow_ai").eq("id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("api_keys").select("id, name, prefix, permissions, last_used_at, revoked_at, expires_at, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
  ])
  const live = (k: { revoked_at: string | null; expires_at: string | null }) => !k.revoked_at && !(k.expires_at && k.expires_at < now)
  const shown = (keys ?? []).filter((k) => all || live(k))
  // Only what the creator may do themselves (the action checks the same).
  const groups = [
    { module: "org", label: t("api.corePermissions"), perms: apiCorePermissions },
    ...modules.filter((m) => ctx.modules.has(m.key)).map((m) => ({ module: m.key, label: t.dynamic(`modules.${m.key}.name`), perms: m.permissions })),
  ]
    .map((g) => ({ ...g, perms: g.perms.filter((p) => ctx.can(p)).map((p) => ({ key: p, label: t.dynamic(`permissions.${p}`) })) }))
    .filter((g) => g.perms.length)
  const creating = param(sp, "new") === "key"

  return (
    <>
      <PageHeader
        icon={SquareCodeIcon}
        title={t("settings.tabs.api")}
        actions={
          <Button render={<a href="/api/docs" target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
            <ExternalLinkIcon /> {t("api.docs")}
          </Button>
        }
        primary={groups.length ? { href: withParams(sp, { new: "key" }), label: t("api.newKey") } : undefined}
      />
      <p className="px-1 text-sm text-muted-foreground">{t("api.intro")}</p>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {(keys ?? []).some((k) => !live(k)) && (
        <Segments
          label={t("api.keys")}
          items={[
            { href: withParams(sp, { all: undefined }), label: t("api.activeKeys"), current: !all },
            { href: withParams(sp, { all: "1" }), label: t("api.allKeys"), current: all },
          ]}
        />
      )}
      <DataTable
        rows={shown}
        rowKey={(k) => k.id}
        empty={groups.length ? t("api.empty") : t("api.noModules")}
        columns={[
          {
            header: t("api.name"),
            cell: (k) => (
              <span className="grid">
                <span className="font-medium">{k.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span>
              </span>
            ),
          },
          {
            header: t("api.permissions"),
            cell: (k) => <span title={k.permissions.map((p) => (t.has(`permissions.${p}`) ? t.dynamic(`permissions.${p}`) : p)).join(", ")}>{t("api.permCount", { count: k.permissions.length })}</span>,
          },
          { header: t("api.lastUsed"), cell: (k) => (k.last_used_at ? t.date(k.last_used_at, { dateStyle: "short", timeStyle: "short" }) : t("api.never")) },
          { header: t("api.expires"), cell: (k) => (k.expires_at ? t.date(k.expires_at, { dateStyle: "short" }) : t("api.expiresIn.0")) },
          {
            header: "",
            phone: "end",
            cell: (k) =>
              k.revoked_at ? (
                <Badge variant="secondary">{t("api.revokedBadge")}</Badge>
              ) : !live(k) ? (
                <Badge variant="secondary">{t("api.expiredBadge")}</Badge>
              ) : (
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <SubmitButton size="sm" variant="ghost" data-confirm="api.confirmRevoke" className="text-destructive hover:text-destructive">
                    {t("api.revoke")}
                  </SubmitButton>
                </form>
              ),
          },
        ]}
      />
      <RowGroup id="ai" title={t("settings.allowAi")}>
        <SettingRow label={t("settings.allowAiLabel")} hint={t("settings.allowAiShort")} info={t("settings.allowAiHint")}>
          <ActionSwitch checked={org?.allow_ai ?? true} label={t("settings.allowAiLabel")} action={setAllowAi} confirmOff="settings.confirmAiOff" />
        </SettingRow>
      </RowGroup>
      <Connections ctx={ctx} scope="org" back="/settings/api" />
      {creating && groups.length > 0 && (
        <UrlSheet params={["new"]} title={t("api.newKey")}>
          <NewKey groups={groups} />
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false
