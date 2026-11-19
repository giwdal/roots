import { APP_HOME } from "@/lib/url"
import { RefreshOnReturn } from "@/components/refresh-on-return"
import { HouseIcon, InboxIcon, SettingsIcon, ShieldIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { AreaIcon } from "@/components/area-icon"
import type { SidebarLink } from "@/components/app-sidebar"
import { OrgSwitcher } from "@/components/org-switcher"
import { getT } from "@/i18n/server"
import { getContext, getSession } from "@/lib/context"
import { visibleNav } from "@/modules/nav"
import { quickActions } from "@/lib/quick-actions"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const t = await getT()
  const [{ count: unread }, { data: me }, { data: myContact }, { data: allOrgs }] = await Promise.all([
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.supabase.from("profiles").select("full_name, avatar_path").eq("id", ctx.userId).maybeSingle(),
    // Linked to a contact of this org → "Mein Mitgliederbereich" in the user menu (members module on).
    ctx.modules.has("members") ? ctx.supabase.from("contacts").select("id").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
    // Platform admins switch between every org (unscoped session client: no x-org-id).
    ctx.isPlatformAdmin ? getSession().then((s) => s!.supabase.from("orgs").select("id, name, logo_path").is("deleted_at", null).order("name").limit(500)) : Promise.resolve({ data: null }),
  ])
  // Areas with their sub-pages (src/modules/nav.ts); an area opens its first sub-page.
  const moduleLinks: SidebarLink[] = visibleNav((m) => ctx.modules.has(m), ctx.can).map((a) => ({
    href: a.children[0].href,
    label: t.dynamic(a.label),
    icon: <AreaIcon area={a.key} icon={a.icon} />,
    children: a.children.filter((c) => !c.gear).map((c) => ({ href: c.href, label: t.dynamic(c.label) })),
  }))
  // Quick actions in the search (before typing): create the common things, open the door — only what this org and person can.
  const quick = quickActions((m) => ctx.modules.has(m), ctx.can, t).map(({ href, label }) => ({ href, label }))
  const groups = [
    {
      items: [
        { href: APP_HOME, label: t("shell.home"), icon: <HouseIcon /> },
        { href: "/notifications", label: t("inbox.title"), icon: <InboxIcon />, count: unread ?? 0 },
      ],
    },
    ...(moduleLinks.length ? [{ label: t("home.modules"), items: moduleLinks }] : []),
    {
      // Settings have their sections in a nav beside the page (grouped Du / Organisation), so a plain link here.
      label: t("general.org"),
      items: [
        { href: "/settings", label: t("shell.settings"), icon: <SettingsIcon /> },
        ...(ctx.isPlatformAdmin ? [{ href: "/admin", label: t("admin.link"), icon: <ShieldIcon /> }] : []),
      ],
    },
  ]

  return (
    <AppShell
      search
      orgId={ctx.org.id}
      header={<OrgSwitcher orgs={allOrgs ?? ctx.orgs} current={ctx.org} />}
      switchOrgs={(allOrgs ?? ctx.orgs).length > 1}
      groups={groups}
      quick={quick}
      me={{ name: me?.full_name || ctx.email, email: ctx.email, avatar: me?.avatar_path ?? null, memberArea: !!myContact }}
      title={ctx.org.name}
    >
      <RefreshOnReturn />
      {children}
    </AppShell>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
