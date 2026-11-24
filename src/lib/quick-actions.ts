import type { T } from "@/i18n/translate"

/** The common "create / open" shortcuts (search before typing, Start): only what this org has and this person may do. */
export function quickActions(on: (module: string) => boolean, can: (perm: string) => boolean, t: T) {
  return [
    { module: "crm", perm: "crm.manage", href: "/contacts/new", key: "newContact" },
    { module: "events", perm: "events.manage", href: "/events/new", key: "newEvent" },
    { module: "tickets", perm: "tickets.scan", href: "/scan", key: "scan" },
    { module: "members", perm: "members.manage", href: "/members/new", key: "newMembership" },
    { module: "invoices", perm: "invoices.manage", href: "/invoices/new", key: "newInvoice" },
    { module: "shop", perm: "shop.manage", href: "/shop/orders/new", key: "newOrder" },
    { module: "projects", perm: "projects.manage", href: "/projects/new", key: "newProject" },
    { module: "email", perm: "email.manage", href: "/email/new", key: "newCampaign" },
  ]
    .filter((a) => on(a.module) && can(a.perm))
    .map((a) => ({ href: a.href, label: t.dynamic(`search.actions.${a.key}`), module: a.module }))
}
