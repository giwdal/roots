import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { AreaIcon } from "@/components/area-icon"
import { RowGroup } from "@/components/section"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { areaOfModule, NAV, visibleNav } from "@/modules/nav"
import { getModule, modules } from "@/modules/registry"

// Organisation › Module: what this org has (switched on by the platform, /admin/orgs); an active module opens its area.
export default async function ModulesSettings() {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const name = (k: string) => t.dynamic(`modules.${k}.name`)
  const nav = visibleNav((m) => ctx.modules.has(m), ctx.can)
  // The area a module's pages live in (Gästelisten → Events), when this person may open it.
  const areaOf = (key: string) => areaOfModule(key, nav)
  const sorted = [...modules].sort((a, b) => Number(ctx.modules.has(b.key)) - Number(ctx.modules.has(a.key)))

  return (
    <RowGroup title={t("settings.tabs.modules")} description={t("modules.managedByPlatform")}>
      {sorted.map((m) => {
        const on = ctx.modules.has(m.key)
        const area = on ? areaOf(m.key) : undefined
        const icon = NAV.find((a) => a.key === area?.key)?.icon
        const needs = (m.requires?.modules ?? []).map((k) => name(getModule(k)?.key ?? k))
        const body = (
          <>
            {area && icon ? <AreaIcon area={area.key} icon={icon} className="size-8" /> : <span className="size-8 shrink-0" aria-hidden />}
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-medium">{name(m.key)}</span>
              <span className="text-xs text-muted-foreground">{t.dynamic(`modules.${m.key}.description`)}</span>
              {needs.length > 0 && <span className="text-xs text-muted-foreground">{t("modules.needs", { list: t.list(needs) })}</span>}
            </span>
            <Badge variant={on ? "success" : "secondary"}>{on ? t("modules.on") : t("modules.off")}</Badge>
          </>
        )
        return area ? (
          <Link key={m.key} href={area.children[0].href} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-muted active:bg-muted">
            {body}
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          <div key={m.key} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm data-[off=true]:opacity-70" data-off={!on}>
            {body}
            <span className="size-4 shrink-0" aria-hidden />
          </div>
        )
      })}
    </RowGroup>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
