import Link from "next/link"
import { PlusIcon, SettingsIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NAV } from "@/modules/nav"
import { cn } from "@/lib/utils"
import { HeaderActions } from "@/components/header-actions"
import { PhoneMenu } from "@/components/actions-menu"
import { PrimaryAction } from "@/components/primary-action"
import { TopbarCrumbs } from "@/components/topbar-crumbs"

// The App's page anatomy (see /style/app): <Page> sets one of three widths, <PageHeader> is the same header everywhere,
// <RecordLayout> is a record page's two columns, <FormCard> groups fields by topic, <EmptyState> fills empty lists.

const WIDTH = { list: "max-w-6xl", record: "max-w-6xl", form: "max-w-3xl" }

/** list = lists, boards, calendars · record = a record's page (content + details column) · form = forms, setup, new. */
export function Page({ size = "list", className, children }: { size?: keyof typeof WIDTH; className?: string; children: React.ReactNode }) {
  // min-w-0 on every block: one wide child (a table, a calendar header) can never stretch the page past the screen.
  return <div className={cn("grid min-w-0 gap-6 *:min-w-0", WIDTH[size], className)}>{children}</div>
}

/**
 * Title row of every page. Right side, always in this order: `settings` (gear → the area's Einstellungen), `actions` (outline buttons, few), `menu` (the ⋯
 * <ActionsMenu> with import, export, trash, delete…), `primary` (the one filled button, "+ New …", key N).
 * `area` shows the area's icon from the nav (same icon as in the sidebar and ⌘K), `crumbs` the way back on record pages; with only `area` the crumb is built from the nav (Finanzen › Rechnungen).
 */
