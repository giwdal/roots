import { LinkRows } from "@/components/link-rows"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { areaSettings, settingsFor } from "@/settings/sections"
import { DesktopOpens } from "./desktop-opens"

// /settings: on phones the index (Du · Organisation as rows, each opens its page, like iOS Settings); from md the
// section nav beside the page is the index, so it opens Profil.
export default async function SettingsIndex() {
  const [ctx, t] = await Promise.all([getContext(), getT()])
  const groups = settingsFor(ctx.can, areaSettings((m) => ctx.modules.has(m), ctx.can).length > 0)
  return (
    <div className="grid gap-6 md:hidden">
      <DesktopOpens href="/settings/profile" />
      {groups.map((g) => (
        <section key={g.key} className="grid gap-2">
          <h2 className="px-1 text-sm font-medium">{t.dynamic(`settings.groups.${g.key}`)}</h2>
          <LinkRows rows={g.sections.map((s) => ({ key: s.key, href: `/settings/${s.key}`, icon: s.icon, title: t.dynamic(`settings.tabs.${s.key}`) }))} />
        </section>
      ))}
    </div>
  )
}

export const instant = false
