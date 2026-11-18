import { CommandSearch } from "@/components/command-search"
import { cookies } from "next/headers"
import { AppSidebar, PageTitle, type Me, type SidebarLink } from "@/components/app-sidebar"
import { Shortcuts } from "@/components/shortcuts"
import { Separator } from "@/components/ui/separator"
import { ConfirmHost } from "@/components/confirm-submit"
import { KeyboardInset } from "@/components/keyboard-inset"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { MobileBar } from "@/components/mobile-bar"
import { MobileMenu } from "@/components/mobile-menu"
import { MenuButton } from "@/components/menu-button"
import { SproutButton, SproutProvider } from "@/components/sprout/context"
import { TopbarTitle } from "@/components/topbar-crumbs"
import { SproutPanel } from "@/components/sprout/panel"

// The one layout for signed-in areas (App + /admin): sidebar (drawer on phones, icons when collapsed) + top bar + content.
export async function AppShell({
  header,
  groups,
  me,
  title,
  search,
  orgId,
  bar,
  switchOrgs = false,
  children,
}: {
  header: React.ReactNode
  switchOrgs?: boolean // more than one org to choose from: the phone menu shows the org switcher
  groups: { label?: string; items: SidebarLink[] }[]
  me: Me
  title: string
  search?: boolean // ⌘K search over the active org (App only); also turns on Sprout, the assistant panel
  orgId?: string // the active org: Sprout starts fresh (setup, chat) when it changes
  bar?: React.ReactNode // replaces the page title in the top bar
  children: React.ReactNode
}) {
  // Open/collapsed is remembered in the sidebar_state cookie (set by the shadcn sidebar).
  const jar = await cookies()
  const open = jar.get("sidebar_state")?.value !== "false"
  return (
    <SproutProvider initial={search ? jar.get("sprout")?.value : undefined}>
    <SidebarProvider defaultOpen={open}>
      <AppSidebar header={header} groups={groups} me={me} search={search} />
      <SidebarInset className={search ? "min-w-0 max-md:[--mobile-bar:calc(4.75rem+env(safe-area-inset-bottom))] md:[--mobile-bar:0px]" : "min-w-0"}>
        <header className="sticky top-0 z-10 box-content flex h-12 shrink-0 pt-[env(safe-area-inset-top)] items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          {/* Phones: the sidebar is a drawer, so the trigger stays; from md the sidebar's edge toggles it. */}
          {/* The App's phones have the Menü tab in the bottom bar (opens a bottom sheet); the menu button shows only while that bar is hidden. */}
          {search ? <MenuButton /> : <SidebarTrigger className="-ml-1 md:hidden" />}
          <Separator orientation="vertical" className={`mr-1 data-vertical:h-4 md:hidden${search ? " bar-fallback" : ""}`} />
          {/* Where am I: the shown record page's crumbs (<TopbarCrumbs>) or the area › page title. */}
          <TopbarTitle groups={groups}>{bar ?? <PageTitle groups={groups} fallback={title} />}</TopbarTitle>
          {/* The page header's gear / actions / ⋯ / primary land here (<HeaderActions>). */}
          <div id="topbar-actions" className="flex shrink-0 items-center gap-2 empty:hidden" />
          {search && <SproutButton />}
        </header>
        <main className={`min-w-0 flex-1 max-md:overflow-x-clip px-4 pt-4 pb-6 md:px-6 md:pt-6 md:pb-8 lg:px-8${search ? " max-md:pb-[calc(var(--mobile-bar)+1rem)] bar-tight" : ""}`}>
          {children}
          <Shortcuts />
          <ConfirmHost />
          <KeyboardInset />
        </main>
        {search && <CommandSearch areas={groups.flatMap((g) => g.items).filter((i) => i.href !== "/" && i.href !== "/notifications")} />}
        {search && <MobileBar unread={groups.flatMap((g) => g.items).find((i) => i.href === "/notifications")?.count ?? 0} />}
        {search && <MobileMenu header={header} switchOrgs={switchOrgs} groups={groups} me={me} />}
      </SidebarInset>
      {search && <SproutPanel key={orgId} orgId={orgId ?? ""} />}
    </SidebarProvider>
    </SproutProvider>
  )
}