export function PageHeader({
  title,
  area,
  icon,
  crumbs,
  badge,
  meta,
  description,
  actions,
  menu,
  primary,
  settings,
  titleHidden,
}: {
  title: React.ReactNode
  area?: string
  icon?: LucideIcon // pages outside the nav areas (Dateien, Briefe)
  crumbs?: { href?: string; label: string }[]
  badge?: React.ReactNode
  meta?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  menu?: React.ReactNode
  primary?: { href: string; label: string; icon?: LucideIcon; more?: { href: string; label: string }[] } | React.ReactNode
  settings?: { href: string; label: string } | false
  titleHidden?: boolean // the page shows the title itself (an editor's title field): only for screen readers here
}) {
  const Icon = icon ?? (area ? NAV.find((a) => a.key === area)?.icon : undefined)
  // The title is already in the top bar: area pages (area › page) and pages whose last crumb is the title.
  // (pages with their own icon are in the sidebar too: Benachrichtigungen, Dateien …)
  const overview = !!(area || icon) && !crumbs
  // Record pages always show who/what they are in the page (title + badges + meta together, like Linear/Stripe), even
  // though the crumbs in the top bar end with the same name; only area overviews leave their title to the top bar.
  const inTopBar = overview || !!titleHidden
  const isLink = (p: unknown): p is { href: string; label: string; icon?: LucideIcon; more?: { href: string; label: string }[] } => !!p && typeof p === "object" && "href" in p && "label" in p
  const PrimaryIcon = isLink(primary) ? (primary.icon ?? PlusIcon) : null
  // Nothing to show in the page (title in the top bar, no badge/meta/description): the header takes no space at all.
  const bare = inTopBar && !badge && !meta && !(description && !overview)
  return (
    <header className={bare ? "contents" : "grid gap-3"}>
      {/* Where you are lives in the top bar (area › page, or a record's crumbs via <TopbarCrumbs>): no second crumb
          row and no area icon here; area pages keep their title only for screen readers, record pages show it. */}
      {crumbs && <TopbarCrumbs items={crumbs} />}
      <div className={bare ? "contents" : "flex flex-wrap items-start justify-between gap-x-4 gap-y-3"}>
        <div className={bare ? "sr-only" : "flex min-w-0 items-start gap-3"}>
          {Icon && (
            <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground", (area || icon || crumbs) && "hidden")} aria-hidden>
              <Icon className="size-5" />
            </span>
          )}
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={cn("font-heading text-xl font-semibold tracking-tight break-words md:text-2xl", inTopBar && "sr-only")}>{title}</h1>
              {badge}
            </div>
            {meta && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
            {/* Area pages speak for themselves (the top bar names them): no intro sentence; record pages may explain. */}
            {description && !overview && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {(actions || menu || primary || settings) && (
          <div className={cn("flex flex-wrap items-center gap-2 max-md:contents", bare && "contents")}>
            {/* Phones: one ⋯ in the top bar whose sheet holds the gear, the actions, the menu's items and a form-button primary. */}
            <HeaderActions
              phone={
                <PhoneMenu settings={settings || undefined} actions={actions || undefined} primary={!isLink(primary) && primary ? (primary as React.ReactNode) : undefined}>
                  {menu || undefined}
                </PhoneMenu>
              }
            >
            {settings && (
              <Tooltip>
                <TooltipTrigger render={<Button render={<Link href={settings.href} />} nativeButton={false} size="icon-sm" variant="ghost" aria-label={settings.label} />}>
                  <SettingsIcon />
                </TooltipTrigger>
                <TooltipContent>{settings.label}</TooltipContent>
              </Tooltip>
            )}
            {actions}
            {menu}
            </HeaderActions>
            {/* A link primary is the round button on phones (stays out of the top bar); a form button goes into the phone ⋯ sheet. */}
            <HeaderActions desktop={isLink(primary)} phone={isLink(primary) ? undefined : false}>
            {isLink(primary) && primary.more?.length ? (
              <PrimaryAction href={primary.href} label={primary.label} more={primary.more} icon={primary.icon} />
            ) : isLink(primary) && PrimaryIcon ? (
              // Phones: the round glass button next to the tab bar (MobileBar); from md the normal header button.
              <Button
                render={<Link href={primary.href} aria-label={primary.label} />}
                nativeButton={false}
                size="sm"
                data-shortcut="new"
                data-slot="page-primary"
                className="bar-hide max-md:glass max-md:fixed max-md:right-4 max-md:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] max-md:z-30 max-md:size-[3.625rem] max-md:rounded-full max-md:p-0 max-md:text-foreground"
              >
                <PrimaryIcon className="max-md:size-6" /> <span className="max-md:sr-only">{primary.label}</span>
              </Button>
            ) : (
              (primary as React.ReactNode)
            )}
            </HeaderActions>
          </div>
        )}
      </div>
    </header>
  )
}

/** A record page: content on the left, a details/related column on the right. */
export function RecordLayout({ aside, top, children }: { aside: React.ReactNode; top?: React.ReactNode /* Eigenschaften: top of the rail, before the main column on phones/tablets */; children: React.ReactNode }) {
  if (top)
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-1">{top}</aside>
        <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">{children}</div>
        <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-2">{aside}</aside>
      </div>
    )
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="grid min-w-0 gap-6">{children}</div>
      <aside className="grid min-w-0 gap-6">{aside}</aside>
    </div>
  )
}

/** Fields that belong together ("Adresse", "Bank & SEPA"), with an anchor id for deep links. */
export function FormCard({ id, title, description, action, className, children }: { id?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className={cn("scroll-mt-20", className)} aria-labelledby={id ? `${id}-h` : undefined}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle id={id ? `${id}-h` : undefined} role="heading" aria-level={2}>
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</CardContent>
    </Card>
  )
}

/** Nothing here yet: the area's icon, what this is, and the way to the first record. */
export function EmptyState({ area, icon, title, text, action }: { area?: string; icon?: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  const Icon = icon ?? (area ? NAV.find((a) => a.key === area)?.icon : undefined)
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon && (
        <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-5" />
        </span>
      )}
      <div className="grid max-w-sm gap-1">
        <p className="font-medium">{title}</p>
        {text && <p className="text-sm text-muted-foreground">{text}</p>}
      </div>
      {action}
    </div>
  )
}
