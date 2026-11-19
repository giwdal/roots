// The App's main navigation as one tree: areas with sub-pages, related modules under one heading. The sidebar shows
// it (only the current area expanded), the ⌘K search lists its pages. A child shows when its module is on and the
// person has its permission; an area shows when it has a visible child and opens its first one.
import {
  BarChart3Icon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ContactIcon,
  GlobeIcon,
  GraduationCapIcon,
  IdCardIcon,
  KanbanSquareIcon,
  KeyRoundIcon,
  ShoppingBagIcon,
  LandmarkIcon,
  MessagesSquareIcon,
  WorkflowIcon,
  CalendarIcon,
  FolderIcon,
  type LucideIcon,
} from "lucide-react"

// `gear`: the area's Einstellungen, opened by the header gear and listed in Settings › Bereiche and ⌘K, not in the sidebar.
// `setup`: a sidebar page that is setup too (templates, brand, domain), so Settings › Bereiche lists it as well.
type Child = { href: string; label: string; module: string | string[]; permission: string | string[]; gear?: true; setup?: true }
type Area = { key: string; label: string; icon: LucideIcon; children: Child[] }

export const NAV: Area[] = [
  {
    key: "calendar",
    label: "calendar.nav",
    icon: CalendarIcon,
    children: [{ href: "/calendar", label: "calendar.nav", module: ["events", "shifts", "hr", "projects", "rentals", "courses"], permission: ["events.view", "shifts.view", "hr.view", "projects.view", "rentals.view", "courses.view"] }],
  },
  {
    key: "contacts",
    label: "contacts.nav",
    icon: ContactIcon,
    children: [
      { href: "/contacts", label: "contacts.nav", module: "crm", permission: "crm.view" },
      { href: "/contacts/duplicates", label: "contacts.duplicates.nav", module: "crm", permission: "crm.view" },
    ],
  },
  {
    key: "members",
    label: "membership.nav",
    icon: IdCardIcon,
    children: [
      { href: "/members", label: "membership.tabs.members", module: "members", permission: "members.view" },
      { href: "/members/dues", label: "membership.tabs.dues", module: "members", permission: "members.view" },
      { href: "/members/settings", label: "common.settings", module: "members", permission: "members.manage", gear: true },
    ],
  },
  {
    key: "events",
    label: "nav.events",
    icon: CalendarDaysIcon,
    children: [
      { href: "/events", label: "eventsPage.nav", module: "events", permission: "events.view" },
      { href: "/guestlists", label: "guestlists.nav", module: "guestlists", permission: "guestlists.view" },
      { href: "/scan", label: "tickets.scanNav", module: ["tickets", "guestlists"], permission: ["tickets.scan", "guestlists.checkin"] },
    ],
  },
  {
    key: "shifts",
    label: "shifts.nav",
    icon: CalendarClockIcon,
    children: [
      // Plan opens the week plan, or Meine (/shifts/me, a view on Plan) for people with only the personal permission.
      { href: "/shifts", label: "shifts.tabs.plan", module: "shifts", permission: ["shifts.view", "shifts.self"] },
      { href: "/shifts/hours", label: "shifts.tabs.hours", module: "shifts", permission: "shifts.view" },
      { href: "/shifts/settings", label: "common.settings", module: "shifts", permission: "shifts.manage", gear: true },
      { href: "/shifts/team", label: "shifts.tabs.team", module: "shifts", permission: "shifts.manage", gear: true },
    ],
  },
  {
    key: "hr",
    label: "hr.nav",
    icon: BriefcaseBusinessIcon,
    children: [
      { href: "/hr", label: "hr.tabs.people", module: "hr", permission: "hr.view" }, // Liste · Organigramm (/hr/chart) as views
      { href: "/hr/absences", label: "hr.tabs.absences", module: "hr", permission: "hr.view" },
      { href: "/hr/payroll", label: "hr.tabs.payroll", module: "hr", permission: "hr.view" },
    ],
  },
  { key: "courses", label: "courses.nav", icon: GraduationCapIcon, children: [{ href: "/courses", label: "courses.nav", module: "courses", permission: "courses.view" }] },
  {
    key: "finance",
    label: "nav.finance",
    icon: LandmarkIcon,
    children: [
      { href: "/invoices", label: "invoices.nav", module: "invoices", permission: "invoices.view" },
      { href: "/payments", label: "payments.nav", module: "payments", permission: "payments.view" },
      { href: "/cashbook", label: "cashbook.nav", module: "cashbook", permission: "cashbook.view" },
      { href: "/invoices/settings", label: "common.settings", module: "invoices", permission: "invoices.manage", gear: true },
    ],
  },
  {
    key: "communication",
    label: "nav.communication",
    icon: MessagesSquareIcon,
    children: [
      { href: "/email", label: "nav.emails", module: "email", permission: "email.view" },
      { href: "/forms", label: "forms.nav", module: "forms", permission: "forms.view" },
      { href: "/email/settings", label: "email.settings.title", module: "email", permission: "email.view", gear: true },
      { href: "/email/settings#templates", label: "email.templates.title", module: "email", permission: "email.view", gear: true },
    ],
  },
  { key: "automations", label: "automations.nav", icon: WorkflowIcon, children: [{ href: "/automations", label: "automations.nav", module: "automations", permission: "automations.view" }] },
  {
    key: "projects",
    label: "projects.nav",
    icon: KanbanSquareIcon,
    children: [
      { href: "/projects", label: "projects.title", module: "projects", permission: "projects.view" },
      { href: "/projects/tasks", label: "projects.tasks", module: "projects", permission: "projects.view" },
      { href: "/projects/settings", label: "common.settings", module: "projects", permission: "projects.manage", gear: true },
    ],
  },
  {
    key: "rentals",
    label: "rentals.nav",
    icon: KeyRoundIcon,
    children: [
      { href: "/rentals", label: "rentals.objects", module: "rentals", permission: "rentals.view" },
      { href: "/rentals/list", label: "rentals.tabs.rentals", module: "rentals", permission: "rentals.view" },
    ],
  },
  {
    key: "shop",
    label: "store.nav",
    icon: ShoppingBagIcon,
    children: [
      { href: "/shop/orders", label: "store.orders", module: "shop", permission: "shop.view" },
      { href: "/shop", label: "store.products", module: "shop", permission: "shop.view" },
      { href: "/shop/settings", label: "common.settings", module: "shop", permission: "shop.manage", gear: true },
    ],
  },
  { key: "wiki", label: "wiki.nav", icon: BookOpenIcon, children: [{ href: "/wiki", label: "wiki.nav", module: "wiki", permission: "wiki.view" }] },
  // Dateien is core (no module): the org's files and the letter templates that produce them.
  {
    key: "files",
    label: "files.title",
    icon: FolderIcon,
    children: [
      { href: "/files", label: "files.title", module: "org", permission: "org.files.view" },
      { href: "/files/templates", label: "letters.tabs.templates", module: "org", permission: "org.files.view", setup: true },
    ],
  },
  { key: "reports", label: "reports.nav", icon: BarChart3Icon, children: [{ href: "/reports", label: "reports.nav", module: "reports", permission: "reports.view" }] },
  {
    key: "website",
    label: "website.nav",
    icon: GlobeIcon,
    children: [
      { href: "/website", label: "nav.overview", module: "org", permission: "org.site.manage" },
      { href: "/website/brand", label: "website.brand.nav", module: "org", permission: "org.site.manage", setup: true },
      { href: "/website/pages", label: "website.pages.nav", module: "org", permission: "org.site.manage" },
      { href: "/website/domain", label: "website.domain.nav", module: "org", permission: "org.site.manage", setup: true },
    ],
  },
]

/** The areas this person sees: visible children only, areas without any dropped. */
export function visibleNav(on: (module: string) => boolean, can: (perm: string) => boolean) {
  return NAV.map((a) => ({ ...a, children: a.children.filter((c) => [c.module].flat().some((m) => m === "org" || on(m)) && [c.permission].flat().some(can)) })).filter((a) => a.children.length) // "org" = core, always on; areas with no visible page drop out
}

/**
 * The area a module's own pages live in (Gästelisten → Events, Tickets → Events). Kalender shows many modules' dates
 * but is nobody's home, so it only counts when nothing else matches. `areas` = NAV or a visibleNav() result.
 */
export function areaOfModule<A extends { key: string; children: { module: string | string[] }[] } = Area>(module: string, areas: A[] = NAV as unknown as A[]): A | undefined {
  const has = (a: A) => a.children.some((c) => [c.module].flat().includes(module))
  return areas.find((a) => a.key !== "calendar" && has(a)) ?? areas.find(has)
}
