import Link from "next/link"
import { ImageForm } from "@/components/image-form"
import { InlineField } from "@/components/inline-field"
import { Notice } from "@/components/notice"
import { RowGroup, SettingRow } from "@/components/section"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, ROOT_DOMAIN } from "@/lib/url"
import { patchOrg, updateLogo } from "./actions"

// Organisation › Allgemein: logo (tap to change), name (edited in place), the public address (changed under Website).
export default async function GeneralSettings({ searchParams }: PageProps<"/settings/general">) {
  const ctx = await requirePerm("org.settings.manage")
  const [t, sp, { data: org }] = await Promise.all([getT(), searchParams, ctx.supabase.from("orgs").select("logo_path").eq("id", ctx.org.id).single()])
  const address = ctx.org.site_domain ?? `${ctx.org.slug}.${ROOT_DOMAIN}`
  return (
    <div className="grid gap-8">
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <RowGroup id="org" title={t("general.org")}>
        <div className="px-4 py-3">
          <ImageForm action={updateLogo} id="logo" label={t("general.logo")} hint={t("general.logoHint")} name={ctx.org.name} path={org?.logo_path} square labelHidden />
        </div>
        <SettingRow label={t("general.name")}>
          <span className="min-w-48 text-right">
            <InlineField action={patchOrg} id={ctx.org.id} field="name" value={ctx.org.name} label={t("general.name")} />
          </span>
        </SettingRow>
        <SettingRow
          label={t("general.publicAddress")}
          hint={
            ctx.can("org.site.manage") ? (
              <Link href="/website/domain" className="link">
                {t("general.changeDomain")}
              </Link>
            ) : undefined
          }
        >
          <span className="font-mono text-sm text-muted-foreground">{address}</span>
        </SettingRow>
      </RowGroup>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
