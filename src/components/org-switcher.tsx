"use client"

import Link from "next/link"
import { useTransition } from "react"
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { switchOrg } from "@/app/(app)/actions"
import { useT } from "@/i18n/client"
import { Picture } from "@/components/picture"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type Org = { id: string; name: string; logo_path?: string | null }

/**
 * Top of the sidebar: the active org. A menu to switch (and to create an org) only when there is something to switch
 * to; platform admins get every org, the ones they aren't a member of marked "Admin".
 */
export function OrgSwitcher({ orgs, current, memberOf }: { orgs: Org[]; current: Org; memberOf?: string[] }) {
  const t = useT()
  const [pending, start] = useTransition()
  if (orgs.length <= 1)
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex h-12 items-center gap-2 px-2 text-sm">
            <Picture path={current.logo_path} name={current.name} size="sm" square />
            <span className="flex-1 truncate font-medium">{current.name}</span>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" disabled={pending} className="data-popup-open:bg-sidebar-accent" />}>
            <Picture path={current.logo_path} name={current.name} size="sm" square />
            <span className="flex-1 truncate text-left font-medium">{current.name}</span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="max-h-96 w-(--anchor-width) min-w-56 overflow-y-auto">
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => o.id !== current.id && start(() => switchOrg(o.id))}>
                <Picture path={o.logo_path} name={o.name} size="sm" square />
                <span className="truncate">{o.name}</span>
                {o.id === current.id ? (
                  <span className="ml-auto text-xs text-muted-foreground">{t("shell.current")}</span>
                ) : (
                  memberOf && !memberOf.includes(o.id) && <span className="ml-auto text-xs text-muted-foreground">{t("shell.adminAccess")}</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/onboarding?new=1" />}>
              <PlusIcon /> {t("shell.newOrg")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
